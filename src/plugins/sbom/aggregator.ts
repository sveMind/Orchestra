import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  DEFAULT_AGGREGATE_OPTS,
  SbomAggregateOpts,
  SbomAggregateStats,
  SbomComponent,
  SbomComponentScope,
  SbomDocument,
  SbomEcosystem
} from './types';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'bin', 'obj',
  'target', '.venv', 'venv', '__pycache__', '.pytest_cache',
  '.idea', '.vscode', '.cache', '.next', '.nuxt', 'vendor'
]);

const walkRepo = (dirPath: string, onFile: (filePath: string) => void): void => {
  const stack = [dirPath];
  let visited = 0;
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    visited += 1;
    if (visited > 4000) break;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.github') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        onFile(full);
      }
    }
  }
};

const rel = (repoRoot: string, abs: string): string => path.relative(repoRoot, abs).replace(/\\/g, '/');
const sha1 = (s: string): string => crypto.createHash('sha1').update(s).digest('hex');

const PURL_ENCODE = (s: string): string => encodeURIComponent(s).replace(/%2F/g, '/').replace(/%3A/g, ':');

export const purlFor = (eco: SbomEcosystem, name: string, version: string | null): string => {
  const v = version ? `@${PURL_ENCODE(version)}` : '';
  switch (eco) {
    case 'npm': return `pkg:npm/${PURL_ENCODE(name)}${v}`;
    case 'pnpm': return `pkg:npm/${PURL_ENCODE(name)}${v}`;
    case 'yarn': return `pkg:npm/${PURL_ENCODE(name)}${v}`;
    case 'pip':
    case 'poetry':
    case 'pipenv':
    case 'conda':
      return `pkg:pypi/${PURL_ENCODE(name.replace(/_/g, '-').toLowerCase())}${v}`;
    case 'go': return `pkg:golang/${PURL_ENCODE(name)}${v}`;
    case 'cargo': return `pkg:cargo/${PURL_ENCODE(name)}${v}`;
    case 'gem': return `pkg:gem/${PURL_ENCODE(name)}${v}`;
    case 'composer': return `pkg:composer/${PURL_ENCODE(name)}${v}`;
    case 'maven':
    case 'gradle': {
      const idx = name.indexOf(':');
      if (idx > 0) {
        const g = PURL_ENCODE(name.slice(0, idx));
        const a = PURL_ENCODE(name.slice(idx + 1));
        return `pkg:maven/${g}/${a}${v}`;
      }
      return `pkg:maven/${PURL_ENCODE(name)}${v}`;
    }
    case 'nuget': return `pkg:nuget/${PURL_ENCODE(name)}${v}`;
    default: return `pkg:generic/${PURL_ENCODE(name)}${v}`;
  }
};

type Push = (c: SbomComponent) => void;

const readJSON = <T = unknown>(abs: string): T | null => {
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')) as T; }
  catch { return null; }
};

