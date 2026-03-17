import vulnScanPlugin from './index';

describe('vuln-scan plugin', () => {
  test('exports expected command metadata', () => {
    expect(vulnScanPlugin.command).toBe('vuln-scan');
    expect(typeof vulnScanPlugin.action).toBe('function');
  });
});
