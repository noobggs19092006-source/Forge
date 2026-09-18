import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { BaseAgent, AgentValidationError } from '../../agents/base-agent.js';
import type { ProviderAdapter, CompletionParams, CompletionResult } from '../../providers/types.js';

// Concrete test agent
class TestAgent extends BaseAgent<{ input: string }, { output: string; count: number }> {
  readonly agentName = 'TestAgent';
  readonly inputSchema = z.object({ input: z.string().min(1) });
  readonly outputSchema = z.object({ output: z.string(), count: z.number() });
  readonly systemPrompt = 'You are a test agent.';
}

function createMockProvider(responses: CompletionResult[]): ProviderAdapter {
  let callIndex = 0;
  return {
    name: 'mock',
    tier: 'cloud',
    complete: vi.fn().mockImplementation(async () => {
      const response = responses[callIndex];
      if (!response) throw new Error('No more mock responses');
      callIndex++;
      return response;
    }),
    streamComplete: vi.fn(),
    supportsStructuredOutput: () => true,
    supportsTools: () => false,
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

describe('BaseAgent', () => {
  it('executes successfully with valid output', async () => {
    const provider = createMockProvider([{
      content: '{"output": "hello", "count": 42}',
      structured: { output: 'hello', count: 42 },
      model: 'test-model',
      provider: 'mock',
    }]);

    const agent = new TestAgent(provider);
    const result = await agent.execute({ input: 'test' });

    expect(result.output).toEqual({ output: 'hello', count: 42 });
    expect(result.attempts).toBe(1);
    expect(result.model).toBe('test-model');
    expect(result.provider).toBe('mock');
  });

  it('retries on invalid output and succeeds', async () => {
    const provider = createMockProvider([
      // First attempt — invalid (missing count)
      {
        content: '{"output": "hello"}',
        structured: { output: 'hello' },
        model: 'test-model',
        provider: 'mock',
      },
      // Second attempt — valid
      {
        content: '{"output": "hello", "count": 42}',
        structured: { output: 'hello', count: 42 },
        model: 'test-model',
        provider: 'mock',
      },
    ]);

    const agent = new TestAgent(provider);
    const result = await agent.execute({ input: 'test' });

    expect(result.output).toEqual({ output: 'hello', count: 42 });
    expect(result.attempts).toBe(2);
  });

  it('throws AgentValidationError after max retries', async () => {
    const provider = createMockProvider([
      { content: '{}', structured: {}, model: 'test', provider: 'mock' },
      { content: '{}', structured: {}, model: 'test', provider: 'mock' },
      { content: '{}', structured: {}, model: 'test', provider: 'mock' },
    ]);

    const agent = new TestAgent(provider);

    await expect(agent.execute({ input: 'test' }))
      .rejects
      .toThrow(AgentValidationError);
  });

  it('throws on invalid input', async () => {
    const provider = createMockProvider([]);
    const agent = new TestAgent(provider);

    await expect(agent.execute({ input: '' }))
      .rejects
      .toThrow(AgentValidationError);
  });

  it('extracts JSON from markdown fences', async () => {
    const provider = createMockProvider([{
      content: '```json\n{"output": "hello", "count": 5}\n```',
      structured: undefined,
      model: 'test',
      provider: 'mock',
    }]);

    const agent = new TestAgent(provider);
    const result = await agent.execute({ input: 'test' });

    expect(result.output).toEqual({ output: 'hello', count: 5 });
  });

  it('extracts JSON from text with surrounding content', async () => {
    const provider = createMockProvider([{
      content: 'Here is the result:\n{"output": "hello", "count": 7}\nHope that helps!',
      structured: undefined,
      model: 'test',
      provider: 'mock',
    }]);

    const agent = new TestAgent(provider);
    const result = await agent.execute({ input: 'test' });

    expect(result.output).toEqual({ output: 'hello', count: 7 });
  });
});