const parseNpmFamily = (
  repoRoot: string,
  ecosystem: 'npm' | 'yarn' | 'pnpm',
  packageJsonAbs: string,
  out: Push,
  errors: SbomDocument['errors'],
  opts: Required<SbomAggregateOpts>
): void => {
  const srcRel = rel(repoRoot, packageJsonAbs);
  const pj = readJSON<any>(packageJsonAbs);
  if (!pj || typeof pj !== 'object') { errors.push({ sourceRel: srcRel, message: 'invalid package.json' }); return; }
  const rootName = pj.name || '';
  const rootVersion = pj.version || '';
  const direct = new Set<string>();

  const pushFrom = (map: any, scope: SbomComponentScope) => {
    if (!map || typeof map !== 'object') return;
    for (const name of Object.keys(map)) {
      const spec = map[name];
      if (typeof spec !== 'string') continue;
      direct.add(name);
      out({
        name, version: null, ecosystem,
        purl: purlFor(ecosystem, name, null),
        sourceFileRel: srcRel,
        scope,
        direct: true,
        declaredDependencies: [],
        extra: { versionSpec: spec, rootName, rootVersion }
      });
    }
  };
  pushFrom(pj.dependencies, 'runtime');
  if (opts.includeTestDependencies) pushFrom(pj.devDependencies, 'development');
  pushFrom(pj.optionalDependencies, 'optional');
  pushFrom(pj.peerDependencies, 'runtime');

  // Resolve concrete versions from lockfile.
  const dir = path.dirname(packageJsonAbs);
  const lockCandidates = ecosystem === 'pnpm'
    ? [path.join(dir, 'pnpm-lock.yaml')]
    : ecosystem === 'yarn'
      ? [path.join(dir, 'yarn.lock'), path.join(dir, 'yarn.lock.cjs')]
      : [path.join(dir, 'package-lock.json')];
  if (ecosystem === 'npm') lockCandidates.push(path.join(dir, 'pnpm-lock.yaml'), path.join(dir, 'yarn.lock'));

  for (const lock of lockCandidates) {
    if (!fs.existsSync(lock)) continue;
    if (lock.endsWith('package-lock.json')) {
      const data = readJSON<any>(lock);
      if (data && data.packages && typeof data.packages === 'object') {
        for (const [key, val] of Object.entries<any>(data.packages)) {
          if (!key) continue;
          const parts = key.replace(/\\/g, '/').split('node_modules/');
          const name = parts[parts.length - 1];
          if (!name || !val || typeof val !== 'object') continue;
          const v: string | null = typeof val.version === 'string' ? val.version : null;
          out({
            name,
            version: v,
            ecosystem: 'npm',
            purl: purlFor('npm', name, v),
            license: typeof val.license === 'string'
              ? val.license
              : Array.isArray(val.license)
                ? (val.license as any[]).map(String).join(' OR ')
                : null,
            sourceFileRel: rel(repoRoot, lock),
            scope: val.dev === true ? 'development' : 'runtime',
            direct: direct.has(name),
            declaredDependencies: Array.isArray(val.dependencies)
              ? []
              : typeof val.dependencies === 'object'
                ? Object.entries(val.dependencies).map(([n, spec]) => ({ name: n, versionSpec: typeof spec === 'string' ? spec : undefined }))
                : [],
            extra: { resolved: typeof val.resolved === 'string' ? val.resolved : undefined }
          });
        }
      }
    } else if (lock.endsWith('.yaml')) {
      // pnpm-lock.yaml: try to read with crude parser (no yaml dep)
      const blocks = parsePnpmLockYaml(fs.readFileSync(lock, 'utf8'));
      for (const b of blocks) {
        out({
          name: b.name,
          version: b.version,
          ecosystem: 'pnpm',
          purl: purlFor('pnpm', b.name, b.version),
          sourceFileRel: rel(repoRoot, lock),
          scope: b.dev ? 'development' : 'runtime',
          direct: direct.has(b.name),
          declaredDependencies: b.deps.map(d => ({ name: d.name, versionSpec: d.spec })),
          extra: {}
        });
      }
    } else if (path.basename(lock) === 'yarn.lock') {
      const blocks = parseYarnLock1(fs.readFileSync(lock, 'utf8'));
      for (const b of blocks) {
        out({
          name: b.name,
          version: b.version,
          ecosystem: 'yarn',
          purl: purlFor('yarn', b.name, b.version),
          sourceFileRel: rel(repoRoot, lock),
          scope: 'unknown',
          direct: direct.has(b.name),
          declaredDependencies: [],
          extra: {}
        });
      }
    }
    break;
  }
};

type ParsedLockEntry = { name: string; version: string | null; dev: boolean; deps: Array<{ name: string; spec?: string }> };

