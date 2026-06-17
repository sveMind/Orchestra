import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const isTruthyEnv = (value: string | undefined): boolean => {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return false;
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};

export const normalizeAiMarkdown = (aiResponse: string): { content: string; noChange: boolean } => {
  const raw = String(aiResponse ?? '').trim();
  if (!raw) return { content: '', noChange: true };

  if (raw.toUpperCase() === 'NO_CHANGE') return { content: '', noChange: true };

  const fenced = raw.match(/^```(?:markdown|md|[a-zA-Z0-9_-]+)?\n([\s\S]*?)```$/);
  if (fenced && fenced[1]) {
    const inner = fenced[1].trim();
    if (!inner || inner.toUpperCase() === 'NO_CHANGE') return { content: '', noChange: true };
    return { content: inner, noChange: false };
  }

  // If the AI outputs a markdown block but it has leading/trailing text, extract just the markdown block
  const looseFenced = raw.match(/```(?:markdown|md)\n([\s\S]*?)```/);
  if (looseFenced && looseFenced[1]) {
    const inner = looseFenced[1].trim();
    if (!inner || inner.toUpperCase() === 'NO_CHANGE') return { content: '', noChange: true };
    return { content: inner, noChange: false };
  }

  return { content: raw, noChange: false };
};

export const readTextFile = (filePath: string): string => {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
};

export const readTextFileTruncated = (filePath: string, maxChars: number): string => {
  const text = readTextFile(filePath);
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n...[truncated ${text.length - maxChars} chars]`;
};

export const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

export const writeFileIfChanged = (filePath: string, next: string): boolean => {
  const existing = fs.existsSync(filePath) ? readTextFile(filePath) : '';
  const normalizedExisting = existing.replace(/\r\n/g, '\n').trimEnd();
  const normalizedNext = String(next || '').replace(/\r\n/g, '\n').trimEnd();
  if (normalizedExisting === normalizedNext) return false;
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, normalizedNext + '\n');
  return true;
};

export const sha1 = (input: string): string => crypto.createHash('sha1').update(input).digest('hex');

export const normalizeForDuplicateHash = (content: string): string => {
  return String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const buildOpenApiYaml = (endpoints: Array<{ method: string; path: string; source: string }>): string => {
  const sorted = endpoints
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
    .slice(0, 200);

  const lines: string[] = [];
  lines.push('openapi: 3.0.3');
  lines.push('info:');
  lines.push('  title: API');
  lines.push('  version: 0.1.0');
  lines.push('paths:');
  if (!sorted.length) {
    lines.push('  {}');
    return lines.join('\n') + '\n';
  }

  const byPath = new Map<string, typeof sorted>();
  for (const e of sorted) {
    const group = byPath.get(e.path) || [];
    group.push(e);
    byPath.set(e.path, group);
  }

  for (const p of Array.from(byPath.keys()).sort()) {
    lines.push(`  ${p}:`);
    const group = byPath.get(p) || [];
    const byMethod = new Map<string, typeof group>();
    for (const e of group) {
      const key = e.method.toLowerCase();
      const list = byMethod.get(key) || [];
      list.push(e);
      byMethod.set(key, list);
    }
    for (const method of Array.from(byMethod.keys()).sort()) {
      const src = byMethod.get(method)?.[0]?.source || '';
      lines.push(`    ${method}:`);
      lines.push(`      summary: ${method.toUpperCase()} ${p}`);
      if (src) lines.push(`      description: Source: ${src}`);
      lines.push('      responses:');
      lines.push("        '200':");
      lines.push('          description: OK');
    }
  }

  return lines.join('\n') + '\n';
};

const extractDocMarkers = (content: string): {
  headings: string[];
  inlineCode: string[];
  urls: string[];
  fenceFirstLines: string[];
} => {
  const text = String(content || '').replace(/\r\n/g, '\n');
  const headings = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^#{1,6}\s+\S+/.test(l));

  const inlineCode: string[] = [];
  const inlineCodeRe = /`([^`\n]{1,120})`/g;
  for (const m of text.matchAll(inlineCodeRe)) {
    if (m[1]) inlineCode.push(m[1]);
  }

  const urls: string[] = [];
  const urlRe = /\bhttps?:\/\/[^\s)>\]]+/gi;
  for (const m of text.matchAll(urlRe)) {
    if (m[0]) urls.push(m[0]);
  }

  const fenceFirstLines: string[] = [];
  const fenceRe = /```[^\n]*\n([\s\S]*?)```/g;
  for (const m of text.matchAll(fenceRe)) {
    const block = (m[1] || '').split('\n').map(l => l.trim()).filter(Boolean);
    if (block.length) fenceFirstLines.push(block[0]);
  }

  const uniq = (arr: string[]) => Array.from(new Set(arr.map(s => s.trim()).filter(Boolean))).sort();
  return {
    headings: uniq(headings),
    inlineCode: uniq(inlineCode),
    urls: uniq(urls),
    fenceFirstLines: uniq(fenceFirstLines)
  };
};

const jaccardSimilarity = (a: string, b: string): number => {
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 1 : inter / union;
};

export const isMeaningfulDocUpdate = (existing: string, next: string): boolean => {
  const a = normalizeForDuplicateHash(existing);
  const b = normalizeForDuplicateHash(next);
  if (a === b) return false;

  const ma = extractDocMarkers(existing);
  const mb = extractDocMarkers(next);
  const markersChanged =
    ma.headings.join('\n') !== mb.headings.join('\n') ||
    ma.inlineCode.join('\n') !== mb.inlineCode.join('\n') ||
    ma.urls.join('\n') !== mb.urls.join('\n') ||
    ma.fenceFirstLines.join('\n') !== mb.fenceFirstLines.join('\n');
  if (markersChanged) return true;

  const sim = jaccardSimilarity(existing, next);
  return sim < 0.90; // Strict threshold to prevent small meaningless textual alternations
};

export const getRepoRelPosix = (repoRoot: string, absPath: string): string => {
  return path.relative(repoRoot, absPath).replace(/\\/g, '/');
};

export const isMarkdownDocFile = (repoRelOrPath: string): boolean => {
  const lower = String(repoRelOrPath || '').toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.mdx');
};

export const isMarkdownFile = (filePath: string): boolean => path.extname(filePath).toLowerCase() === '.md';

