import { describe, it, expect, vi } from 'vitest';
import { ProviderRouter } from '../../providers/router.js';
import type { ProviderRoutingConfig, ProviderAdapter, CompletionParams, CompletionResult } from '../../providers/types.js';

/** Create a mock adapter for testing */
function createMockAdapter(
  name: string,
  tier: 'cloud' | 'local',
  options?: {
    available?: boolean;
    shouldFail?: boolean;
    response?: string;
  },
): ProviderAdapter {
  const response = options?.response ?? '{"test": true}';
  return {
    name,
    tier,
    complete: options?.shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} failed`))
      : vi.fn().mockResolvedValue({
          content: response,
          structured: JSON.parse(response),
          model: 'mock-model',
          provider: name,
        } satisfies CompletionResult),
    streamComplete: vi.fn(),
    supportsStructuredOutput: () => true,
    supportsTools: () => tier === 'cloud',
    isAvailable: vi.fn().mockResolvedValue(options?.available ?? true),
  };
}

const defaultConfig: ProviderRoutingConfig = {
  stages: {
    'intake': { tier: 'cloud' },
    'architect': { tier: 'cloud' },
    'design-brain': { tier: 'cloud' },
    'motion-brain': { tier: 'cloud' },
    'codegen': { tier: 'local' },
    'critic': { tier: 'cloud' },
  },
  fallbackOrder: ['gemini', 'ollama'],
  ollama: { defaultModel: 'qwen2.5-coder:7b' },
  gemini: { defaultModel: 'gemini-2.5-flash' },
};

describe('ProviderRouter', () => {
  it('creates a router with valid config and env', () => {
    const router = new ProviderRouter(defaultConfig, {
      GEMINI_API_KEY: 'test-key',
    });
    expect(router).toBeDefined();
    expect(router.getAdapters().size).toBeGreaterThan(0);
  });

  it('provides adapters for all stages', () => {
    const router = new ProviderRouter(defaultConfig, {
      GEMINI_API_KEY: 'test-key',
    });

    const stages = ['intake', 'architect', 'design-brain', 'motion-brain', 'codegen', 'critic'] as const;
    for (const stage of stages) {
      expect(() => router.getProviderForStage(stage)).not.toThrow();
    }
  });

  it('falls back to ollama when no gemini key', () => {
    const router = new ProviderRouter(defaultConfig, {});
    // Should still have ollama
    const adapters = router.getAdapters();
    expect(adapters.has('ollama')).toBe(true);
    expect(adapters.has('gemini')).toBe(false);
  });

  it('reads model override from env', () => {
    const router = new ProviderRouter(defaultConfig, {
      GEMINI_API_KEY: 'test-key',
    });
    // Set env var for stage override
    process.env['FORGE_MODEL_CODEGEN'] = 'custom-model';
    expect(router.getModelForStage('codegen')).toBe('custom-model');
    delete process.env['FORGE_MODEL_CODEGEN'];
  });

  it('checks availability of all adapters', async () => {
    const router = new ProviderRouter(defaultConfig, {
      GEMINI_API_KEY: 'test-key',
    });
    const availability = await router.checkAvailability();
    expect(availability instanceof Map).toBe(true);
  });
});
