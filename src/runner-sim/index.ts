import fs from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { spawnSync } from 'child_process';

type Step = {
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};

type Job = {
  name?: string;
  env?: Record<string, string>;
  steps?: Step[];
  'runs-on'?: string;
};

type Workflow = {
  name?: string;
  on?: unknown;
  jobs?: Record<string, Job>;
};

const parseArgs = (argv: string[]) => {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    i += 1;
  }
  return out;
};

const interpolateSecrets = (value: string): string => {
  return value.replace(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/gi, (_m, name: string) => {
    return process.env[name] || '';
  });
};

const normalizeEnv = (env: Record<string, string> = {}): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    out[k] = interpolateSecrets(String(v ?? ''));
  }
  return out;
};

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, '-');

const execDocker = (args: string[], inheritStdio: boolean = true): string => {
  const res = spawnSync('docker', args, {
    stdio: inheritStdio ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    const out = [res.stdout, res.stderr].filter(Boolean).join('\n');
    throw new Error(out || `docker ${args.join(' ')} failed with exit code ${res.status}`);
  }
  return String(res.stdout || '').trim();
};

const dockerCreateContainer = (
  containerName: string,
  image: string,
  workdir: string,
  mountArgs: string[],
  env: Record<string, string>
) => {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  const output = execDocker(
    [
      'create',
      '--name',
      containerName,
      '--rm',
      '-w',
      workdir,
      ...mountArgs,
      ...envArgs,
      image,
      'sh',
      '-lc',
      'sleep infinity',
    ],
    false
  );
  if (!output) throw new Error('Failed to create docker container');
  return output.split('\n').pop() || containerName;
};

const dockerStart = (containerId: string) => execDocker(['start', containerId], false);
const dockerRemove = (containerId: string) => execDocker(['rm', '-f', containerId], false);
const dockerVolumeCreate = (volumeName: string) => execDocker(['volume', 'create', volumeName], false);
const dockerVolumeRemove = (volumeName: string) => execDocker(['volume', 'rm', '-f', volumeName], false);

const dockerExec = (containerId: string, cmd: string, env: Record<string, string>) => {
  const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
  execDocker(['exec', ...envArgs, containerId, 'sh', '-lc', cmd], true);
};

const dockerCpToContainer = (srcPath: string, containerId: string, destPath: string) => {
  execDocker(['cp', `${srcPath}${srcPath.endsWith(path.sep) ? '' : path.sep}.`, `${containerId}:${destPath}`], true);
};

const loadWorkflow = (workflowPath: string): Workflow => {
  const raw = fs.readFileSync(workflowPath, 'utf-8');
  const parsed = parseYaml(raw) as Workflow;
  if (!parsed || typeof parsed !== 'object') throw new Error(`Invalid workflow YAML: ${workflowPath}`);
  return parsed;
};

const listJobs = (workflow: Workflow) => {
  const jobs = workflow.jobs || {};
  const entries = Object.entries(jobs);
  if (entries.length === 0) {
    console.log('No jobs found.');
    return;
  }
  for (const [jobId, job] of entries) {
    const jobName = job?.name || jobId;
    const runner = job?.['runs-on'] || 'unknown';
    console.log(`${jobId}\t${jobName}\t${runner}`);
  }
};

const isSupportedUses = (uses: string) => {
  const base = uses.split('@')[0]?.toLowerCase();
  return base === 'actions/checkout' || base === 'actions/setup-node';
};

const pickPassthroughEnv = (input: NodeJS.ProcessEnv): Record<string, string> => {
  const allowed = [
    'OPENAI_API_KEY',
    'AI_MODEL',
    'AI_BASE_URL',
    'GITHUB_TOKEN',
    'VCS_PROVIDER',
    'ORCHESTRA_ROLE_ROUTING',
    'CI',
    'NODE_ENV',
  ];
  const out: Record<string, string> = {};
  for (const k of allowed) {
    const v = input[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
};

type WorkspaceMode = 'bind' | 'volume';

const resolveRepoRoot = (arg: unknown): string => {
  if (typeof arg === 'string' && arg.length > 0) return path.resolve(arg);
  if (fs.existsSync('/repo')) return '/repo';
  return process.cwd();
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolveRepoRoot(args.repo);
  const workflowPath = String(args.workflow || path.join(repoRoot, '.github', 'workflows', 'orchestra.yml'));
  const jobIdArg = args.job ? String(args.job) : '';
  const eventName = String(args.event || 'push');
  const workdir = String(args.workdir || '/repo');
  const image = String(args.image || 'node:20-bookworm-slim');
  const dryRun = Boolean(args['dry-run'] || args.dryRun);
  const listOnly = Boolean(args.list);
  const workspaceMode = String(args.workspace || 'volume') as WorkspaceMode;

  const absWorkflow = path.isAbsolute(workflowPath) ? workflowPath : path.resolve(process.cwd(), workflowPath);

  const workflow = loadWorkflow(absWorkflow);

  if (listOnly) {
    listJobs(workflow);
    return;
  }

  const jobs = workflow.jobs || {};
  const availableJobs = Object.keys(jobs);
  const jobId = jobIdArg || availableJobs[0] || '';
  if (!jobId || !jobs[jobId]) {
    throw new Error(`Job not found. Requested: "${jobId}". Available: ${availableJobs.join(', ')}`);
  }

  const job = jobs[jobId]!;
  const jobSteps = job.steps || [];

  const baseEnv: Record<string, string> = {
    ...pickPassthroughEnv(process.env),
    ...normalizeEnv(job.env || {}),
    GITHUB_EVENT_NAME: eventName,
    GITHUB_WORKSPACE: workdir,
    CI: 'true',
  };

  const runId = safeName(`${Date.now()}-${jobId}`);
  const containerName = `orchestra-runner-${runId}`;
  const volumeName = `orchestra-runner-workspace-${runId}`;
  let seederContainer: string | null = null;

  const mountArgs =
    workspaceMode === 'bind'
      ? ['-v', `${repoRoot}:${workdir}`]
      : ['-v', `${volumeName}:${workdir}`];

  if (workspaceMode === 'volume') {
    dockerVolumeCreate(volumeName);
    seederContainer = `orchestra-runner-seed-${runId}`;
    const seedId = dockerCreateContainer(seederContainer, 'alpine:3', workdir, ['-v', `${volumeName}:${workdir}`], {});
    dockerStart(seedId);
    dockerCpToContainer(repoRoot, seedId, workdir);
    dockerRemove(seedId);
    seederContainer = null;
  }

  const containerId = dockerCreateContainer(containerName, image, workdir, mountArgs, baseEnv);

  try {
    dockerStart(containerId);

    for (let i = 0; i < jobSteps.length; i += 1) {
      const step = jobSteps[i]!;
      const stepLabel = step.name || step.run || step.uses || `step-${i + 1}`;
      if (step.uses) {
        if (!isSupportedUses(step.uses)) {
          throw new Error(`Unsupported "uses" step: ${step.uses}`);
        }
        continue;
      }
      if (step.run) {
        const stepEnv = normalizeEnv(step.env || {});
        if (dryRun) {
          console.log(`[dry-run] ${stepLabel}`);
          continue;
        }
        dockerExec(containerId, step.run, stepEnv);
        continue;
      }
    }
  } finally {
    dockerRemove(containerId);
    if (seederContainer) {
      try {
        dockerRemove(seederContainer);
      } catch {
      }
    }
    if (workspaceMode === 'volume') {
      try {
        dockerVolumeRemove(volumeName);
      } catch {
      }
    }
  }
};

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  process.exitCode = 1;
});
