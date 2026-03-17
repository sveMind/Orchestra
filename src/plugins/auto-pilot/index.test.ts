import autoPilotPlugin from './index';

describe('auto-pilot plugin', () => {
  test('exports expected command metadata', () => {
    expect(autoPilotPlugin.command).toBe('auto');
    expect(typeof autoPilotPlugin.action).toBe('function');
  });
});
