import codeFixerPlugin from './index';

describe('code-fixer plugin', () => {
  test('exports expected command metadata', () => {
    expect(codeFixerPlugin.command).toBe('fix');
    expect(typeof codeFixerPlugin.action).toBe('function');
  });
});
