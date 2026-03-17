import releaseNotesPlugin from './index';

describe('release-notes plugin', () => {
  test('exports expected command metadata', () => {
    expect(releaseNotesPlugin.command).toBe('release-notes');
    expect(typeof releaseNotesPlugin.action).toBe('function');
  });
});