const parsePnpmLockYaml = (text: string): ParsedLockEntry[] => {
  const out: ParsedLockEntry[] = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  let inSnapshots = false;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('packages:')) inSnapshots = true;
    if (inSnapshots) {
      const m = line.match(/^\s{2}(?:'([^']+)'|([^:\s][^:]*)):\s*$/);
      if (m) {
        const raw = m[1] || m[2] || '';
        const match = raw.match(/^\/?([^@]+)(?:@([^()]+?))?(?:\(.*\))?$/);
        if (match) {
          const [, name, version] = match;
          let dev = false;
          const deps: ParsedLockEntry['deps'] = [];
          let j = i + 1;
          while (j < lines.length && /^\s{4}/.test(lines[j])) {
            const body = lines[j].trim();
            if (/^dev:\s*true/.test(body)) dev = true;
            const dm = body.match(/^dependencies:\s*$/);
            if (dm) {
              let k = j + 1;
              while (k < lines.length && /^\s{6}/.test(lines[k])) {
                const dLine = lines[k].trim();
                const dmm = dLine.match(/^([A-Za-z0-9_.\-@/]+):\s*spec:\s*(\S+)/);
                if (dmm) deps.push({ name: dmm[1], spec: dmm[2] });
                else {
                  const bare = dLine.split(':')[0]?.trim();
                  if (bare) deps.push({ name: bare });
                }
                k++;
              }
            }
            j++;
          }
          out.push({ name, version: version || null, dev, deps });
        }
      }
    }
    i++;
  }
  return out;
};

