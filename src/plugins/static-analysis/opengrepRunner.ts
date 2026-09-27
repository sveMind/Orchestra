import { execSync, exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface OpengrepFinding {
  check_id?: string;
  rule_id?: string;
  path?: string;
  start?: { line?: number; col?: number };
  end?: { line?: number; col?: number };
  extra?: {
    message?: string;
    severity?: string;
    metadata?: Record<string, any>;
    lines?: string;
    metavars?: Record<string, any>;
    fix?: string;
    fix_regex?: Record<string, any>;
  };
  severity?: string;
  message?: string;
  lines?: string;
  file?: string;
}

export interface OpengrepError {
  type?: string;
  level?: string;
  message?: string;
  code?: number;
  spans?: Array<{ file?: string; start?: { line?: number }; end?: { line?: number } }>;
  details?: string;
  short_msg?: string;
  long_msg?: string;
}

export interface OpengrepStats {
  scannedFiles: number;
  totalRules: number;
  findingsCount?: number;
  parseCount?: number;
  matchTime?: number;
  rulesWithErrors?: number;
}

export interface OpengrepResult {
  results: OpengrepFinding[];
  errors: OpengrepError[];
  stats: OpengrepStats;
  version?: string;
}

const BINARY_CANDIDATES = ['opengrep', 'semgrep'];

const CANDIDATE_FIXED_PATHS: string[] = [];

const whichBinary = (): string | null => {
  const envOverride = process.env.OPENGREP_BIN || process.env.SEMGREP_BIN;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;

  for (const bin of BINARY_CANDIDATES) {
    try {
      const out = execSync(`command -v ${bin}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const p = out.trim();
      if (p && fs.existsSync(p)) return p;
    } catch {
      // not found on PATH, try next
    }
  }

  for (const p of CANDIDATE_FIXED_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

const ensureBinary = (): string => {
  const bin = whichBinary();
  if (bin) return bin;
  throw new Error(
    'opengrep (or semgrep) binary not found. Install with:\n' +
    '  curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash\n' +
    'Or point OPENGREP_BIN env variable at the binary.\n' +
    'See https://github.com/opengrep/opengrep for instructions.'
  );
};

const ensureSandboxHome = (): { home: string; cache: string } => {
  const base = path.join(os.tmpdir(), 'orchestra-opengrep');
  const home = path.join(base, 'home');
  const cache = path.join(base, 'cache');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  return { home, cache };
};

const createDefaultRulesDir = (): string => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opengrep-rules-'));
  return tmp;
};

const DEFAULT_RULES_YAML = `rules:
  - id: typescript-eval
    patterns:
      - pattern: eval($X)
    message: "Avoid eval() - can introduce security vulnerabilities"
    languages: [typescript, javascript]
    severity: ERROR
  - id: typescript-console-log-in-src
    pattern-regex: console\\.(log|debug|info)\\s*\\(
    message: "Remove console.log/debug/info from production code"
    languages: [typescript, javascript]
    severity: WARNING
  - id: python-avoid-banned-api
    patterns:
      - pattern-either:
          - pattern: pickle.loads(...)
          - pattern: pickle.load(...)
          - pattern: yaml.load(...)
    message: "Unsafe deserialization can lead to remote code execution"
    languages: [python]
    severity: ERROR
  - id: sql-injection-patterns
    patterns:
      - pattern-either:
          - pattern: $DB.query($FSTR + $USERINPUT, ...)
          - pattern: $DB.execute($FSTR + $USERINPUT, ...)
      - pattern-regex: (SELECT|INSERT|UPDATE|DELETE).*\\$\\{|\\}.*(FROM|INTO|TABLE|WHERE)
    message: "Potential SQL injection - use parameterized queries / prepared statements"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: ERROR
  - id: hardcoded-secrets
    patterns:
      - pattern-either:
          - pattern: $SECRET = "=~/^AKIA[0-9A-Z]{16}/"
          - pattern: password = "$S"
          - pattern: secret = "$S"
          - pattern: apiKey = "$S"
          - pattern: privateKey = "$S"
          - pattern: jwtSecret = "$S"
    message: "Potential hardcoded secret detected - use environment variables or secrets manager"
    languages: [typescript, javascript, python, go, java, ruby, php, csharp, rust]
    severity: ERROR
  - id: xss-dangerous-innerhtml
    patterns:
      - pattern: $EL.innerHTML = $SRC
      - pattern: document.write($SRC)
    message: "Potential XSS via raw HTML injection - sanitize inputs or use textContent"
    languages: [typescript, javascript]
    severity: WARNING
  - id: rust-unchecked-unwrap
    pattern: $EXPR.unwrap()
    message: "unwrap() may panic - prefer expect() with context or proper error handling"
    languages: [rust]
    severity: WARNING
  - id: c-cpp-banned-functions
    patterns:
      - pattern-either:
          - pattern: gets($X)
          - pattern: strcpy($A, $B)
          - pattern: strcat($A, $B)
          - pattern: sprintf($A, $FMT, ...)
          - pattern: system($CMD)
    message: "Unsafe C/C++ function - use bounded/safer alternatives"
    languages: [c, c++, cpp]
    severity: ERROR
  - id: go-missing-error-check
    patterns:
      - pattern: $FUNC(...)
      - metavariable-regex:
          $FUNC: (?!must|panic|log|print|fmt)
      - pattern-not: $RESULT, $ERR := $FUNC(...)
      - pattern-not: _ = $FUNC(...)
      - pattern-not-inside: if $ERR != nil { ... }
    message: "Potentially ignoring an error-returning function call"
    languages: [go]
    severity: WARNING
  - id: insecure-random
    patterns:
      - pattern-either:
          - pattern: Math.random()
          - pattern: new Random().nextInt(...)
          - pattern: random.randint(...)
          - pattern: rand.Intn(...)
    message: "Use cryptographically secure random generator for security contexts"
    languages: [typescript, javascript, java, python, go]
    severity: WARNING
  - id: insecure-redirect
    patterns:
      - pattern: Response.redirect($URL, ...)
      - pattern: res.redirect($URL)
      - pattern: header("Location: " . $URL)
    message: "Unvalidated redirect - validate URL against allowed list"
    languages: [typescript, javascript, php]
    severity: WARNING
  - id: open-redirect
    pattern-regex: (redirect|location|location\\.href)\\s*[=:]\\s*request\\.(query|params)\\["?.*(url|redirect|next|return)
    message: "Open redirect risk - validate redirect target against allowlist"
    languages: [typescript, javascript, python, ruby, php]
    severity: WARNING
  - id: path-traversal
    patterns:
      - pattern: fs.readFileSync($P + $USER, ...)
      - pattern: fs.readFile($P + $USER, ...)
      - pattern: open($PATH + $USER, ...)
    message: "Potential path traversal risk - normalize and validate paths against base directory"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: WARNING
  - id: jwt-none-algo
    pattern-regex: algorithm.*(none|NONE|None)
    message: "JWT 'none' algorithm allows token forgery - enforce algorithm whitelist"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: ERROR
  - id: overly-broad-cors
    patterns:
      - pattern-regex: (Access-Control-Allow-Origin).*(\\*|all)
      - pattern: res.setHeader($H, "*")
      - pattern: header("Access-Control-Allow-Origin: *")
    message: "Overly permissive CORS - restrict Access-Control-Allow-Origin"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: WARNING
  - id: regex-dos-catastrophic
    pattern-regex: \(\?\?|\\[.*\]\*\)|\+\)\*|\\\\1\?\?\)\*)
    message: "Potential ReDoS pattern - audit regex for catastrophic backtracking"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: WARNING
  - id: timing-attack-string-compare
    patterns:
      - pattern: $A == $B
      - metavariable-pattern:
          $A:
            pattern-regex: (password|secret|token|hash|signature)
    message: "Use constant-time comparison for secrets to mitigate timing attacks"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: WARNING
  - id: permission-0777-chmod
    patterns:
      - pattern: chmod($P, 0o777)
      - pattern: chmod($P, 0777)
      - pattern: fs.chmodSync($P, 0o777)
      - pattern: fs.chmod($P, 0o777)
    message: "Overly permissive file permissions - use minimal required access"
    languages: [python, typescript, javascript, go, php]
    severity: WARNING
  - id: race-condition-toctou
    patterns:
      - pattern: if (fs.existsSync($P)) { ... fs.readFileSync($P) ... }
    message: "Time-of-check to time-of-use (TOCTOU) race - use atomic APIs"
    languages: [typescript, javascript, python]
    severity: WARNING
  - id: ssrf-patterns
    patterns:
      - pattern: fetch($USER_URL, ...)
      - pattern: axios.get($USER_URL, ...)
      - pattern: requests.get($USER_URL, ...)
      - pattern: http.get($USER_URL, ...)
    message: "Potential SSRF risk - validate URLs against internal networks and allow schemes"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: WARNING
  - id: exposed-env-leak
    patterns:
      - pattern: process.env[$KEY]
      - pattern: os.environ[$KEY]
      - pattern: System.getenv($KEY)
      - pattern: getenv($KEY)
    message: "Reading environment variable - ensure secrets are never logged or exposed in responses"
    languages: [typescript, javascript, python, go, java, ruby, php]
    severity: INFO
  - id: deprecated-fs-readdirsync-root
    patterns:
      - pattern: fs.readdirSync("/")
      - pattern: fs.readdir("/")
    message: "Reading root directory is unusual - verify intent"
    languages: [typescript, javascript]
    severity: INFO
`;

const writeDefaultRules = (dir: string): string => {
  const rulesPath = path.join(dir, 'orchestra-default-rules.yaml');
  fs.writeFileSync(rulesPath, DEFAULT_RULES_YAML, 'utf8');
  return rulesPath;
};

const parseJsonOutput = (raw: string): OpengrepResult => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { results: [], errors: [], stats: { scannedFiles: 0, totalRules: 0 } };
  }
  try {
    const parsed = JSON.parse(trimmed);
    const results: OpengrepFinding[] = Array.isArray(parsed.results) ? parsed.results : [];
    const errors: OpengrepError[] = Array.isArray(parsed.errors) ? parsed.errors : [];
    const pathsScanned = parsed.paths_scanned ?? {};
    const stats: OpengrepStats = {
      scannedFiles: Number(
        typeof pathsScanned === 'object' && pathsScanned !== null
          ? (pathsScanned as any).scanned ?? (pathsScanned as any).files_with_results ?? 0
          : parsed.stats?.filesWithResults ?? parsed.scannedFiles ?? 0
      ),
      totalRules: Number(parsed.stats?.rules ?? parsed.rules ?? parsed.totalRules ?? 0),
      findingsCount: Number(parsed.stats?.findings ?? results.length ?? 0),
    };
    return {
      results,
      errors,
      stats,
      version: parsed.version,
    };
  } catch (_e) {
    return {
      results: [],
      errors: [{ type: 'parse', level: 'error', message: 'Failed to parse opengrep JSON output', details: String(_e) }],
      stats: { scannedFiles: 0, totalRules: 0 },
    };
  }
};

export const runOpengrepScan = async (
  target: string,
  rulesPath?: string
): Promise<OpengrepResult> => {
  const binary = ensureBinary();
  const cwd = process.cwd();
  const sandbox = ensureSandboxHome();

  let effectiveRules = rulesPath;
  let cleanupTmpDir: string | null = null;
  if (!effectiveRules) {
    cleanupTmpDir = createDefaultRulesDir();
    effectiveRules = writeDefaultRules(cleanupTmpDir);
  }

  if (!fs.existsSync(effectiveRules)) {
    if (cleanupTmpDir) tryCleanup(cleanupTmpDir);
    throw new Error(`Rules path does not exist: ${effectiveRules}`);
  }

  const targetExists = fs.existsSync(target);
  if (!targetExists) {
    if (cleanupTmpDir) tryCleanup(cleanupTmpDir);
    throw new Error(`Target path does not exist: ${target}`);
  }

  const isDir = fs.lstatSync(target).isDirectory();
  const scanTarget = isDir ? target : path.dirname(target);

  const execEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: sandbox.home,
    XDG_CACHE_HOME: sandbox.cache,
    OPENGREP_HOME: sandbox.home,
    SEMGREP_IN_DOCKER: '0',
    SEMGREP_VERSION_CHECK: '0',
  };

  const args: string[] = [
    binary,
    'scan',
    '--json',
    '--no-rewrite-rule-ids',
    `--config=${effectiveRules}`,
  ];
  if (!isDir) {
    args.push(`--include=${path.basename(target)}`);
  }
  args.push(scanTarget);

  const cmd = args.map(a => {
    if (/[\s"']/.test(a)) return `"${a.replace(/"/g, '\\"')}"`;
    return a;
  }).join(' ');

  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { cwd, env: execEnv, maxBuffer: 50 * 1024 * 1024, timeout: 10 * 60 * 1000 },
      (err, stdout, stderr) => {
        if (cleanupTmpDir) tryCleanup(cleanupTmpDir);
        if (err && (!stdout || stdout.trim().length === 0)) {
          const hint = stderr && stderr.trim().length > 0 ? `\nstderr: ${stderr.trim().slice(0, 2000)}` : '';
          reject(new Error(`opengrep exited with code ${(err as any).code ?? 'unknown'}${hint}`));
          return;
        }
        const parsed = parseJsonOutput(stdout || '');
        if (stderr && stderr.trim().length > 0 && parsed.errors.length === 0) {
          parsed.errors.push({ type: 'stderr', level: 'warning', message: stderr.trim().slice(0, 4000) });
        }
        resolve(parsed);
      }
    );
  });
};

const tryCleanup = (dir: string): void => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
};
