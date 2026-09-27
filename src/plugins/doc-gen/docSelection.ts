import fs from 'fs';
import path from 'path';
import type { OpengrepResultFinding, TestArtifact } from '../../utils/pluginArtifacts';
import { readOpengrepArtifact, findingsGroupedByModule, severityScore, readTestArtifact } from '../../utils/pluginArtifacts';
import { getRepoRelPosix, readTextFile, sha1 } from './docUtils';
import type { StructurePlanItem } from './types';

export type ManifestChanges = {
  total: number;
  packageJson?: {
    added: string[];
    removed: string[];
    changed: string[];
    enginesChanged: boolean;
    newNodeMin?: string | null;
    scriptsAdded: string[];
    scriptsRemoved: string[];
  };
  python?: {
    added: string[];
    removed: string[];
    changed: string[];
  };
  go?: {
    added: string[];
    removed: string[];
    changed: string[];
    goVersionChanged: boolean;
  };
  rust?: {
    added: string[];
    removed: string[];
    changed: string[];
    rustVersionChanged: boolean;
  };
  ruby?: { added: string[]; removed: string[]; changed: string[] };
  githubAction?: {
    inputsAdded: string[];
    inputsRemoved: string[];
    stepsAdded: string[];
    stepsRemoved: string[];
  };
  triggers: {
    forceDocRelPaths: string[];
    summaryLines: string[];
  };
};

export const pickBestDocPathForTopic = (params: {
  repoRoot: string;
  allDocs: string[];
  desiredRel: string;
  match: RegExp;
  canonicalDocsDir?: string;
}): string => {
  const desiredAbs = path.join(params.repoRoot, params.desiredRel);
  if (params.allDocs.includes(desiredAbs)) return desiredAbs;

  const matches = params.allDocs.filter(p => {
    const rel = getRepoRelPosix(params.repoRoot, p);
    return params.match.test(rel) || params.match.test(path.basename(rel));
  });

  if (matches.length === 0) return desiredAbs;

  const canonicalDocsDir = params.canonicalDocsDir || 'docs';
  const score = (absPath: string): number => {
    const rel = getRepoRelPosix(params.repoRoot, absPath);
    const inDocs = rel.startsWith(`${canonicalDocsDir}/`) ? 0 : 1;
    const depth = rel.split('/').length;
    return inDocs * 100 + depth * 10 + rel.length;
  };

  return matches.sort((a, b) => score(a) - score(b))[0];
};

export type TopicKeywordsMap = Partial<Record<StructurePlanItem['topic'], RegExp>>;

const DEFAULT_TOPIC_FILE_HINTS: Partial<Record<StructurePlanItem['topic'], RegExp>> = {
  requirements: /package\.json|requirements\.txt|pyproject\.toml|go\.mod|pom\.xml|Cargo\.toml|Gemfile|CMakeLists\.txt|Makefile|install|deps?/i,
  environment: /\.env|config|settings|environment|vars?|secrets?|credentials/i,
  'local-setup': /package\.json|requirements\.txt|dockerfile|Makefile|readme|setup|install/i,
  architecture: /index\.(ts|js|py|go)|server\.(ts|js|py|go)|app\.(ts|js|py|go)|main\.(ts|js|py|go|rs|c|cpp)|plugin|service|services?|src\/|lib\//i,
  api: /api|routes?|router|endpoint|controllers?|handlers?|lambda|resolvers?|graphql|openapi|swagger/i,
  pipelines: /\.github\/workflows|gitlab-ci|azure-pipelines|bitbucket-pipelines|circleci|pipeline|ci|workflow/i,
  docker: /dockerfile|docker-compose|\.compose\.(yml|yaml)|docker/i,
  nginx: /nginx/i,
  kubernetes: /k8s\/|kubernetes\/|deployment\.ya?ml|service\.ya?ml|ingress\.ya?ml/i,
  helm: /helm\/|Chart\.(ya?ml|lock)|values\.ya?ml/i,
  terraform: /\.tf$|\.tfvars$|terraform\.lock\.hcl/i,
  openapi: /openapi|swagger|spec.*ya?ml/i,
  build: /CMakeLists|Makefile|Meson|BUILD|WORKSPACE|BUILD\.bazel|compile|native|\.(c|cpp|h|hpp|rs|go)$/i,
  security: /auth|security|jwt|oauth|vuln|scan|secret|cors|encrypt|permission|role/i,
  testing: /test|spec|jest|vitest|mocha|cypress|playwright|pytest|junit|qa/i,
  deployment: /deploy|release|pipeline|helm|terraform|k8s|dockerfile/i,
  contributing: /contributing|CONTRIBUTING|code.?of.?conduct|pull.?request|pr.?guide/i,
  changelog: /changelog|CHANGELOG|releases?|history/i
};

export type DiffMentions = {
  pathsRel: Set<string>;
  baseNames: Set<string>;
  symbols: Set<string>;
  keywords: Set<string>;
  totalAddedLines: number;
  totalChangedFiles: number;
};

const IS_SYMBOL_RE = /^[A-Za-z_$][A-Za-z0-9_$]{2,}$/;
const STOPWORDS = new Set([
  'const','let','var','function','class','if','else','for','while','return','from','import','export','default','this','new','await','async','try','catch','throw','typeof','instanceof','true','false','null','undefined','void','with','switch','case','break','continue','and','the','not','for','are','but','has','have','been','being','that','than','then','else','also','only','over','under','into','more','less','most','least','can','cannot','could','should','would','will','just','like','make','made','takes','take','using','used','uses','user','users','data','name','path','file','files','value','values','types','type','first','last','next','prev','error','errors','result','results','array','object','string','number','config','options','option','params','param','args','arg','input','output','context','state','mode','item','items','list','map','set','key','keys'
]);

const extractAddedLines = (diff: string): string[] => {
  if (!diff) return [];
  const out: string[] = [];
  for (const rawLine of diff.split(/\r?\n/)) {
    if (!rawLine.startsWith('+')) continue;
    if (rawLine.startsWith('+++')) continue;
    const line = rawLine.slice(1).trim();
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) continue;
    if (line.startsWith('/*') || line.endsWith('*/')) continue;
    out.push(line);
  }
  return out;
};

