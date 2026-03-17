import fs from 'fs';
import path from 'path';

describe('package metadata', () => {
  test('package.json has name and version', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const raw = fs.readFileSync(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { name?: string; version?: string };
    expect(typeof parsed.name).toBe('string');
    expect(typeof parsed.version).toBe('string');
  });
});
