import os from 'os';
import path from 'path';
import fs from 'fs';
import {
  isTruthyEnv,
  normalizeAiMarkdown,
  readTextFile,
  readTextFileTruncated,
  writeFileIfChanged,
  sha1,
  normalizeForDuplicateHash,
  buildOpenApiYaml,
  isMeaningfulDocUpdate,
  getRepoRelPosix,
  isMarkdownDocFile,
  isMarkdownFile,
} from './docUtils';

describe('isTruthyEnv', () => {
  test('returns true for truthy values', () => {
    expect(isTruthyEnv('1')).toBe(true);
    expect(isTruthyEnv('true')).toBe(true);
    expect(isTruthyEnv('TRUE')).toBe(true);
    expect(isTruthyEnv('True')).toBe(true);
    expect(isTruthyEnv('yes')).toBe(true);
    expect(isTruthyEnv('YES')).toBe(true);
    expect(isTruthyEnv('on')).toBe(true);
    expect(isTruthyEnv('  1  ')).toBe(true);
  });

  test('returns false for falsy or empty values', () => {
    expect(isTruthyEnv('')).toBe(false);
    expect(isTruthyEnv(undefined)).toBe(false);
    expect(isTruthyEnv('0')).toBe(false);
    expect(isTruthyEnv('false')).toBe(false);
    expect(isTruthyEnv('no')).toBe(false);
    expect(isTruthyEnv('off')).toBe(false);
    expect(isTruthyEnv('random')).toBe(false);
  });
});

describe('normalizeAiMarkdown', () => {
  test('empty response returns noChange=true', () => {
    expect(normalizeAiMarkdown('')).toEqual({ content: '', noChange: true });
    expect(normalizeAiMarkdown('   ')).toEqual({ content: '', noChange: true });
    expect(normalizeAiMarkdown(null as any)).toEqual({ content: '', noChange: true });
  });

  test('exact NO_CHANGE signal', () => {
    expect(normalizeAiMarkdown('NO_CHANGE')).toEqual({ content: '', noChange: true });
    expect(normalizeAiMarkdown('no_change')).toEqual({ content: '', noChange: true });
    expect(normalizeAiMarkdown('  NO_CHANGE  ')).toEqual({ content: '', noChange: true });
  });

  test('strict fenced markdown block (markdown lang)', () => {
    const input = '```markdown\n# Hello\n\nParagraph\n```';
    expect(normalizeAiMarkdown(input)).toEqual({
      content: '# Hello\n\nParagraph',
      noChange: false,
    });
  });

  test('strict fenced block with NO_CHANGE inside', () => {
    const input = '```md\nNO_CHANGE\n```';
    expect(normalizeAiMarkdown(input)).toEqual({ content: '', noChange: true });
  });

  test('loose fenced block (markdown) with surrounding chatter', () => {
    const input = 'Here is the doc:\n```markdown\n# Real Doc\n```\nHope that helps!';
    expect(normalizeAiMarkdown(input)).toEqual({ content: '# Real Doc', noChange: false });
  });

  test('bare raw text (no fences) is returned as-is', () => {
    const input = '# Title\n\nSome content';
    expect(normalizeAiMarkdown(input)).toEqual({ content: input, noChange: false });
  });
});

describe('sha1', () => {
  test('produces consistent hashes', () => {
    expect(sha1('hello world')).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
});

describe('normalizeForDuplicateHash', () => {
  test('collapses whitespace and normalizes newlines', () => {
    const input = 'Line1\r\nLine2   \t  spaces\n\n\n\nLine3\n\n   ';
    const result = normalizeForDuplicateHash(input);
    expect(result).toBe('Line1\nLine2 spaces\n\nLine3');
  });

  test('handles empty content safely', () => {
    expect(normalizeForDuplicateHash('')).toBe('');
    expect(normalizeForDuplicateHash(null as any)).toBe('');
  });
});

describe('readTextFile', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docutils-'));

  test('reads existing file content', () => {
    const p = path.join(tmp, 'a.txt');
    fs.writeFileSync(p, 'hello\nworld');
    expect(readTextFile(p)).toBe('hello\nworld');
  });

  test('returns empty string for missing file', () => {
    expect(readTextFile(path.join(tmp, 'does-not-exist.txt'))).toBe('');
  });
});

describe('readTextFileTruncated', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docutils-'));

  test('returns full content when under limit', () => {
    const p = path.join(tmp, 's.txt');
    fs.writeFileSync(p, 'abc');
    expect(readTextFileTruncated(p, 10)).toBe('abc');
  });

  test('truncates content when over limit with marker', () => {
    const p = path.join(tmp, 'l.txt');
    fs.writeFileSync(p, 'abcdefgh');
    const out = readTextFileTruncated(p, 3);
    expect(out).toBe('abc\n\n...[truncated 5 chars]');
  });

  test('returns empty for missing file', () => {
    expect(readTextFileTruncated(path.join(tmp, 'x.txt'), 10)).toBe('');
  });
});