const parseYarnLock1 = (text: string): ParsedLockEntry[] => {
  const out: ParsedLockEntry[] = [];
  const blocks = text.split(/\n(?=[A-Za-z`"'@])/);
  for (const block of blocks) {
    const firstLine = block.split('\n')[0] || '';
    const names: string[] = [];
    const nm = firstLine.matchAll(/(?:@[^"', ]+\/)?[^"', ]+/g);
    for (const match of nm) {
      let candidate = match[0].trim().replace(/^["']|["']:?$/g, '');
      if (!candidate || candidate.endsWith(':')) candidate = candidate.slice(0, -1);
      if (candidate.includes('@')) {
        const lastAt = candidate.lastIndexOf('@');
        if (lastAt > 0) candidate = candidate.slice(0, lastAt);
      }
      if (candidate && !names.includes(candidate)) names.push(candidate);
    }
    const vm = block.match(/\n\s*version\s+"?([^"\n]+)"?\s*\n/);
    const version = vm ? vm[1] : null;
    for (const name of names) {
      out.push({ name, version, dev: false, deps: [] });
    }
  }
  return out.filter(p => p.name && p.name !== '__metadata');
};

const parsePythonRequirements = (text: string): Array<{ name: string; version: string | null; direct: boolean; spec?: string }> => {
  const out: Array<{ name: string; version: string | null; direct: boolean; spec?: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-r ') || line.startsWith('-e ')) continue;
    const hashIdx = line.indexOf(' #');
    if (hashIdx > 0) line = line.slice(0, hashIdx).trim();
    const sep = line.search(/\[[^\]]+\]$/);
    if (sep > 0) line = line.slice(0, sep) + line.slice(line.lastIndexOf(']') + 1);
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*(?:([<>=!~]+)\s*([A-Za-z0-9_.\-+*]+?))?(?:[,;].*)?$/);
    if (!m) continue;
    const [, name, op, ver] = m;
    out.push({ name, version: op === '==' ? (ver || null) : null, direct: true, spec: op ? `${op}${ver || ''}` : undefined });
  }
  return out;
};

const parsePython = (repoRoot: string, abs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, abs);
  const base = path.basename(abs);
  try {
    if (base === 'requirements.txt' || /^requirements[-_]/.test(base) || base.endsWith('.txt') && abs.toLowerCase().includes('require')) {
      const items = parsePythonRequirements(fs.readFileSync(abs, 'utf8'));
      for (const it of items) {
        out({
          name: it.name, version: it.version, ecosystem: 'pip',
          purl: purlFor('pip', it.name, it.version),
          sourceFileRel: srcRel, scope: 'runtime',
          direct: it.direct,
          declaredDependencies: [],
          extra: { versionSpec: it.spec }
        });
      }
    } else if (base === 'Pipfile' || base === 'pyproject.toml' || base === 'poetry.lock') {
      const text = fs.readFileSync(abs, 'utf8');
      const eco: SbomEcosystem = base === 'Pipfile' ? 'pipenv' : base === 'poetry.lock' ? 'poetry' : 'poetry';
      // Regex TOML fragments: name = "version", or [[package]] blocks
      const blockRe = /\[\[package\]\]([\s\S]*?)(?=\[\[package\]\]|$)/g;
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(text)) !== null) {
        const body = m[1];
        const nm = body.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
        const vm = body.match(/^\s*version\s*=\s*["']([^"']+)["']/m);
        const cm = body.match(/^\s*category\s*=\s*["']([^"']+)["']/m);
        const scope: SbomComponentScope = cm && /dev|test/i.test(cm[1]) ? 'development' : 'runtime';
        if (nm) {
          out({
            name: nm[1],
            version: vm ? vm[1] : null,
            ecosystem: eco,
            purl: purlFor(eco, nm[1], vm ? vm[1] : null),
            sourceFileRel: srcRel, scope, direct: true,
            declaredDependencies: []
          });
        }
      }
      // Fallback: bare dependencies tables (pyproject.toml non-poetry projects)
      const sectionMatches = text.matchAll(/\[([^\]]+)\]/g);
      for (const sec of sectionMatches) {
        const header = sec[1];
        if (!/^(project\.dependencies|project\.optional\.dependencies|tool\.poetry\.dependencies|tool\.poetry\.dev-dependencies|tool\.poetry\.group\.dev\.dependencies)$/.test(header)) continue;
        const start = (sec.index || 0) + sec[0].length;
        const rest = text.slice(start);
        const end = rest.search(/\n\[/);
        const chunk = (end > 0 ? rest.slice(0, end) : rest).split('\n');
        for (const l of chunk) {
          const entry = l.match(/^\s*["']?([A-Za-z0-9_.-]+)["']?\s*=\s*["']?([^"'#,]+)["']?/);
          if (!entry) continue;
          const [, name, valRaw] = entry;
          const version = /^\d/.test(valRaw.trim()) ? valRaw.trim() : null;
          const scope: SbomComponentScope = /dev/.test(header) ? 'development' : 'runtime';
          out({
            name, version, ecosystem: 'poetry',
            purl: purlFor('poetry', name, version),
            sourceFileRel: srcRel, scope, direct: true,
            declaredDependencies: []
          });
        }
      }
    }
  } catch (e) {
    errors.push({ sourceRel: srcRel, message: String(e) });
  }
};

const parseGo = (repoRoot: string, goModAbs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, goModAbs);
  let moduleName = '';
  try {
    const gm = fs.readFileSync(goModAbs, 'utf8');
    const mm = gm.match(/^module\s+(\S+)/m);
    if (mm) moduleName = mm[1];
    for (const line of gm.split(/\r?\n/)) {
      const m = line.trim().match(/^(\S+)\s+([^\s]+)(?:\s+\/\/\s*indirect)?$/);
      if (m) {
        out({
          name: m[1],
          version: m[2],
          ecosystem: 'go',
          purl: purlFor('go', m[1], m[2]),
          sourceFileRel: srcRel, scope: 'runtime', direct: !/\/\/\s*indirect/.test(line),
          declaredDependencies: [],
          extra: { moduleName }
        });
      }
    }
    // Prefer go.sum for exact version list if present (it's the install plan)
    const sum = path.join(path.dirname(goModAbs), 'go.sum');
    if (fs.existsSync(sum)) {
      const seen = new Set<string>();
      for (const line of fs.readFileSync(sum, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^(\S+)\s+(v[^\s/]+)(?:\/go\.mod)?\s+/);
        if (!m) continue;
        const k = `${m[1]}@${m[2]}`;
        if (seen.has(k)) continue;
        seen.add(k);
      }
    }
  } catch (e) { errors.push({ sourceRel: srcRel, message: String(e) }); }
};

const parseCargo = (repoRoot: string, abs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, abs);
  const base = path.basename(abs);
  try {
    const text = fs.readFileSync(abs, 'utf8');
    if (base === 'Cargo.lock') {
      const blockRe = /\[\[package\]\]([\s\S]*?)(?=\[\[package\]\]|$)/g;
      let m: RegExpExecArray | null;
      while ((m = blockRe.exec(text)) !== null) {
        const body = m[1];
        const nm = body.match(/^\s*name\s*=\s*"([^"]+)"/m);
        const vm = body.match(/^\s*version\s*=\s*"([^"]+)"/m);
        if (nm && vm) {
          const deps: SbomComponent['declaredDependencies'] = [];
          const dm = body.match(/^\s*dependencies\s*=\s*\[(.*)\]/ms);
          if (dm) {
            const depNames = dm[1].match(/"([^"]+)"/g) || [];
            for (const d of depNames) deps.push({ name: d.slice(1, -1) });
          }
          out({
            name: nm[1], version: vm[1], ecosystem: 'cargo',
            purl: purlFor('cargo', nm[1], vm[1]),
            sourceFileRel: srcRel, scope: 'unknown',
            direct: false,
            declaredDependencies: deps
          });
        }
      }
    } else if (base === 'Cargo.toml') {
      for (const sec of ['[dependencies]', '[dev-dependencies]', '[build-dependencies]']) {
        const idx = text.indexOf(sec);
        if (idx < 0) continue;
        const after = text.slice(idx + sec.length);
        const end = after.search(/\n\[/);
        const chunk = (end > 0 ? after.slice(0, end) : after).split('\n');
        const scope: SbomComponentScope = sec === '[dependencies]' ? 'runtime' : 'development';
        for (const l of chunk) {
          const entry = l.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*(?:\{[^}]*version\s*=\s*"([^"]+)"[^}]*\}|"([^"]+)")/);
          if (!entry) continue;
          const [, name, v1, v2] = entry;
          const version = v1 || v2 || null;
          out({
            name, version, ecosystem: 'cargo',
            purl: purlFor('cargo', name, version),
            sourceFileRel: srcRel, scope, direct: true,
            declaredDependencies: []
          });
        }
      }
    }
  } catch (e) { errors.push({ sourceRel: srcRel, message: String(e) }); }
};

const parseGem = (repoRoot: string, abs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, abs);
  try {
    const text = fs.readFileSync(abs, 'utf8');
    if (path.basename(abs) === 'Gemfile.lock') {
      const specs = text.match(/GEM[\s\S]*?specs:\s*\n([\s\S]*?)(?=\n\n[A-Z]|$)/);
      if (specs) {
        for (const line of specs[1].split('\n')) {
          const m = line.match(/^\s{4}([A-Za-z0-9_.-]+)\s*\((\d[^\s)]*)\)/);
          if (m) {
            out({
              name: m[1], version: m[2], ecosystem: 'gem',
              purl: purlFor('gem', m[1], m[2]),
              sourceFileRel: srcRel, scope: 'runtime', direct: false,
              declaredDependencies: []
            });
          }
        }
      }
    } else if (path.basename(abs) === 'Gemfile') {
      for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim();
        const m = l.match(/^gem\s+['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?/);
        if (m) {
          const grpMatch = raw.match(/group\s*:\s*:?(\w+)/) || l.match(/:group\s*=>\s*:?(\w+)/) || l.match(/groups?:\s*\[:?(\w+)\]/);
          const scope: SbomComponentScope = grpMatch && /test|development|doc|assets/.test(grpMatch[1]) ? 'development' : 'runtime';
          out({
            name: m[1], version: m[2] || null, ecosystem: 'gem',
            purl: purlFor('gem', m[1], m[2] || null),
            sourceFileRel: srcRel, scope, direct: true, declaredDependencies: []
          });
        }
      }
    }
  } catch (e) { errors.push({ sourceRel: srcRel, message: String(e) }); }
};

const parseComposer = (repoRoot: string, abs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, abs);
  const base = path.basename(abs);
  try {
    if (base === 'composer.lock') {
      const data = readJSON<any>(abs);
      const arr = [
        ...((data && Array.isArray(data.packages)) ? data.packages : []),
        ...((data && Array.isArray(data['packages-dev'])) ? data['packages-dev'] : [])
      ];
      const isDev = (p: any) => ((data && Array.isArray(data['packages-dev'])) ? data['packages-dev'] : []).includes(p);
      for (const p of arr) {
        const scope: SbomComponentScope = isDev(p) ? 'development' : 'runtime';
        out({
          name: p.name, version: p.version, ecosystem: 'composer',
          purl: purlFor('composer', p.name, p.version),
          license: Array.isArray(p.license) ? (p.license as string[]).join(' OR ') : typeof p.license === 'string' ? p.license : null,
          sourceFileRel: srcRel, scope, direct: false,
          declaredDependencies: Object.keys(p.require || {}).map(n => ({ name: n, versionSpec: typeof p.require[n] === 'string' ? p.require[n] : undefined }))
        });
      }
    } else if (base === 'composer.json') {
      const data = readJSON<any>(abs);
      const pushBlock = (key: string, scope: SbomComponentScope) => {
        const block = data && data[key];
        if (!block || typeof block !== 'object') return;
        for (const [name, spec] of Object.entries<any>(block)) {
          const m = String(spec).match(/^([<>=!~^]*v?\d[^\s,]+|dev-[^\s]+)/);
          out({
            name, version: m ? m[1] : null, ecosystem: 'composer',
            purl: purlFor('composer', name, m ? m[1] : null),
            sourceFileRel: srcRel, scope, direct: true,
            declaredDependencies: [],
            extra: { versionSpec: typeof spec === 'string' ? spec : undefined }
          });
        }
      };
      pushBlock('require', 'runtime');
      pushBlock('require-dev', 'development');
    }
  } catch (e) { errors.push({ sourceRel: srcRel, message: String(e) }); }
};

const parseJava = (repoRoot: string, abs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, abs);
  const base = path.basename(abs);
  try {
    if (base === 'pom.xml') {
      const text = fs.readFileSync(abs, 'utf8');
      const tag = (name: string, inText: string): string | null => {
        const r = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i').exec(inText);
        return r ? r[1].trim() : null;
      };
      const depRe = /<dependency>([\s\S]*?)<\/dependency>/gi;
      let m: RegExpExecArray | null;
      while ((m = depRe.exec(text)) !== null) {
        const body = m[1];
        const gid = tag('groupId', body); const aid = tag('artifactId', body); const ver = tag('version', body); const sco = tag('scope', body);
        if (!gid || !aid) continue;
        const name = `${gid}:${aid}`;
        const scope: SbomComponentScope = sco && /test|provided/.test(sco) ? 'development' : 'runtime';
        out({
          name, version: ver, ecosystem: 'maven',
          purl: purlFor('maven', name, ver),
          sourceFileRel: srcRel, scope, direct: true, declaredDependencies: []
        });
      }
    } else if (/\.(gradle|gradle\.kts)$/.test(base)) {
      const text = fs.readFileSync(abs, 'utf8');
      const patterns = [
        /implementation\s+group:\s*'([^']+)',\s*name:\s*'([^']+)',\s*version:\s*'([^']+)'/g,
        /api\s+group:\s*'([^']+)',\s*name:\s*'([^']+)',\s*version:\s*'([^']+)'/g,
        /compileOnly\s+group:\s*'([^']+)',\s*name:\s*'([^']+)',\s*version:\s*'([^']+)'/g,
        /testImplementation\s+group:\s*'([^']+)',\s*name:\s*'([^']+)',\s*version:\s*'([^']+)'/g,
        /implementation\s+"?([^:"\s]+):([^:"\s]+):([^"\s]+)"?/g,
        /testImplementation\s+"?([^:"\s]+):([^:"\s]+):([^"\s]+)"?/g,
      ];
      for (const re of patterns) {
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(text)) !== null) {
          const [, g, a, v] = mm;
          const name = `${g}:${a}`;
          const dev = /testImplementation|compileOnly/.test(mm[0]);
          out({
            name, version: v, ecosystem: 'gradle',
            purl: purlFor('gradle', name, v),
            sourceFileRel: srcRel, scope: dev ? 'development' : 'runtime',
            direct: true, declaredDependencies: []
          });
        }
      }
    }
  } catch (e) { errors.push({ sourceRel: srcRel, message: String(e) }); }
};

const parseNuget = (repoRoot: string, abs: string, out: Push, errors: SbomDocument['errors']): void => {
  const srcRel = rel(repoRoot, abs);
  try {
    if (abs.endsWith('.csproj')) {
      const text = fs.readFileSync(abs, 'utf8');
      const re = /<PackageReference\s+(?:Include|Update)\s*=\s*"([^"]+)"\s+Version\s*=\s*"([^"]+)"/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        out({
          name: m[1], version: m[2], ecosystem: 'nuget',
          purl: purlFor('nuget', m[1], m[2]),
          sourceFileRel: srcRel, scope: 'runtime', direct: true, declaredDependencies: []
        });
      }
    } else if (path.basename(abs) === 'packages.lock.json') {
      const data = readJSON<any>(abs);
      if (data && data.libraries && typeof data.libraries === 'object') {
        for (const key of Object.keys(data.libraries)) {
          const [name, version] = key.split('/');
          if (!name) continue;
          const lib = data.libraries[key];
          const type = lib && lib.type;
          if (type && type.toLowerCase() !== 'package') continue;
          out({
            name, version: version || null, ecosystem: 'nuget',
            purl: purlFor('nuget', name, version || null),
            sourceFileRel: srcRel, scope: lib?.devDependency ? 'development' : 'runtime',
            direct: false, declaredDependencies: Object.keys(lib?.dependencies || {}).map(n => ({ name: n, versionSpec: typeof lib.dependencies[n] === 'string' ? lib.dependencies[n] : undefined }))
          });
        }
      }
    }
  } catch (e) { errors.push({ sourceRel: srcRel, message: String(e) }); }
};

export const aggregateSbom = (repoRoot: string, opts: SbomAggregateOpts = {}): SbomDocument => {
  const opt = { ...DEFAULT_AGGREGATE_OPTS, ...opts } as Required<SbomAggregateOpts>;
  const errors: SbomDocument['errors'] = [];
  const components: SbomComponent[] = [];
  const dedup = new Map<string, SbomComponent>();
  const push: Push = (c) => {
    const key = `${c.ecosystem}|${c.name}|${c.version ?? ''}|${c.sourceFileRel}|${c.scope}|${sha1(JSON.stringify(c.declaredDependencies || []))}`;
    const prev = dedup.get(key);
    if (!prev) {
      dedup.set(key, c);
      components.push(c);
      return;
    }
    // Upgrade versioned entry over versionless
    if (!prev.version && c.version) {
      prev.version = c.version;
      prev.purl = c.purl;
    }
    if (!prev.license && c.license) prev.license = c.license;
    if (!prev.direct && c.direct) prev.direct = true;
    prev.declaredDependencies = Array.from(new Map([
      ...(prev.declaredDependencies || []).map(d => [d.name, d] as const),
      ...(c.declaredDependencies || []).map(d => [d.name, d] as const)
    ]).values());
  };

  const processedPackageJsonDirs = new Set<string>();
  walkRepo(repoRoot, (abs) => {
    const base = path.basename(abs);
    const relPath = rel(repoRoot, abs);
    // Node/npm ecosystem
    if (base === 'package.json') {
      if (!opt.includeNestedNodeModules && relPath.includes('node_modules')) return;
      const dir = path.dirname(abs);
      if (processedPackageJsonDirs.has(dir)) return;
      processedPackageJsonDirs.add(dir);
      // Decide ecosystem based on adjacent lockfiles
      let eco: 'npm' | 'yarn' | 'pnpm' = 'npm';
      if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) eco = 'pnpm';
      else if (fs.existsSync(path.join(dir, 'yarn.lock'))) eco = 'yarn';
      parseNpmFamily(repoRoot, eco, abs, push, errors, opt);
      return;
    }
    // Python ecosystems
    if (base === 'requirements.txt' || /^requirements[-_].*\.txt$/.test(base) || base === 'Pipfile' || base === 'pyproject.toml' || base === 'poetry.lock') {
      parsePython(repoRoot, abs, push, errors);
      return;
    }
    if (base === 'go.mod') { parseGo(repoRoot, abs, push, errors); return; }
    if (base === 'Cargo.toml' || base === 'Cargo.lock') { parseCargo(repoRoot, abs, push, errors); return; }
    if (base === 'Gemfile' || base === 'Gemfile.lock') { parseGem(repoRoot, abs, push, errors); return; }
    if (base === 'composer.json' || base === 'composer.lock') { parseComposer(repoRoot, abs, push, errors); return; }
    if (base === 'pom.xml' || /\.(gradle|gradle\.kts)$/.test(base)) { parseJava(repoRoot, abs, push, errors); return; }
    if (base.endsWith('.csproj') || base === 'packages.lock.json') { parseNuget(repoRoot, abs, push, errors); return; }
  });

  const stats = buildStats(components);

  // Determine root name/version
  const rootPj = path.join(repoRoot, 'package.json');
  let rootName = path.basename(repoRoot) || 'unknown-project';
  let rootVersion: string | undefined;
  if (fs.existsSync(rootPj)) {
    const d = readJSON<any>(rootPj);
    if (d) { rootName = d.name || rootName; rootVersion = typeof d.version === 'string' ? d.version : undefined; }
  }

  const doc: SbomDocument = {
    generatedAt: new Date().toISOString(),
    tool: { name: 'orchestra-sbom', version: '1.0.0', vendor: 'orchestra' },
    rootName,
    rootVersion,
    components,
    stats,
    errors
  };
  return doc;
};

const buildStats = (components: SbomComponent[]): SbomAggregateStats => {
  const byEcosystem: SbomAggregateStats['byEcosystem'] = {};
  const byScope: SbomAggregateStats['byScope'] = {};
  const bySource = new Map<string, { fileRel: string; ecosystem: SbomEcosystem; count: number }>();
  const uniq = new Set<string>();
  let withLicenses = 0;
  let unknown = 0;
  for (const c of components) {
    byEcosystem[c.ecosystem] = (byEcosystem[c.ecosystem] || 0) + 1;
    byScope[c.scope] = (byScope[c.scope] || 0) + 1;
    const k = `${c.ecosystem}|${c.name}|${c.version ?? ''}`;
    uniq.add(k);
    if (c.license) withLicenses += 1;
    if (!c.version) unknown += 1;
    const sKey = `${c.sourceFileRel}::${c.ecosystem}`;
    const cur = bySource.get(sKey) || { fileRel: c.sourceFileRel, ecosystem: c.ecosystem, count: 0 };
    cur.count += 1;
    bySource.set(sKey, cur);
  }
  return {
    totalComponents: components.length,
    uniqueComponents: uniq.size,
    byEcosystem,
    byScope,
    withLicenses,
    unknownVersionCount: unknown,
    sources: Array.from(bySource.values()).sort((a, b) => b.count - a.count || a.fileRel.localeCompare(b.fileRel))
  };
};
