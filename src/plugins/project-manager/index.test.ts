
import projectManagerPlugin from './index';

describe('project-manager plugin', () => {
  test('exports expected command metadata', () => {
    expect(projectManagerPlugin.command).toBe('project-manager');
    expect(typeof projectManagerPlugin.action).toBe('function');
  });
});
        
