import testGenPlugin from './index';

describe('test-gen plugin', () => {
  test('exports expected command metadata', () => {
    expect(testGenPlugin.command).toBe('test-gen');
    expect(typeof testGenPlugin.action).toBe('function');
  });
});
