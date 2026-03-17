import docGenPlugin from './index';

describe('doc-gen plugin', () => {
  test('exports expected command metadata', () => {
    expect(docGenPlugin.command).toBe('doc-gen');
    expect(typeof docGenPlugin.action).toBe('function');
  });
});
