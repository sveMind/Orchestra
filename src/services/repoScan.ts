import fs from 'fs';
import path from 'path';

export type NativeBuildKind = 'cmake' | 'make' | 'meson' | 'bazel' | 'unknown' | 'none';

export type NodeApiHints = {
  bin: string[];
  exports: string[];
  main: string;
  types: string;
  scripts: string[];
};

export type AppType = 'fullstack' | 'backend' | 'frontend' | 'embedded' | 'native' | 'cli' | 'library' | 'unknown';

export type DetectedArea = {
  detected: boolean;
  kinds: string[];
  files: string[];
};

export type ApiEndpointHint = {
  method: string;
  path: string;
  source: string;
};

export type RepoSignals = {
  changedFiles: string[];
  topLevelDirs: string[];
  topLevelFiles: string[];
  hasPackageJson: boolean;
  hasOrchestraLikeLayout: boolean;
  nodeApiHints: NodeApiHints | null;
  languages: string[];
  appType: AppType;
  frontend: DetectedArea;
  backend: DetectedArea;
  embedded: DetectedArea;
  apiEndpoints: ApiEndpointHint[];
  dockerfilePath: string | null;
  dockerfile: { baseImage: string; packages: string[] };
  dockerComposeFiles: string[];
  nginxFiles: string[];
  pipelineFiles: string[];
  k8sFiles: string[];
  helmFiles: string[];
  terraformFiles: string[];
  openApiSpecFiles: string[];
  nativeBuild: { kind: NativeBuildKind; files: string[]; hasSources: boolean };
};

const DEFAULT_IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);

const getRepoRelPosix = (repoRoot: string, absPath: string): string => {
  return path.relative(repoRoot, absPath).replace(/\\/g, '/');
};

const isYamlLike = (fileName: string): boolean => {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.yml') || lower.endsWith('.yaml');
};

const readTextFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
};

export const parseDockerfileInfo = (dockerfileContent: string): { baseImage: string; packages: string[] } => {
  const text = String(dockerfileContent || '');
  const fromMatch = text.match(/^\s*FROM\s+([^\s#]+)\s*/m);
  const baseImage = fromMatch ? String(fromMatch[1]).trim() : '';

  const packages: string[] = [];
  const apkMatches = text.match(/^\s*RUN\s+apk\s+add\s+--no-cache\s+(.+?)\s*$/gmi) || [];
  for (const line of apkMatches) {
    const m = line.match(/apk\s+add\s+--no-cache\s+(.+?)\s*$/i);
    if (!m) continue;
    const pkgs = m[1]
      .split(/\s+/)
      .map(p => p.trim())
      .filter(Boolean);
    packages.push(...pkgs);
  }

  const aptMatches = text.match(/^\s*RUN\s+apt-get\s+.*?install\s+-y\s+(.+?)\s*(?:&&|$)/gmi) || [];
  for (const line of aptMatches) {
    const m = line.match(/install\s+-y\s+(.+?)\s*(?:&&|$)/i);
    if (!m) continue;
    const pkgs = m[1]
      .split(/\s+/)
      .map(p => p.trim())
      .filter(Boolean)
      .filter(p => !p.startsWith('-'));
    packages.push(...pkgs);
  }

  return { baseImage, packages: Array.from(new Set(packages)).sort() };
};

const extractNodeApiHints = (repoRoot: string): NodeApiHints | null => {
  const abs = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(abs)) return null;
  try {
    const pkg = JSON.parse(readTextFile(abs)) as any;
    const bin: string[] = [];
    if (typeof pkg.bin === 'string') bin.push(pkg.bin);
    if (pkg.bin && typeof pkg.bin === 'object') {
      for (const v of Object.values(pkg.bin)) {
        if (typeof v === 'string') bin.push(v);
      }
    }

    const exportsList: string[] = [];
    if (typeof pkg.exports === 'string') exportsList.push(pkg.exports);
    if (pkg.exports && typeof pkg.exports === 'object') {
      for (const v of Object.values(pkg.exports)) {
        if (typeof v === 'string') exportsList.push(v);
        if (v && typeof v === 'object') {
          for (const vv of Object.values(v)) {
            if (typeof vv === 'string') exportsList.push(vv);
          }
        }
      }
    }

    const scripts: string[] = [];
    if (pkg.scripts && typeof pkg.scripts === 'object') {
      for (const [k, v] of Object.entries(pkg.scripts)) {
        if (typeof v === 'string') scripts.push(`${k}: ${v}`);
      }
    }

    return {
      bin: Array.from(new Set(bin)).sort(),
      exports: Array.from(new Set(exportsList)).sort(),
      main: typeof pkg.main === 'string' ? pkg.main : '',
      types: typeof pkg.types === 'string' ? pkg.types : '',
      scripts: scripts.sort()
    };
  } catch {
    return null;
  }
};

const readTextFileTruncated = (filePath: string, maxChars: number): string => {
  const text = readTextFile(filePath);
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
};

const safeJsonParse = (text: string): any | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const extractNodeDeps = (repoRoot: string): { deps: string[]; devDeps: string[] } => {
  const abs = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(abs)) return { deps: [], devDeps: [] };
  const pkg = safeJsonParse(readTextFile(abs)) || {};
  const deps = pkg && typeof pkg === 'object' && pkg.dependencies && typeof pkg.dependencies === 'object' ? Object.keys(pkg.dependencies) : [];
  const devDeps =
    pkg && typeof pkg === 'object' && pkg.devDependencies && typeof pkg.devDependencies === 'object'
      ? Object.keys(pkg.devDependencies)
      : [];
  return { deps: deps.sort(), devDeps: devDeps.sort() };
};

const detectLanguages = (repoRoot: string, ignoredDirs: Set<string>): string[] => {
  const extToLang: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript',
    '.py': 'Python',
    '.go': 'Go',
    '.java': 'Java',
    '.cs': 'C#',
    '.rs': 'Rust',
    '.c': 'C/C++',
    '.h': 'C/C++',
    '.cc': 'C/C++',
    '.cpp': 'C/C++',
    '.cxx': 'C/C++',
    '.hpp': 'C/C++',
    '.hh': 'C/C++',
    '.hxx': 'C/C++'
  };

  const counts = new Map<string, number>();
  const stack = [repoRoot];
  let visitedDirs = 0;
  let visitedFiles = 0;

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    visitedDirs += 1;
    if (visitedDirs > 4000) break;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name === '.git') continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      visitedFiles += 1;
      if (visitedFiles > 20000) break;
      const ext = path.extname(entry.name).toLowerCase();
      const lang = extToLang[ext];
      if (!lang) continue;
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }

    if (visitedFiles > 20000) break;
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([lang]) => lang)
    .slice(0, 6);
};

