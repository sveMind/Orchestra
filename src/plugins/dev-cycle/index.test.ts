import devCyclePlugin from './index';

describe('dev-cycle plugin', () => {
  test('exports expected command metadata', () => {
    expect(devCyclePlugin.command).toBe('dev-cycle');
    expect(typeof devCyclePlugin.action).toBe('function');
  });
});