describe('writeFileIfChanged', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docutils-'));

  test('writes new file and returns true', () => {
    const p = path.join(tmp, 'new.md');
    const result = writeFileIfChanged(p, '# Hello');
    expect(result).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toBe('# Hello\n');
  });

  test('creates parent directories', () => {
    const p = path.join(tmp, 'nested', 'deep', 'f.md');
    writeFileIfChanged(p, 'x');
    expect(fs.existsSync(p)).toBe(true);
  });

  test('returns false and skips writing for identical content (normalizing line endings & trailing ws)', () => {
    const p = path.join(tmp, 'same.md');
    fs.writeFileSync(p, '# Same\n');
    const statBefore = fs.statSync(p);
    const result = writeFileIfChanged(p, '# Same  \r\n');
    expect(result).toBe(false);
    // mtime should not have advanced on a no-op write
    expect(fs.statSync(p).mtimeMs).toBe(statBefore.mtimeMs);
  });

  test('returns true and writes when content actually changed', () => {
    const p = path.join(tmp, 'changed.md');
    fs.writeFileSync(p, 'old\n');
    const result = writeFileIfChanged(p, 'new');
    expect(result).toBe(true);
    expect(fs.readFileSync(p, 'utf8')).toBe('new\n');
  });
});

describe('buildOpenApiYaml', () => {
  test('empty endpoints produce openapi skeleton with {} paths', () => {
    const out = buildOpenApiYaml([]);
    expect(out).toContain('openapi: 3.0.3');
    expect(out).toContain("title: API");
    expect(out).toContain('paths:\n  {}');
  });

  test('sorts endpoints by path then method', () => {
    const out = buildOpenApiYaml([
      { method: 'POST', path: '/a', source: 'x.js' },
      { method: 'GET', path: '/a', source: 'x.js' },
      { method: 'GET', path: '/b', source: 'y.py' },
    ]);
    expect(out.indexOf('/a:')).toBeLessThan(out.indexOf('/b:'));
    // Within /a, GET comes before POST
    expect(out.indexOf("    get:")).toBeLessThan(out.indexOf("    post:"));
  });

  test('includes source description when provided', () => {
    const out = buildOpenApiYaml([{ method: 'GET', path: '/x', source: 'api.ts' }]);
    expect(out).toContain('description: Source: api.ts');
  });
});

describe('isMeaningfulDocUpdate', () => {
  test('returns false when normalized content is identical', () => {
    const s = '# Title\n\nBody text with lots of words here.';
    const s2 = s + '\r\n    \n\n'; // only whitespace diff
    expect(isMeaningfulDocUpdate(s, s2)).toBe(false);
  });

  test('returns true when headings change (marker change)', () => {
    const a = '# Old Title\n\nSome words words words words words words';
    const b = '# New Title\n\nSome words words words words words words';
    expect(isMeaningfulDocUpdate(a, b)).toBe(true);
  });

  test('returns true when inline code markers change', () => {
    const a = '# Doc\n\nUse `npm install foo` to start.';
    const b = '# Doc\n\nUse `pip install bar` to start.';
    expect(isMeaningfulDocUpdate(a, b)).toBe(true);
  });

  test('returns true when URLs change', () => {
    const a = '# Doc\n\nSee https://example.com/v1 for docs.';
    const b = '# Doc\n\nSee https://example.com/v2 for docs.';
    expect(isMeaningfulDocUpdate(a, b)).toBe(true);
  });

  test('returns true when code fence first lines change', () => {
    const a = '# Doc\n\n```bash\nnpm run old\n```';
    const b = '# Doc\n\n```bash\nnpm run new\n```';
    expect(isMeaningfulDocUpdate(a, b)).toBe(true);
  });

  test('returns false for small cosmetic rephrases (jaccard >= 0.90)', () => {
    // Mostly the same prose, 1 word swapped in a 20+ word paragraph
    const a =
      'The quick brown fox jumps over the lazy dog every single morning to exercise and prepare for the busy day ahead ' +
      'of running deliveries across the entire neighborhood and the surrounding suburban region.';
    const b =
      'The quick brown fox leaps over the lazy dog every single morning to exercise and prepare for the busy day ahead ' +
      'of running deliveries across the entire neighborhood and the surrounding suburban area.';
    expect(isMeaningfulDocUpdate(a, b)).toBe(false);
  });

  test('returns true for substantive rewrite (jaccard < 0.90)', () => {
    const a = 'Installation:\n\nRun npm install. Then run npm start.';
    const b = 'Deployment:\n\nFirst build the docker image via docker build. Then apply the kubernetes manifest.';
    expect(isMeaningfulDocUpdate(a, b)).toBe(true);
  });
});

describe('getRepoRelPosix', () => {
  test('returns POSIX-style relative path', () => {
    const repo = '/Users/alice/project';
    const full = '/Users/alice/project/docs/API.md';
    expect(getRepoRelPosix(repo, full)).toBe('docs/API.md');
  });
});

describe('isMarkdownDocFile', () => {
  test('matches .md and .mdx case-insensitively', () => {
    expect(isMarkdownDocFile('README.md')).toBe(true);
    expect(isMarkdownDocFile('a/guide.MD')).toBe(true);
    expect(isMarkdownDocFile('doc/index.mdx')).toBe(true);
    expect(isMarkdownDocFile('index.mdx')).toBe(true);
  });

  test('rejects other extensions', () => {
    expect(isMarkdownDocFile('src/x.ts')).toBe(false);
    expect(isMarkdownDocFile('README.md.txt')).toBe(false);
    expect(isMarkdownDocFile('')).toBe(false);
  });
});

describe('isMarkdownFile', () => {
  test('matches only .md extension via path.extname', () => {
    expect(isMarkdownFile('x.md')).toBe(true);
    expect(isMarkdownFile('x.MD')).toBe(true);
    expect(isMarkdownFile('x.mdx')).toBe(false);
    expect(isMarkdownFile('x.ts')).toBe(false);
  });
});