const detectEmbeddedSignals = (repoRoot: string, topLevelDirs: string[], topLevelFiles: string[]): DetectedArea => {
  const files: string[] = [];
  const kinds = new Set<string>();

  const addIfExists = (rel: string, kind: string) => {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) {
      files.push(abs);
      kinds.add(kind);
    }
  };

  const hasDir = (name: string) => topLevelDirs.includes(name);
  const hasFile = (name: string) => topLevelFiles.includes(name);

  if (hasDir('buildroot') || hasFile('buildroot.config')) {
    kinds.add('buildroot');
    if (hasDir('buildroot')) files.push(path.join(repoRoot, 'buildroot'));
  }

  addIfExists('configs', 'buildroot');
  addIfExists('Config.in', 'buildroot');
  addIfExists('external.mk', 'buildroot');

  if (topLevelDirs.some(d => d.startsWith('meta-')) || hasDir('poky') || hasDir('yocto')) {
    kinds.add('yocto');
  }
  addIfExists('conf/bblayers.conf', 'yocto');
  addIfExists('conf/local.conf', 'yocto');

  if (hasFile('west.yml') || hasDir('zephyr')) kinds.add('zephyr');
  addIfExists('prj.conf', 'zephyr');

  if (hasFile('sdkconfig')) kinds.add('esp-idf');

  return { detected: kinds.size > 0, kinds: Array.from(kinds).sort(), files: Array.from(new Set(files)).sort() };
};

const detectNodeFrameworks = (repoRoot: string): { frontend: string[]; backend: string[] } => {
  const { deps, devDeps } = extractNodeDeps(repoRoot);
  const all = new Set<string>([...deps, ...devDeps].map(d => d.toLowerCase()));

  const frontend: string[] = [];
  const backend: string[] = [];

  const has = (name: string) => all.has(name.toLowerCase());

  if (has('next')) frontend.push('nextjs');
  if (has('react') || has('react-dom')) frontend.push('react');
  if (has('vue')) frontend.push('vue');
  if (has('nuxt') || has('nuxt3')) frontend.push('nuxt');
  if (has('@angular/core')) frontend.push('angular');
  if (has('svelte')) frontend.push('svelte');
  if (has('solid-js')) frontend.push('solid');

  if (has('express')) backend.push('express');
  if (has('fastify')) backend.push('fastify');
  if (has('@nestjs/core')) backend.push('nestjs');
  if (has('koa')) backend.push('koa');
  if (has('hono')) backend.push('hono');

  return { frontend: Array.from(new Set(frontend)).sort(), backend: Array.from(new Set(backend)).sort() };
};