export const extractDiffMentions = (
  changedFilesRel: string[],
  diffsByFile: Map<string, string>
): DiffMentions => {
  const pathsRel = new Set<string>();
  const baseNames = new Set<string>();
  const symbols = new Set<string>();
  const keywords = new Set<string>();
  let totalAddedLines = 0;

  for (const rel of changedFilesRel) {
    const norm = rel.replace(/\\/g, '/');
    if (!norm) continue;
    pathsRel.add(norm);

    const segments = norm.split('/').filter(Boolean);
    for (const seg of segments) {
      const lower = seg.toLowerCase();
      if (lower.length >= 3) keywords.add(lower.replace(/\.[^.]+$/, ''));
    }
    const base = path.posix.basename(norm);
    if (base) {
      baseNames.add(base);
      const noExt = base.replace(/\.[^.]+$/, '');
      if (noExt.length >= 3) keywords.add(noExt.toLowerCase());
    }

    const diff = diffsByFile.get(rel);
    if (!diff) continue;
    const added = extractAddedLines(diff);
    totalAddedLines += added.length;
    for (const line of added) {
      const token = line.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
      for (const t of token) {
        if (!IS_SYMBOL_RE.test(t)) continue;
        const lower = t.toLowerCase();
        if (STOPWORDS.has(lower)) continue;
        if (t.length >= 4 && /[A-Z]/.test(t)) symbols.add(t);
        if (lower.length >= 5 && !STOPWORDS.has(lower)) keywords.add(lower);
      }
    }
  }

  return {
    pathsRel,
    baseNames,
    symbols,
    keywords,
    totalAddedLines,
    totalChangedFiles: changedFilesRel.length
  };
};

export const scoreDocByRelevance = (params: {
  repoRoot: string;
  docAbsPath: string;
  mentions: DiffMentions;
  mode: 'changed' | 'all';
  topLevelHits: Set<string>;
}): number => {
  const { repoRoot, docAbsPath, mentions, mode, topLevelHits } = params;
  const rel = getRepoRelPosix(repoRoot, docAbsPath).replace(/\\/g, '/');
  const base = path.posix.basename(rel).toLowerCase();
  const baseNoExt = base.replace(/\.mdx?$/, '');
  const lowerRel = rel.toLowerCase();
  const content = readTextFile(docAbsPath).slice(0, 20000).toLowerCase();

  let score = 0;

  if (topLevelHits.has(base)) score += 120;

  // Path match: doc basename or dir mentions changed file names
  for (const p of mentions.pathsRel) {
    const pLower = p.toLowerCase();
    const tokens = pLower.split(/[/.\\-]/).filter(t => t.length >= 4);
    for (const tok of tokens) {
      if (baseNoExt.includes(tok) || lowerRel.includes(tok)) score += 8;
    }
    if (mentions.baseNames.size < 30) {
      const bn = path.posix.basename(p).toLowerCase();
      const bnNoExt = bn.replace(/\.[^.]+$/, '');
      if (bnNoExt && baseNoExt.includes(bnNoExt)) score += 25;
      if (bn && content.includes(bn)) score += 12;
    }
    // if content mentions the whole relative path
    if (content.includes(pLower)) score += 20;
  }

  // Exported symbol or keyword in doc content or title
  let symHits = 0;
  for (const s of mentions.symbols) {
    if (!s) continue;
    if (content.includes(`\`${s}\``)) { symHits += 3; continue; }
    const lc = s.toLowerCase();
    if (content.includes(lc)) symHits += 1;
  }
  score += symHits * 7;

  let kwHits = 0;
  for (const kw of mentions.keywords) {
    if (!kw || kw.length < 5) continue;
    if (content.includes(kw)) kwHits += 1;
  }
  score += kwHits * 2;

  // Baseline topic hint (when nothing matched, we still pick a few docs)
  if (score === 0 && mode === 'changed') {
    const topicHits = Array.from(Object.values(DEFAULT_TOPIC_FILE_HINTS)).filter((re: any) => re && re.test && mentions.pathsRel.size && Array.from(mentions.pathsRel).some(p => re.test(p)));
    if (topicHits.length > 0) {
      for (const re of topicHits as unknown as RegExp[]) {
        if (re.test(rel) || re.test(base)) score += 30;
      }
    }
  }

  // Tiny nudge: prefer docs/ folder for discoverability (1 pt, never overrides real hits)
  if (lowerRel.startsWith('docs/') && score > 0) score += 1;

  return score;
};

export const buildRelevantDiffSnippet = (params: {
  topic: StructurePlanItem['topic'];
  changedFilesRel: string[];
  diffsByFile: Map<string, string>;
  maxChars?: number;
}): string => {
  const { topic, changedFilesRel, diffsByFile } = params;
  const maxChars = params.maxChars ?? 3500;
  const hint = DEFAULT_TOPIC_FILE_HINTS[topic];
  const relevant: string[] = [];
  for (const rel of changedFilesRel) {
    const isRelevant = !hint
      ? true
      : hint.test(rel) || hint.test(path.posix.basename(rel)) || Array.from(mentionsKeywordsFallback(rel)).some(k => hint.test(k));
    if (isRelevant) relevant.push(rel);
  }
  if (relevant.length === 0) return '';
  const lines: string[] = [];
  let used = 0;
  for (const rel of relevant.slice(0, 8)) {
    const d = diffsByFile.get(rel);
    if (!d) continue;
    const remaining = maxChars - used;
    if (remaining <= 0) break;
    const header = `Changed: ${rel}`;
    const head = `diff snippet for "${rel}" (topic=${topic}):\n`;
    const piece = d.length > remaining ? d.slice(0, remaining) + '\n...[truncated]' : d;
    lines.push(header);
    lines.push('```diff');
    lines.push(piece);
    lines.push('```');
    lines.push('');
    used += head.length + piece.length;
  }
  return lines.join('\n');
};

const mentionsKeywordsFallback = (rel: string): string[] => {
  const out: string[] = [];
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    const noExt = seg.toLowerCase().replace(/\.[^.]+$/, '');
    if (noExt.length >= 4) out.push(noExt);
  }
  return out;
};

