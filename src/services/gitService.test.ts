import { buildBranchName } from './gitService';

describe('buildBranchName', () => {
  test('includes kind and slugified context', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
    expect(buildBranchName('feature', 'Hello World!')).toContain('orchestra/feature/hello-world-');
  });

  test('omits context when empty', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1710000000000);
    expect(buildBranchName('chore', '')).toContain('orchestra/chore-');
  });
});