const detectPythonFrameworks = (repoRoot: string): string[] => {
  const candidates = ['requirements.txt', 'pyproject.toml', 'Pipfile'];
  const found: string[] = [];
  for (const c of candidates) {
    const abs = path.join(repoRoot, c);
    if (!fs.existsSync(abs)) continue;
    const text = readTextFileTruncated(abs, 12000).toLowerCase();
    if (text.includes('fastapi')) found.push('fastapi');
    if (text.includes('flask')) found.push('flask');
    if (text.includes('django')) found.push('django');
  }
  return Array.from(new Set(found)).sort();
};

const detectGoFrameworks = (repoRoot: string): string[] => {
  const abs = path.join(repoRoot, 'go.mod');
  if (!fs.existsSync(abs)) return [];
  const text = readTextFileTruncated(abs, 20000).toLowerCase();
  const found: string[] = [];
  if (text.includes('gin-gonic/gin')) found.push('gin');
  if (text.includes('labstack/echo')) found.push('echo');
  if (text.includes('gofiber/fiber')) found.push('fiber');
  return Array.from(new Set(found)).sort();
};

const detectJavaFrameworks = (repoRoot: string): string[] => {
  const candidates = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
  const found: string[] = [];
  for (const c of candidates) {
    const abs = path.join(repoRoot, c);
    if (!fs.existsSync(abs)) continue;
    const text = readTextFileTruncated(abs, 30000).toLowerCase();
    if (text.includes('spring-boot')) found.push('spring-boot');
    if (text.includes('spring-web')) found.push('spring-web');
  }
  return Array.from(new Set(found)).sort();
};

const detectDotnetFrameworks = (repoRoot: string, topLevelDirs: string[]): string[] => {
  const found: string[] = [];
  const stack = [repoRoot, ...topLevelDirs.map(d => path.join(repoRoot, d))].filter(p => fs.existsSync(p));
  let filesChecked = 0;
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) continue;
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith('.csproj')) continue;
      filesChecked += 1;
      if (filesChecked > 30) break;
      const text = readTextFileTruncated(fullPath, 30000).toLowerCase();
      if (text.includes('microsoft.aspnetcore')) found.push('aspnetcore');
    }
    if (filesChecked > 30) break;
  }
  return Array.from(new Set(found)).sort();
};

const collectTextFilesByExt = (
  repoRoot: string,
  ignoredDirs: Set<string>,
  exts: Set<string>,
  maxFiles: number,
  maxFileChars: number
): { absPaths: string[]; read: (abs: string) => string } => {
  const absPaths: string[] = [];
  const stack = [repoRoot];
  while (stack.length && absPaths.length < maxFiles) {
    const dir = stack.pop();
    if (!dir) continue;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name === '.git') continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!exts.has(ext)) continue;
      absPaths.push(fullPath);
      if (absPaths.length >= maxFiles) break;
    }
  }

  const read = (abs: string) => readTextFileTruncated(abs, maxFileChars);
  return { absPaths, read };
};

