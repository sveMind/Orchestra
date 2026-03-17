import { OrchestraPlugin } from './types';

describe('OrchestraPlugin shape', () => {
  test('accepts expected fields', () => {
    const plugin: OrchestraPlugin = {
      name: 'Test',
      description: 'Test plugin',
      command: 'test',
      action: async () => {},
    };

    expect(plugin.command).toBe('test');
    expect(typeof plugin.action).toBe('function');
  });
});