export const topicRelevantChangedFiles = (
  topic: StructurePlanItem['topic'],
  changedFilesRel: string[]
): string[] => {
  const hint = DEFAULT_TOPIC_FILE_HINTS[topic];
  if (!hint) return changedFilesRel.slice(0, 10);
  const matched = changedFilesRel.filter(
    rel => hint.test(rel) || hint.test(path.posix.basename(rel))
  );
  return matched.length ? matched : changedFilesRel.slice(0, 6);
};

export type DocSection = {
  heading: string;
  headingLine: number;
  level: number;
  contentStart: number;
  contentEnd: number;
  text: string;
  textLower: string;
  finger: string;
};

const MD_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

export const splitMarkdownSections = (content: string): DocSection[] => {
  const lines = content.split(/\r?\n/);
  const sections: DocSection[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const m = lines[cursor].match(MD_HEADING_RE);
    if (!m) { cursor++; continue; }
    const level = m[1].length;
    const heading = m[2].trim();
    const startContent = cursor + 1;
    let j = startContent;
    while (j < lines.length) {
      const jm = lines[j].match(MD_HEADING_RE);
      if (jm && jm[1].length <= level) break;
      j++;
    }
    const body = lines.slice(startContent, j).join('\n');
    const text = `${heading}\n${body}`;
    sections.push({
      heading,
      headingLine: cursor + 1,
      level,
      contentStart: startContent + 1,
      contentEnd: j,
      text,
      textLower: text.toLowerCase(),
      finger: sha1(text),
    });
    cursor = j;
  }
  if (sections.length === 0) {
    sections.push({
      heading: '__preamble__',
      headingLine: 1,
      level: 0,
      contentStart: 1,
      contentEnd: lines.length,
      text: content,
      textLower: content.toLowerCase(),
      finger: sha1(content),
    });
  }
  return sections;
};

export type StaleSectionHit = {
  section: DocSection;
  score: number;
  matchedSymbols: string[];
  matchedKeywords: string[];
  matchedPaths: string[];
};

export const findStaleSections = (params: {
  repoRoot: string;
  docAbsPath: string;
  mentions: DiffMentions;
  minScore?: number;
  maxSections?: number;
}): StaleSectionHit[] => {
  const { repoRoot, docAbsPath, mentions, minScore = 4, maxSections = 12 } = params;
  const content = readTextFile(docAbsPath);
  const sections = splitMarkdownSections(content);
  const rel = getRepoRelPosix(repoRoot, docAbsPath).toLowerCase();
  const hits: StaleSectionHit[] = [];

  for (const section of sections) {
    let score = 0;
    const matchedSymbols: string[] = [];
    const matchedKeywords: string[] = [];
    const matchedPaths: string[] = [];
    const headingLower = section.heading.toLowerCase();

    // Path tokens: doc filename/dir + section heading match against changed file segments
    for (const p of mentions.pathsRel) {
      const segments = p.toLowerCase().split(/[/.\\-]/).filter(s => s.length >= 4);
      for (const seg of segments) {
        if (headingLower.includes(seg) || section.textLower.includes(seg)) {
          score += 3;
          if (matchedPaths.length < 6) matchedPaths.push(p);
          break;
        }
      }
      const bn = path.posix.basename(p).toLowerCase().replace(/\.[^.]+$/, '');
      if (bn && (headingLower.includes(bn) || section.textLower.includes(bn))) {
        score += 6;
        if (!matchedPaths.includes(p) && matchedPaths.length < 6) matchedPaths.push(p);
      }
      if (section.textLower.includes(p.toLowerCase())) {
        score += 14;
        if (!matchedPaths.includes(p) && matchedPaths.length < 6) matchedPaths.push(p);
      }
    }

    for (const s of mentions.symbols) {
      if (!s) continue;
      const lower = s.toLowerCase();
      if (section.textLower.includes(`\`${lower}\``) || section.textLower.includes(`\`${s}\``)) {
        score += 9;
        if (matchedSymbols.length < 8) matchedSymbols.push(s);
      } else if (section.textLower.includes(lower)) {
        score += 2;
        if (matchedSymbols.length < 8 && !matchedSymbols.includes(s)) matchedSymbols.push(s);
      }
    }

    for (const kw of mentions.keywords) {
      if (!kw || kw.length < 5) continue;
      if (section.textLower.includes(kw)) {
        score += 2;
        if (matchedKeywords.length < 8) matchedKeywords.push(kw);
      }
    }

    // Weak signal: rel path words match section heading
    for (const tok of rel.split(/[/.\\-]/).filter(t => t.length >= 4)) {
      if (headingLower.includes(tok)) score += 1;
    }

    if (score >= minScore) {
      hits.push({ section, score, matchedSymbols, matchedKeywords, matchedPaths });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || a.section.headingLine - b.section.headingLine)
    .slice(0, maxSections);
};

export type ExportedName = { name: string; kind: string; fileRel: string; line: number };

const TS_EXPORT_RE = /^\s*export\s+(?:declare\s+)?(function|class|const|let|var|interface|type|enum|namespace|abstract\s+class)\s+([A-Za-z_$][\w$]*)/;
const TS_EXPORT_LIST_RE = /^\s*export\s*\{([^}]+)\}/;
const PY_EXPORT_DUNDER_RE = /^__all__\s*=\s*\[([^\]]+)\]/;
const GO_EXPORTED_RE = /^func\s+(?:\([^)]*\)\s*)?([A-Z][A-Za-z0-9_]*)\s*\(/;
const GO_TYPE_EXPORTED_RE = /^type\s+([A-Z][A-Za-z0-9_]*)\s+/;
const GO_CONST_EXPORTED_RE = /^const\s+([A-Z][A-Za-z0-9_]*)\s+/;
const GO_VAR_EXPORTED_RE = /^var\s+([A-Z][A-Za-z0-9_]*)\s+/;
const RS_PUB_FN_RE = /^pub\s+(?:async\s+)?fn\s+([A-Za-z_]\w*)\s*\(/;
const RS_PUB_STRUCT_ENUM = /^pub\s+(struct|enum)\s+([A-Z][A-Za-z0-9_]*)/;

export const extractExportsFromFile = (absPath: string): ExportedName[] => {
  const out: ExportedName[] = [];
  if (!fs.existsSync(absPath)) return out;
  let rel = '';
  try { rel = absPath; } catch { rel = absPath; }
  const content = readTextFile(absPath);
  if (!content) return out;
  const ext = path.extname(absPath).toLowerCase();
  const lines = content.split(/\r?\n/);

  const push = (name: string, kind: string, line: number) => {
    if (!name) return;
    out.push({ name, kind, fileRel: rel, line });
  };

  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(TS_EXPORT_RE);
      if (m) { push(m[2], m[1], i + 1); continue; }
      const m2 = lines[i].match(TS_EXPORT_LIST_RE);
      if (m2) {
        const inner = m2[1];
        for (const part of inner.split(',')) {
          const name = part.split(' as ')[0]?.trim().replace(/[{}]/g, '').trim();
          if (name && /^[A-Za-z_$][\w$]*$/.test(name)) push(name, 'export-list', i + 1);
        }
      }
    }
  } else if (ext === '.py') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^def\s+([A-Za-z_]\w*)\s*\(/);
      if (m && !m[1].startsWith('_')) push(m[1], 'def', i + 1);
      const mc = lines[i].match(/^class\s+([A-Za-z_]\w*)/);
      if (mc && !mc[1].startsWith('_')) push(mc[1], 'class', i + 1);
    }
    const dunder = content.match(PY_EXPORT_DUNDER_RE);
    if (dunder) {
      let line = 1;
      for (const m of dunder[1].split(',')) {
        const name = m.trim().replace(/^['"]|['"]$/g, '');
        if (/^[A-Za-z_]\w*$/.test(name)) push(name, '__all__', line++);
      }
    }
  } else if (ext === '.go') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(GO_EXPORTED_RE);
      if (m) push(m[1], 'func', i + 1);
      const mt = lines[i].match(GO_TYPE_EXPORTED_RE);
      if (mt) push(mt[1], 'type', i + 1);
      const mc = lines[i].match(GO_CONST_EXPORTED_RE);
      if (mc) push(mc[1], 'const', i + 1);
      const mv = lines[i].match(GO_VAR_EXPORTED_RE);
      if (mv) push(mv[1], 'var', i + 1);
    }
  } else if (ext === '.rs') {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(RS_PUB_FN_RE);
      if (m) push(m[1], 'fn', i + 1);
      const ms = lines[i].match(RS_PUB_STRUCT_ENUM);
      if (ms) push(ms[2], ms[1], i + 1);
    }
  }
  return out;
};

