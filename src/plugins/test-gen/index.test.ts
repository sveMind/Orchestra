import testGenPlugin, { generateTests } from './index';
import { consultAgentRouted } from '../../services/agentService';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('../../services/agentService', () => ({
  consultAgentRouted: jest.fn(),
  AgentRole: { QA_ENGINEER: 'qa_engineer' },
}));

describe('test-gen plugin metadata', () => {
  test('exports expected command metadata', () => {
    expect(testGenPlugin.command).toBe('test-gen');
    expect(typeof testGenPlugin.action).toBe('function');
    expect(Array.isArray(testGenPlugin.args)).toBe(true);
    expect(testGenPlugin.args!.map((a: any) => a.name)).toEqual(['path', 'framework']);
    expect(testGenPlugin.description).toContain('Jest');
    expect(testGenPlugin.description).toContain('pytest');
  });
});

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'testgen-'));

describe('test-gen: file output logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('errors out gracefully when source file does not exist', async () => {
    const spyError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await testGenPlugin.action('/this/does/not/exist.ts');
    expect(spyError).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    spyError.mockRestore();
  });

  test('for TypeScript, builds a Jest-style <name>.test.ts next to source', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'math.ts');
    fs.writeFileSync(src, `export const add = (a: number, b: number) => a + b;\n`);
    (consultAgentRouted as jest.Mock).mockResolvedValueOnce(`import { add } from './math';
describe('add', () => {
  it('adds two numbers', () => expect(add(1, 2)).toBe(3));
});
`);

    await testGenPlugin.action(src);

    const expectedPath = path.join(dir, 'math.test.ts');
    expect(fs.existsSync(expectedPath)).toBe(true);
    const content = fs.readFileSync(expectedPath, 'utf8');
    expect(content).toContain('expect(add(1, 2)).toBe(3)');
    const prompt = (consultAgentRouted as jest.Mock).mock.calls[0][1];
    expect(prompt).toContain("import { ... } from './math'");
    expect(prompt).toContain('jest.mock');
    expect(prompt).toContain('null / undefined / empty inputs');
  });

  test('for Python, builds pytest test_<name>.py next to source', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'solver.py');
    fs.writeFileSync(src, `def solve(x):\n    return x * 2\n`);
    (consultAgentRouted as jest.Mock).mockResolvedValueOnce(`from solver import solve

def test_solve_double():
    assert solve(21) == 42
`);

    await testGenPlugin.action(src);

    const expectedPath = path.join(dir, 'test_solver.py');
    expect(fs.existsSync(expectedPath)).toBe(true);
    const prompt = (consultAgentRouted as jest.Mock).mock.calls[0][1];
    expect(prompt).toContain('pytest.raises');
    expect(prompt).toContain('@pytest.mark.parametrize');
    expect(prompt).toContain('monkeypatch');
  });

  test('for C files, builds <name>_test.c next to source', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'calc.c');
    fs.writeFileSync(src, `int add(int a, int b) { return a + b; }\n`);
    (consultAgentRouted as jest.Mock).mockResolvedValueOnce(`#include "calc.c"
#include <assert.h>
int main(void) { assert(add(1,2) == 3); return 0; }
`);

    await testGenPlugin.action(src);
    const expectedPath = path.join(dir, 'calc_test.c');
    expect(fs.existsSync(expectedPath)).toBe(true);
    const prompt = (consultAgentRouted as jest.Mock).mock.calls[0][1];
    expect(prompt).toContain('#include "calc.c"');
    expect(prompt).toContain('assert.h');
    expect(prompt).toContain('NULL-pointer inputs');
  });

  test('passes existing test file contents so AI can extend (not overwrite) Jest tests', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'util.ts');
    const existingTest = path.join(dir, 'util.test.ts');
    fs.writeFileSync(src, `export const upper = (s: string) => s.toUpperCase();\n`);
    fs.writeFileSync(existingTest, `import { upper } from './util';\ndescribe('upper', () => {\n  it('works', () => expect(upper('a')).toBe('A'));\n});\n`);

    (consultAgentRouted as jest.Mock).mockResolvedValueOnce(`import { upper } from './util';
describe('upper', () => {
  it('works', () => expect(upper('a')).toBe('A'));
  it('handles empty string', () => expect(upper('')).toBe(''));
});
`);

    await testGenPlugin.action(src);

    const prompt = (consultAgentRouted as jest.Mock).mock.calls[0][1];
    expect(prompt).toContain('An existing test file already exists');
    expect(prompt).toContain("it('works', () => expect(upper('a')).toBe('A'))");
    expect(prompt).toContain('UPDATE or EXTEND the existing test file. Keep all passing describe/it blocks intact.');

    const written = fs.readFileSync(existingTest, 'utf8');
    expect(written).toContain("handles empty string");
  });

  test('skips writing when AI says NO_CHANGE or output matches existing', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'noop.ts');
    const testFile = path.join(dir, 'noop.test.ts');
    const existingContent = `describe('noop', () => { it('runs', () => {}); });\n`;
    fs.writeFileSync(src, `export const noop = () => {};\n`);
    fs.writeFileSync(testFile, existingContent);

    (consultAgentRouted as jest.Mock).mockResolvedValueOnce('NO_CHANGE');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    await testGenPlugin.action(src);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('No new test coverage needed'));
    expect(fs.readFileSync(testFile, 'utf8')).toBe(existingContent);
    log.mockRestore();
  });

  test('framework CLI arg overrides extension auto-detection', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'foo.ts');
    fs.writeFileSync(src, `export const x = 1;\n`);
    (consultAgentRouted as jest.Mock).mockResolvedValueOnce(`def test_x():\n    assert 1 == 1\n`);

    await testGenPlugin.action(src, 'pytest');
    const prompt = (consultAgentRouted as jest.Mock).mock.calls[0][1];
    expect(prompt).toContain('pytest');
    expect(prompt).not.toContain('Jest');
    expect(fs.existsSync(path.join(dir, 'test_foo.ts'))).toBe(true);
  });
});

describe('generateTests helper', () => {
  test('delegates to plugin action', async () => {
    const dir = tmpDir();
    const src = path.join(dir, 'm.ts');
    fs.writeFileSync(src, `export const a = 1;\n`);
    (consultAgentRouted as jest.Mock).mockResolvedValueOnce(`describe('a', () => {});\n`);
    await generateTests(src);
    expect(fs.existsSync(path.join(dir, 'm.test.ts'))).toBe(true);
  });
});
