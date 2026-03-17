import { consultAgent, AgentRole } from './agentService';
import { generateCompletion } from './aiService';

jest.mock('./aiService', () => ({
  generateCompletion: jest.fn(),
}));

describe('consultAgent', () => {
  test('delegates to generateCompletion with role system prompt and task context', async () => {
    (generateCompletion as jest.Mock).mockResolvedValue('ok');

    const result = await consultAgent(AgentRole.SOFTWARE_ENGINEER, 'Do thing', 'Some context');

    expect(result).toBe('ok');
    expect(generateCompletion).toHaveBeenCalledTimes(1);

    const [prompt, systemPrompt] = (generateCompletion as jest.Mock).mock.calls[0];
    expect(String(prompt)).toContain('Task: Do thing');
    expect(String(prompt)).toContain('Some context');
    expect(String(systemPrompt)).toContain('Senior Software Engineer');
  });
});