export type DownstreamImpact = {
  exported: ExportedName;
  downstreamFiles: string[];
  lineHits: Map<string, number>;
};

const CODE_EXT = new Set([
  '.ts','.tsx','.js','.jsx','.mjs','.cjs','.py','.go','.rs',
  '.java','.kt','.rb','.php','.cs','.c','.cpp','.h','.hpp','.cc','.swift'
]);

export const computeDownstreamImpact = (params: {
  repoRoot: string;
  changedFilesRel: string[];
  diffsByFile: Map<string, string>;
  maxDepth?: number;
}): DownstreamImpact[] => {
  const { repoRoot, changedFilesRel, diffsByFile, maxDepth = 1 } = params;
  const out: DownstreamImpact[] = [];
  const mentions = extractDiffMentions(changedFilesRel, diffsByFile);
  const changedExports: ExportedName[] = [];

  for (const rel of changedFilesRel) {
    const abs = path.resolve(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const ext = path.extname(abs).toLowerCase();
    if (!CODE_EXT.has(ext)) continue;
    const list = extractExportsFromFile(abs);
    for (const e of list) e.fileRel = rel;
    // only keep exports whose names are actually MENTIONED in ADDED diff lines → likely changed / new exports
    const nameMentioned = (e: ExportedName) => mentions.symbols.has(e.name) || mentions.keywords.has(e.name.toLowerCase());
    const filtered = list.length <= 6 ? list : list.filter(nameMentioned);
    changedExports.push(...filtered);
  }
  if (changedExports.length === 0) return out;

  // Walk repo files looking for occurrences
  const searchDirs = ['src', 'lib', 'cmd', 'app', 'packages', 'api', 'bin', 'server', 'client'];
  const rootItems = fs.existsSync(repoRoot) ? fs.readdirSync(repoRoot) : [];
  const scanRoots: string[] = [];
  for (const d of searchDirs) if (rootItems.includes(d) && fs.statSync(path.join(repoRoot, d)).isDirectory()) scanRoots.push(path.join(repoRoot, d));
  if (scanRoots.length === 0) scanRoots.push(repoRoot);

  const foundCode: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist' || e.name === 'build' || e.name.startsWith('.')) continue;
        walk(abs);
      } else if (e.isFile() && CODE_EXT.has(path.extname(e.name).toLowerCase())) {
        foundCode.push(abs);
      }
    }
  };
  for (const r of scanRoots) walk(r);

  for (const e of changedExports) {
    const downstream: string[] = [];
    const lineHits = new Map<string, number>();
    for (const abs of foundCode) {
      const relAbs = abs.split(path.sep).join('/');
      if (changedFilesRel.some(c => relAbs.endsWith(c) || relAbs.endsWith('/' + c))) continue;
      const lines = readTextFile(abs).split(/\r?\n/);
      let localHits = 0;
      for (let i = 0; i < lines.length; i++) {
        if (new RegExp(`\\b${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lines[i])) {
          localHits += 1;
        }
      }
      if (localHits > 0) {
        downstream.push(getRepoRelPosix(repoRoot, abs));
        lineHits.set(getRepoRelPosix(repoRoot, abs), localHits);
      }
    }
    if (downstream.length > 0) {
      out.push({ exported: e, downstreamFiles: downstream.sort(), lineHits });
    }
    if (maxDepth && out.length >= 60) break;
  }
  return out.sort((a, b) => b.downstreamFiles.length - a.downstreamFiles.length);
};

const DIFF_LINE_RE = /^([+-])(.*)$/;

const diffChangedKeys = (diff: string, objectPathPrefix: string): { added: string[]; removed: string[]; changedValueLines: string[] } => {
  const added: string[] = [];
  const removed: string[] = [];
  const changedValueLines: string[] = [];
  const prefixBrace = `${objectPathPrefix}{`;
  let inside = objectPathPrefix ? false : true;
  let braceDepth = 0;
  for (const rawLine of diff.split(/\r?\n/)) {
    if (!inside && objectPathPrefix) {
      if (rawLine.includes(prefixBrace)) {
        inside = true;
        braceDepth = (rawLine.match(/\{/g) || []).length - (rawLine.match(/\}/g) || []).length;
      }
      continue;
    }
    const s = rawLine.trimEnd();
    if (inside && objectPathPrefix) {
      braceDepth += (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      if (braceDepth <= 0) { inside = false; continue; }
    }
    const m = s.match(DIFF_LINE_RE);
    if (!m) continue;
    const sign = m[1]; const body = m[2].trim();
    if (body.startsWith('+++') || body.startsWith('---')) continue;
    const keyMatch = body.match(/^"?([^":,{}[\]]+)"?\s*:/);
    if (!keyMatch) { changedValueLines.push(body); continue; }
    const key = keyMatch[1].trim();
    if (sign === '+') added.push(key);
    else if (sign === '-') removed.push(key);
  }
  return { added, removed, changedValueLines };
};

const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr));

export const parseManifestChanges = (params: {
  repoRoot: string;
  changedFilesRel: string[];
  diffsByFile: Map<string, string>;
}): ManifestChanges => {
  const { changedFilesRel, diffsByFile, repoRoot } = params;
  const forceDocRelPaths: string[] = [];
  const summaryLines: string[] = [];
  let total = 0;

  let packageJson: ManifestChanges['packageJson'] | undefined;
  const pkgFile = changedFilesRel.find(f => /(^|\/)(package\.json)$/.test(f));
  if (pkgFile) {
    const diff = diffsByFile.get(pkgFile) || '';
    const deps = diffChangedKeys(diff, '"dependencies":');
    const devDeps = diffChangedKeys(diff, '"devDependencies":');
    const scripts = diffChangedKeys(diff, '"scripts":');
    const engines = diffChangedKeys(diff, '"engines":');
    total += 1;
    const added = uniq([...deps.added, ...devDeps.added]);
    const removed = uniq([...deps.removed, ...devDeps.removed]);
    const changed = uniq([...deps.changedValueLines, ...devDeps.changedValueLines]).slice(0, 40);
    const enginesChanged = engines.added.length > 0 || engines.removed.length > 0 || engines.changedValueLines.length > 0;
    packageJson = {
      added,
      removed,
      changed,
      enginesChanged,
      newNodeMin: engines.added.includes('node') || engines.removed.includes('node') || enginesChanged ? extractNodeEngineFloor(repoRoot, pkgFile) : null,
      scriptsAdded: scripts.added,
      scriptsRemoved: scripts.removed
    };
    forceDocRelPaths.push('docs/requirements.md', 'REQUIREMENTS.md');
    summaryLines.push(`📦 package.json: ${added.length} add, ${removed.length} remove, ${changed.length} version bumps in deps/devDeps; ${enginesChanged ? 'ENGINES CHANGED' : 'engines stable'}; scripts: +${scripts.added.length}/-${scripts.removed.length}`);
    const envHints = ['dotenv', 'env-cmd', 'cross-env', 'config', 'convict', 'envalid'];
    const secHints = ['eslint-plugin-security', 'semgrep', 'snyk', '@auth0', 'passport', 'bcrypt', 'argon2', 'jose', 'jsonwebtoken', 'helmet', 'cors', 'csrf', 'rate-limit'];
    const testHints = ['jest', 'vitest', 'mocha', 'cypress', 'playwright', 'puppeteer', 'pytest', 'ava', 'tap', 'karma', '@testing-library', 'supertest', 'sinon', 'nock', 'msw', 'chai', 'ava', 'ts-node'];
    if (packageJson.added.some(p => envHints.some(h => p.toLowerCase().includes(h))) ||
        packageJson.removed.some(p => envHints.some(h => p.toLowerCase().includes(h)))) {
      forceDocRelPaths.push('docs/environment.md', 'ENVIRONMENT.md');
      summaryLines.push('🌱 env/package hints → ENVIRONMENT.md marked for update');
    }
    if (packageJson.added.some(p => secHints.some(h => p.toLowerCase().includes(h))) ||
        packageJson.removed.some(p => secHints.some(h => p.toLowerCase().includes(h)))) {
      forceDocRelPaths.push('docs/security.md', 'SECURITY.md');
      summaryLines.push('🛡️ security deps shifted → SECURITY.md marked for update');
    }
    if (packageJson.added.some(p => testHints.some(h => p.toLowerCase().includes(h))) ||
        packageJson.removed.some(p => testHints.some(h => p.toLowerCase().includes(h))) ||
        packageJson.scriptsAdded.some(s => /test|spec|lint|coverage/i.test(s)) ||
        packageJson.scriptsRemoved.some(s => /test|spec|lint|coverage/i.test(s))) {
      forceDocRelPaths.push('docs/testing.md', 'TESTING.md');
      summaryLines.push('🧪 testing tooling/scripts shifted → TESTING.md marked for update');
    }
    if (packageJson.enginesChanged) {
      forceDocRelPaths.push('docs/requirements.md', 'REQUIREMENTS.md', 'docs/local-setup.md', 'LOCAL_SETUP.md');
      summaryLines.push(`🏗️  engines.node shifted (min ${packageJson.newNodeMin || '?'}) → REQUIREMENTS/LOCAL_SETUP marked`);
    }
  }

  const pyFiles = changedFilesRel.filter(f => /(^|\/)(requirements(-[^/]+)?\.txt|pyproject\.toml|Pipfile)$/.test(f));
  if (pyFiles.length > 0) {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const f of pyFiles) {
      const diff = diffsByFile.get(f) || '';
      for (const raw of diff.split(/\r?\n/)) {
        const mm = raw.match(/^([+-])\s*([A-Za-z0-9_.\-]+)\s*(?:[<>=!~]=?.*)?\s*$/);
        if (!mm) continue;
        if (mm[1] === '+') added.push(mm[2]);
        else removed.push(mm[2]);
      }
    }
    total += pyFiles.length;
    const changed_ = uniq(changed);
    const pySec = ['django', 'flask', 'pyjwt', 'cryptography', 'bcrypt', 'requests', 'urllib3'];
    const pyTest = ['pytest', 'hypothesis', 'tox', 'coverage', 'mock', 'factory-boy', 'selenium'];
    const py: Exclude<ManifestChanges['python'], undefined> = {
      added: uniq(added),
      removed: uniq(removed),
      changed: changed_
    };
    if (py.added.some(p => pySec.some(h => p.toLowerCase().includes(h))) || py.removed.some(p => pySec.some(h => p.toLowerCase().includes(h)))) {
      forceDocRelPaths.push('docs/security.md', 'SECURITY.md');
    }
    if (py.added.some(p => pyTest.some(h => p.toLowerCase().includes(h))) || py.removed.some(p => pyTest.some(h => p.toLowerCase().includes(h)))) {
      forceDocRelPaths.push('docs/testing.md', 'TESTING.md');
    }
    if (py.added.length + py.removed.length > 0) {
      forceDocRelPaths.push('docs/requirements.md', 'REQUIREMENTS.md');
      summaryLines.push(`🐍 python deps (${pyFiles.join(', ')}): ${py.added.length} add, ${py.removed.length} remove`);
    }
  }

  const goFiles = changedFilesRel.filter(f => /(^|\/)go\.mod$/.test(f));
  if (goFiles.length > 0) {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    let goVersionChanged = false;
    for (const f of goFiles) {
      const diff = diffsByFile.get(f) || '';
      for (const raw of diff.split(/\r?\n/)) {
        const m = raw.match(/^([+-])\s*(?:require\s+)?([A-Za-z0-9_.\-/]+)\s+v\d+/);
        if (m) { if (m[1] === '+') added.push(m[2]); else removed.push(m[2]); continue; }
        const vm = raw.match(/^([+-])\s*go\s+(\d+\.\d+(?:\.\d+)?)/);
        if (vm) goVersionChanged = true;
      }
    }
    total += goFiles.length;
    const go: Exclude<ManifestChanges['go'], undefined> = { added: uniq(added), removed: uniq(removed), changed: uniq(changed), goVersionChanged };
    if (go.added.length + go.removed.length > 0 || go.goVersionChanged) {
      forceDocRelPaths.push('docs/requirements.md', 'REQUIREMENTS.md');
      if (go.goVersionChanged) {
        forceDocRelPaths.push('docs/local-setup.md', 'LOCAL_SETUP.md');
      }
      summaryLines.push(`🐹 go.mod: ${go.added.length} add, ${go.removed.length} remove; goVersionChanged=${go.goVersionChanged}`);
    }
  }

  const cargo = changedFilesRel.filter(f => /(^|\/)Cargo\.toml$/.test(f));
  if (cargo.length > 0) {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    let rustVersionChanged = false;
    for (const f of cargo) {
      const diff = diffsByFile.get(f) || '';
      const dep = diffChangedKeys(diff, '[dependencies]');
      added.push(...dep.added); removed.push(...dep.removed); changed.push(...dep.changedValueLines);
      if (diff.includes('rust-version') || diff.includes('edition')) rustVersionChanged = true;
    }
    total += cargo.length;
    const r: Exclude<ManifestChanges['rust'], undefined> = { added: uniq(added), removed: uniq(removed), changed: uniq(changed), rustVersionChanged };
    if (r.added.length + r.removed.length > 0 || rustVersionChanged) {
      forceDocRelPaths.push('docs/requirements.md', 'REQUIREMENTS.md');
      if (rustVersionChanged) forceDocRelPaths.push('docs/local-setup.md', 'LOCAL_SETUP.md');
      summaryLines.push(`🦀 Cargo.toml: ${r.added.length} add, ${r.removed.length} remove; rustEditionChanged=${rustVersionChanged}`);
    }
  }

  const gemfiles = changedFilesRel.filter(f => /(^|\/)Gemfile(\.lock)?$/.test(f));
  if (gemfiles.length > 0) {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const f of gemfiles) {
      const diff = diffsByFile.get(f) || '';
      for (const raw of diff.split(/\r?\n/)) {
        const m = raw.match(/^([+-])\s*gem\s+['"]([^'"]+)['"]/);
        if (m) { if (m[1] === '+') added.push(m[2]); else removed.push(m[2]); }
      }
    }
    total += gemfiles.length;
    const rb: Exclude<ManifestChanges['ruby'], undefined> = { added: uniq(added), removed: uniq(removed), changed: uniq(changed) };
    if (rb.added.length + rb.removed.length > 0) {
      forceDocRelPaths.push('docs/requirements.md', 'REQUIREMENTS.md');
      summaryLines.push(`💎 Gemfile: ${rb.added.length} add, ${rb.removed.length} remove`);
    }
  }

  const actions = changedFilesRel.filter(f => f === 'action.yml' || f.endsWith('/action.yml'));
  if (actions.length > 0) {
    const inputsAdded: string[] = [];
    const inputsRemoved: string[] = [];
    const stepsAdded: string[] = [];
    const stepsRemoved: string[] = [];
    for (const f of actions) {
      const diff = diffsByFile.get(f) || '';
      const inp = diffChangedKeys(diff, 'inputs:');
      inputsAdded.push(...inp.added); inputsRemoved.push(...inp.removed);
      const runs = diffChangedKeys(diff, 'runs:');
      const steps = diffChangedKeys(diff, 'steps:');
      stepsAdded.push(...runs.added.filter(s => s !== undefined), ...steps.added);
      stepsRemoved.push(...runs.removed.filter(s => s !== undefined), ...steps.removed);
    }
    total += actions.length;
    const gh: Exclude<ManifestChanges['githubAction'], undefined> = { inputsAdded: uniq(inputsAdded), inputsRemoved: uniq(inputsRemoved), stepsAdded: uniq(stepsAdded), stepsRemoved: uniq(stepsRemoved) };
    if ((gh.inputsAdded.length + gh.inputsRemoved.length) > 0) {
      forceDocRelPaths.push('docs/environment.md', 'ENVIRONMENT.md');
      summaryLines.push(`⚙️  action.yml inputs changed (+${gh.inputsAdded.length}/-${gh.inputsRemoved.length}) → ENVIRONMENT.md marked`);
    }
    if ((gh.stepsAdded.length + gh.stepsRemoved.length) > 0) {
      forceDocRelPaths.push('docs/pipelines.md', 'docs/ci.md', 'PIPELINES.md');
      summaryLines.push(`🔧 action.yml steps changed (+${gh.stepsAdded.length}/-${gh.stepsRemoved.length}) → PIPELINES.md marked`);
    }
  }

  const out: ManifestChanges = {
    total,
    packageJson,
    triggers: {
      forceDocRelPaths: uniq(forceDocRelPaths).filter(Boolean),
      summaryLines
    }
  };
  return out;
};

const extractNodeEngineFloor = (repoRoot: string, pkgFile: string): string | null => {
  const abs = path.join(repoRoot, pkgFile);
  if (!fs.existsSync(abs)) return null;
  try {
    const obj = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const eng = obj && obj.engines && (obj.engines.node || obj.engines.nodejs);
    if (!eng) return null;
    const m = String(eng).match(/(?:>=|\^|~)?\s*(\d+(?:\.\d+){0,2})/);
    return m ? m[1] : String(eng);
  } catch { return null; }
};

export type DocPrComment = {
  summaryMarkdown: string;
  touchedDocRels: string[];
  skippedFreshRels: string[];
  codeToDocTableRows: Array<{ code: string; docs: string[]; score: number }>;
  coverageByModule: Array<{ module: string; coveredExports: number; totalExports: number; pct: number }>;
};

export type CodeDocCoverage = {
  byModule: Array<{ module: string; coveredExports: number; totalExports: number; pct: number }>;
  codeToDocTable: Array<{ code: string; docs: string[]; score: number }>;
  totalDocs: number;
  totalExports: number;
  coveredExports: number;
  overallPct: number;
};

export const computeCodeDocCoverage = (params: {
  repoRoot: string;
  changedFilesRel: string[];
  allDocsAbs: string[];
  downstreamImpact: DownstreamImpact[];
  mentions: DiffMentions;
}): CodeDocCoverage => {
  const { repoRoot, changedFilesRel, allDocsAbs, downstreamImpact, mentions } = params;
  const docsByExportHit = new Map<string, string[]>();
  for (const docAbs of allDocsAbs) {
    const body = readTextFile(docAbs).toLowerCase();
    const rel = getRepoRelPosix(repoRoot, docAbs);
    for (const s of mentions.symbols) {
      if (!s) continue;
      if (body.includes(`\`${s.toLowerCase()}\``) || body.includes(s.toLowerCase())) {
        const a = docsByExportHit.get(s) || [];
        if (!a.includes(rel)) a.push(rel);
        docsByExportHit.set(s, a);
      }
    }
  }

  const moduleExports = new Map<string, ExportedName[]>();
  const collect = (fileRel: string) => {
    const abs = path.join(repoRoot, fileRel);
    const list = extractExportsFromFile(abs);
    for (const e of list) e.fileRel = fileRel;
    const segments = fileRel.split('/').filter(Boolean);
    let key = segments.slice(0, 2).join('/') || 'root';
    if (segments.length > 3) key = `${segments[0]}/${segments[1]}`;
    const arr = moduleExports.get(key) || [];
    arr.push(...list);
    moduleExports.set(key, arr);
  };
  for (const rel of changedFilesRel) collect(rel);
  for (const imp of downstreamImpact) {
    for (const d of imp.downstreamFiles) collect(d);
  }

  const byModule: CodeDocCoverage['byModule'] = [];
  let coveredExportsTotal = 0;
  let totalExportsTotal = 0;
  for (const [mod, exports_] of moduleExports.entries()) {
    let covered = 0;
    for (const e of exports_) {
      if (docsByExportHit.has(e.name)) covered += 1;
    }
    byModule.push({
      module: mod,
      coveredExports: covered,
      totalExports: exports_.length,
      pct: exports_.length ? Math.round((covered / exports_.length) * 1000) / 10 : 0
    });
    coveredExportsTotal += covered;
    totalExportsTotal += exports_.length;
  }

  const codeToDocTable: CodeDocCoverage['codeToDocTable'] = [];
  const topHits = new Map<string, { docs: string[]; score: number }>();
  for (const rel of changedFilesRel) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) continue;
    const list = extractExportsFromFile(abs);
    let score = 0;
    const docSet = new Set<string>();
    for (const e of list) {
      const hitDocRels = docsByExportHit.get(e.name);
      if (hitDocRels) {
        score += hitDocRels.length;
        for (const d of hitDocRels) docSet.add(d);
      }
    }
    const imp = downstreamImpact.find(i => i.exported.fileRel === rel);
    if (imp) score += Math.min(20, imp.downstreamFiles.length);
    const docList = Array.from(docSet).sort();
    if (score > 0 || docList.length > 0) {
      topHits.set(rel, { docs: docList, score });
    }
  }
  for (const [code, info] of topHits.entries()) {
    codeToDocTable.push({ code, docs: info.docs, score: info.score });
  }
  codeToDocTable.sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  return {
    byModule: byModule.sort((a, b) => b.totalExports - a.totalExports || a.module.localeCompare(b.module)),
    codeToDocTable: codeToDocTable.slice(0, 40),
    totalDocs: allDocsAbs.length,
    totalExports: totalExportsTotal,
    coveredExports: coveredExportsTotal,
    overallPct: totalExportsTotal ? Math.round((coveredExportsTotal / totalExportsTotal) * 1000) / 10 : 0
  };
};