const extractApiEndpoints = (repoRoot: string, ignoredDirs: Set<string>, backendKinds: string[]): ApiEndpointHint[] => {
  const endpoints: ApiEndpointHint[] = [];
  const seen = new Set<string>();

  const add = (method: string, p: string, abs: string) => {
    const pathNorm = String(p || '').trim();
    if (!pathNorm.startsWith('/')) return;
    const m = String(method || '').trim().toUpperCase();
    const key = `${m} ${pathNorm}`;
    if (seen.has(key)) return;
    seen.add(key);
    endpoints.push({ method: m, path: pathNorm, source: getRepoRelPosix(repoRoot, abs) });
  };

  const lowerKinds = new Set(backendKinds.map(k => k.toLowerCase()));
  const nodeLike = true;
  const pyLike = true;
  const goLike = true;

  const exts = new Set<string>();
  if (nodeLike) {
    exts.add('.ts');
    exts.add('.js');
  }
  if (pyLike) exts.add('.py');
  if (goLike) exts.add('.go');
  if (!exts.size) return [];

  const { absPaths, read } = collectTextFilesByExt(repoRoot, ignoredDirs, exts, 260, 160000);

  for (const abs of absPaths) {
    if (endpoints.length >= 200) break;
    const text = read(abs);
    if (!text) continue;

    // Detect client-side API fetches/requests: e.g. fetchJson("/api/...") or apiUrl(`/api/...`)
    const clientFetchRe = /(?:fetch|axios|fetchJson|apiUrl|request|http\.\w+).*?\(\s*[`'"](\/api\/[^`'"]+)[`'"]/gim;
    let cm: RegExpExecArray | null;
    while ((cm = clientFetchRe.exec(text))) {
      // Very basic heuristic: assume GET unless we see 'method: "POST"' nearby, but for Swagger generation 
      // just getting the path is 90% of the value.
      let method = 'GET';
      const snippet = text.slice(cm.index, cm.index + 150).toUpperCase();
      if (snippet.includes('POST')) method = 'POST';
      else if (snippet.includes('PUT')) method = 'PUT';
      else if (snippet.includes('DELETE')) method = 'DELETE';
      else if (snippet.includes('PATCH')) method = 'PATCH';
      
      // Remove trailing slash or query params heuristic
      let p = cm[1].split('?')[0];
      // remove trailing interpolations like ${id} if they got caught in string (if not backtick)
      p = p.replace(/\$\{[^}]+\}/g, '{id}');
      
      add(method, p, abs);
      if (endpoints.length >= 200) break;
    }

    if (nodeLike) {
      const re = /\b\w+\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*['"`](\/[^'"`]*)['"`]/gim;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        add(m[1], m[2], abs);
        if (endpoints.length >= 200) break;
      }
    }

    if (pyLike) {
      const fastApiRe = /@\s*\w+\s*\.\s*(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gim;
      let m: RegExpExecArray | null;
      while ((m = fastApiRe.exec(text))) {
        add(m[1], m[2], abs);
        if (endpoints.length >= 200) break;
      }

      const flaskRouteRe = /@\s*\w+\s*\.\s*route\s*\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/gim;
      while ((m = flaskRouteRe.exec(text))) {
        const p = m[1];
        const methodsRaw = m[2] || '';
        const methods = methodsRaw
          ? methodsRaw
              .split(',')
              .map(s => s.replace(/['"`\s]/g, '').trim())
              .filter(Boolean)
          : ['GET'];
        for (const method of methods) add(method, p, abs);
        if (endpoints.length >= 200) break;
      }
    }

    if (goLike) {
      const ginRe = /\.\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s*\(\s*\"([^\"]+)\"/gm;
      let m: RegExpExecArray | null;
      while ((m = ginRe.exec(text))) {
        add(m[1], m[2], abs);
        if (endpoints.length >= 200) break;
      }
    }
  }

  return endpoints;
};

const findOpenApiSpecFiles = (repoRoot: string, ignoredDirs: Set<string>): string[] => {
  const results: string[] = [];
  const stack = [repoRoot];

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name === '.git') continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      const isSpecName = lower.includes('openapi') || lower.includes('swagger');
      if (!isSpecName) continue;
      const ext = path.extname(lower);
      if (ext !== '.yml' && ext !== '.yaml' && ext !== '.json') continue;
      results.push(fullPath);
    }
  }

  return Array.from(new Set(results)).sort();
};

const detectNativeBuild = (repoRoot: string): { kind: NativeBuildKind; files: string[] } => {
  const candidates: { kind: NativeBuildKind; rel: string }[] = [
    { kind: 'cmake', rel: 'CMakeLists.txt' },
    { kind: 'meson', rel: 'meson.build' },
    { kind: 'bazel', rel: 'WORKSPACE' },
    { kind: 'bazel', rel: 'WORKSPACE.bazel' },
    { kind: 'bazel', rel: 'MODULE.bazel' },
    { kind: 'make', rel: 'Makefile' },
    { kind: 'make', rel: 'makefile' }
  ];

  const found: { kind: NativeBuildKind; abs: string }[] = [];
  for (const c of candidates) {
    const abs = path.join(repoRoot, c.rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      found.push({ kind: c.kind, abs });
    }
  }

  if (found.length === 0) return { kind: 'none', files: [] };

  const kindPriority: Record<NativeBuildKind, number> = {
    cmake: 1,
    meson: 2,
    bazel: 3,
    make: 4,
    unknown: 99,
    none: 100
  };

  const kind = found.map(f => f.kind).sort((a, b) => kindPriority[a] - kindPriority[b])[0] || 'unknown';
  return { kind, files: found.map(f => f.abs) };
};