export const buildDocPrCommentSummary = (params: {
  repoRoot: string;
  mode: string;
  changedFilesRel: string[];
  touchedDocRels: string[];
  skippedFreshRels: string[];
  perDocImpactScores: Map<string, number>;
  coverage: CodeDocCoverage;
  manifest: ManifestChanges | null;
  staleSectionsByDoc?: Map<string, StaleSectionHit[]>;
  prNumber?: number | null;
  totalChangedFiles: number;
}): DocPrComment => {
  const touched = params.touchedDocRels.slice();
  const skipped = params.skippedFreshRels.slice();

  const lines: string[] = [];
  lines.push(`### 📚 Orchestra Documentation Impact Report (mode=\`${params.mode}\`)`);
  lines.push('');
  lines.push(`Code changes in scope: **${params.totalChangedFiles}** files. Docs: **touched ${touched.length}** · **fresh (skipped) ${skipped.length}**.`);
  lines.push('');

  if (params.manifest && (params.manifest.triggers.summaryLines.length > 0 || params.manifest.total > 0)) {
    lines.push('#### 🧾 Manifest / dependency shifts');
    for (const l of params.manifest.triggers.summaryLines) lines.push(`- ${l}`);
    lines.push('');
  }

  if (touched.length > 0) {
    lines.push('#### ✏️  Updated / regenerated documentation files');
    for (const rel of touched) {
      const score = params.perDocImpactScores.get(rel) ?? 0;
      const stales = params.staleSectionsByDoc?.get(rel);
      const sectionTag = stales && stales.length > 0 ? ` — ${stales.length} stale section(s): ${stales.slice(0, 4).map(s => `\`${s.section.heading}\``).join(', ')}` : '';
      lines.push(`- \`${rel}\` (impact-score ${score})${sectionTag}`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push('#### ⏭️  Skipped as fresh (no incremental-drift detected)');
    for (const rel of skipped.slice(0, 20)) lines.push(`- \`${rel}\``);
    if (skipped.length > 20) lines.push(`- … and ${skipped.length - 20} more`);
    lines.push('');
  }

  if (params.coverage.codeToDocTable.length > 0) {
    lines.push('#### 🗂️  Changed code file → documentation file cross-reference');
    lines.push('| Code file | Referenced in docs | Impact score |');
    lines.push('|---|---|---:|');
    for (const row of params.coverage.codeToDocTable.slice(0, 30)) {
      lines.push(`| \`${row.code}\` | ${row.docs.length ? row.docs.map(d => `\`${d}\``).join(', ') : '_(not yet documented)_'} | ${row.score} |`);
    }
    lines.push('');
  }

  if (params.coverage.byModule.length > 0) {
    lines.push(`#### 📊 Export-based doc coverage (overall: **${params.coverage.overallPct}%**)`);
    lines.push('| Module | Covered exports | Total exports | % |');
    lines.push('|---|---:|---:|---:|');
    for (const m of params.coverage.byModule.slice(0, 20)) {
      lines.push(`| \`${m.module}\` | ${m.coveredExports} | ${m.totalExports} | ${m.pct}% |`);
    }
    lines.push('');
  }

  try {
    const artifact = readOpengrepArtifact(params.repoRoot);
    if (artifact && Array.isArray(artifact.results) && artifact.results.length > 0) {
      const groups = findingsGroupedByModule(artifact.results, { moduleDepth: 2 });
      lines.push('#### 🔍 Static Analysis (Opengrep) hits by module');
      lines.push('| Module | Findings | 🔴 | 🟠 | 🟡 | ⚪ |');
      lines.push('|---|---:|---:|---:|---:|---:|');
      for (const g of groups.slice(0, 15)) {
        lines.push(`| \`${g.module.replace(/\|/g, '\\|')}\` | ${g.findings.length} | ${g.bySeverity['HIGH'] || g.bySeverity['ERROR'] || 0} | ${g.bySeverity['MEDIUM'] || g.bySeverity['WARNING'] || 0} | ${g.bySeverity['LOW'] || g.bySeverity['INFO'] || 0} | ${g.bySeverity['UNKNOWN'] || 0} |`);
      }
      lines.push('');
      lines.push(`> Run \`orchestra static-analysis ${params.repoRoot}\` to open/manage these findings as VCS issues. Modules appearing here are also highlighted downstream in the SBOM & vulnerability reports.`);
      lines.push('');
    }
  } catch {}

  try {
    const testArt = readTestArtifact(params.repoRoot);
    if (testArt && (testArt.testsDiscovered > 0 || testArt.findings.length > 0)) {
      lines.push('#### 🧪 Test results (orchestra test-gen)');
      lines.push(`Framework: \`${testArt.framework}\`. Generated **${testArt.testsGenerated}** new tests, discovered **${testArt.testsDiscovered}** → ✅ ${testArt.testsPassed} · ❌ ${testArt.testsFailed} · 💥 ${testArt.testsErrored} · ⏭️ ${testArt.testsSkipped} in ${(testArt.totalDurationMs / 1000).toFixed(2)}s.`);
      lines.push('');
      const failing = testArt.findings.filter(f => f.outcome === 'failed' || f.outcome === 'error' || f.outcome === 'timeout');
      if (failing.length > 0) {
        lines.push('| # | Outcome | Test file | Suite / Test | Duration (ms) |');
        lines.push('|---:|---|---|---|---:|');
        for (let i = 0; i < Math.min(15, failing.length); i++) {
          const f = failing[i];
          const q = f.suite ? `**${f.suite}** › ${f.testName}` : f.testName;
          lines.push(`| ${i + 1} | ${f.outcome === 'failed' ? '❌' : '💥'} \`${f.outcome}\` | \`${f.testFilePath.replace(/\|/g, '\\|')}\` | ${q.replace(/\|/g, '\\|')} | ${f.durationMs ?? '—'} |`);
        }
        lines.push('');
      }
    }
  } catch {}

  if (params.prNumber) {
    lines.push(`Generated for PR #${params.prNumber}. Review the touched docs listed above before merging; the skipped-fresh list is saved in \`.orchestra/doc-gen-state.json\` for incremental reruns.`);
  }

  return {
    summaryMarkdown: lines.join('\n'),
    touchedDocRels: touched,
    skippedFreshRels: skipped,
    codeToDocTableRows: params.coverage.codeToDocTable,
    coverageByModule: params.coverage.byModule
  };
};

export const DEFAULT_TOPIC_HINTS = DEFAULT_TOPIC_FILE_HINTS;