const detectNativeSources = (repoRoot: string, ignoredDirs: Set<string>): boolean => {
  const exts = new Set(['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx']);
  const stack = [repoRoot];
  let visited = 0;

  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    visited += 1;
    if (visited > 5000) return false;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name === '.git') continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.has(ext)) return true;
    }
  }

  return false;
};

export const scanRepoSignals = (
  repoRoot: string,
  changedFiles: string[] = [],
  options?: { ignoredDirs?: string[] }
): RepoSignals => {
  const ignoredDirs = new Set(options?.ignoredDirs || Array.from(DEFAULT_IGNORED_DIRS));

  const topEntries = (() => {
    try {
      return fs.readdirSync(repoRoot, { withFileTypes: true });
    } catch {
      return [] as fs.Dirent[];
    }
  })();

  const topLevelDirs = topEntries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .filter(n => !ignoredDirs.has(n))
    .sort();

  const topLevelFiles = topEntries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(n => !n.startsWith('.'))
    .sort();

  const orchestraLayoutDirs = new Set([
    'coordinator',
    'plugins',
    'skills',
    'keybindings',
    'memdir',
    'tasks',
    'state',
    'migrations',
    'schemas',
    'entrypoints'
  ]);
  const hasOrchestraLikeLayout = topLevelDirs.some(d => orchestraLayoutDirs.has(d));

  const dockerfilePath = fs.existsSync(path.join(repoRoot, 'Dockerfile')) ? path.join(repoRoot, 'Dockerfile') : null;
  const dockerText = dockerfilePath ? readTextFile(dockerfilePath) : '';
  const dockerfile = parseDockerfileInfo(dockerText);

  const hasPackageJson = fs.existsSync(path.join(repoRoot, 'package.json'));
  const nodeApiHints = extractNodeApiHints(repoRoot);

  const languages = detectLanguages(repoRoot, ignoredDirs);
  const embedded = detectEmbeddedSignals(repoRoot, topLevelDirs, topLevelFiles);
  const nativeBuild = detectNativeBuild(repoRoot);
  const nativeHasSources = detectNativeSources(repoRoot, ignoredDirs);

  const nodeFrameworks = hasPackageJson ? detectNodeFrameworks(repoRoot) : { frontend: [], backend: [] };
  const pythonFrameworks = detectPythonFrameworks(repoRoot);
  const goFrameworks = detectGoFrameworks(repoRoot);
  const javaFrameworks = detectJavaFrameworks(repoRoot);
  const dotnetFrameworks = detectDotnetFrameworks(repoRoot, topLevelDirs);

  const frontendKinds = new Set<string>(nodeFrameworks.frontend);
  if (topLevelDirs.some(d => ['frontend', 'client', 'web', 'ui'].includes(d))) frontendKinds.add('frontend');

  const backendKinds = new Set<string>([
    ...nodeFrameworks.backend,
    ...pythonFrameworks,
    ...goFrameworks,
    ...javaFrameworks,
    ...dotnetFrameworks
  ]);
  if (topLevelDirs.some(d => ['backend', 'server', 'api'].includes(d))) backendKinds.add('backend');
  if (topLevelFiles.some(f => ['api.js', 'api.ts', 'server.js', 'server.ts', 'main.py', 'app.py', 'server.py'].includes(f.toLowerCase()))) backendKinds.add('backend');

  const frontendFiles: string[] = [];
  const backendFiles: string[] = [];
  const addIfExists = (list: string[], rel: string) => {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) list.push(abs);
  };

  if (frontendKinds.size > 0) {
    addIfExists(frontendFiles, 'package.json');
    addIfExists(frontendFiles, 'next.config.js');
    addIfExists(frontendFiles, 'next.config.mjs');
    addIfExists(frontendFiles, 'vite.config.ts');
    addIfExists(frontendFiles, 'vite.config.js');
    addIfExists(frontendFiles, 'angular.json');
  }

  if (backendKinds.size > 0) {
    addIfExists(backendFiles, 'package.json');
    addIfExists(backendFiles, 'go.mod');
    addIfExists(backendFiles, 'main.py');
    addIfExists(backendFiles, 'app.py');
    addIfExists(backendFiles, 'server.py');
    addIfExists(backendFiles, 'pom.xml');
    addIfExists(backendFiles, 'build.gradle');
    addIfExists(backendFiles, 'build.gradle.kts');
  }

  const frontend: DetectedArea = {
    detected: frontendKinds.size > 0,
    kinds: Array.from(frontendKinds).sort(),
    files: Array.from(new Set(frontendFiles)).sort()
  };

  const openApiSpecFiles = findOpenApiSpecFiles(repoRoot, ignoredDirs);
  const apiEndpoints = extractApiEndpoints(repoRoot, ignoredDirs, Array.from(backendKinds));

  if (apiEndpoints.length > 0) {
    backendKinds.add('custom-api');
  }

  const backend: DetectedArea = {
    detected: backendKinds.size > 0,
    kinds: Array.from(backendKinds).sort(),
    files: Array.from(new Set(backendFiles)).sort()
  };

  const appType: AppType = (() => {
    if (embedded.detected) return 'embedded';
    if (frontend.detected && backend.detected) return 'fullstack';
    if (backend.detected) return 'backend';
    if (frontend.detected) return 'frontend';
    if (nodeApiHints && nodeApiHints.bin.length) return 'cli';
    if (nodeApiHints && (nodeApiHints.exports.length || nodeApiHints.main || nodeApiHints.types)) return 'library';
    if (nativeBuild.kind !== 'none' || nativeHasSources) return 'native';
    return 'unknown';
  })();

  const dockerComposeFiles: string[] = [];
  const nginxFiles: string[] = [];
  const pipelineFiles: string[] = [];
  const k8sFiles: string[] = [];
  const helmFiles: string[] = [];
  const terraformFiles: string[] = [];

  const stack = [repoRoot];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) {
        if (entry.name === '.git') continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      const rel = getRepoRelPosix(repoRoot, fullPath);

      if (
        rel.startsWith('.github/workflows/') ||
        lower === '.gitlab-ci.yml' ||
        lower === 'azure-pipelines.yml' ||
        lower === 'azure-pipelines.yaml' ||
        lower === 'bitbucket-pipelines.yml' ||
        lower === 'bitbucket-pipelines.yaml' ||
        rel.startsWith('.circleci/')
      ) {
        if (isYamlLike(lower) || lower.endsWith('.json')) pipelineFiles.push(fullPath);
      }

      if (
        lower === 'docker-compose.yml' ||
        lower === 'docker-compose.yaml' ||
        lower.endsWith('.compose.yml') ||
        lower.endsWith('.compose.yaml')
      ) {
        dockerComposeFiles.push(fullPath);
      }

      if (lower.includes('nginx') && (lower.endsWith('.conf') || isYamlLike(lower) || lower.endsWith('.template'))) {
        nginxFiles.push(fullPath);
      }

      if (rel.startsWith('k8s/') || rel.startsWith('kubernetes/')) {
        if (isYamlLike(lower)) k8sFiles.push(fullPath);
      }

      if (rel.startsWith('helm/')) {
        if (isYamlLike(lower) || lower === 'chart.yaml' || lower === 'chart.lock' || lower === 'values.yaml') {
          helmFiles.push(fullPath);
        }
      }

      if (lower.endsWith('.tf') || lower.endsWith('.tfvars') || lower === 'terraform.lock.hcl') {
        terraformFiles.push(fullPath);
      }
    }
  }

  return {
    changedFiles,
    topLevelDirs,
    topLevelFiles,
    hasPackageJson,
    hasOrchestraLikeLayout,
    nodeApiHints,
    languages,
    appType,
    frontend,
    backend,
    embedded,
    apiEndpoints,
    dockerfilePath,
    dockerfile,
    dockerComposeFiles: Array.from(new Set(dockerComposeFiles)).sort(),
    nginxFiles: Array.from(new Set(nginxFiles)).sort(),
    pipelineFiles: Array.from(new Set(pipelineFiles)).sort(),
    k8sFiles: Array.from(new Set(k8sFiles)).sort(),
    helmFiles: Array.from(new Set(helmFiles)).sort(),
    terraformFiles: Array.from(new Set(terraformFiles)).sort(),
    openApiSpecFiles,
    nativeBuild: { kind: nativeBuild.kind, files: nativeBuild.files, hasSources: nativeHasSources }
  };
};
