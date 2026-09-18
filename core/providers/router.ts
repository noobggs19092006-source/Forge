import type {
  PipelineStage,
  ProviderAdapter,
  ProviderRoutingConfig,
} from './types.js';
import { GeminiAdapter } from './adapters/gemini.js';
import { OllamaAdapter } from './adapters/ollama.js';
import { OpenRouterAdapter } from './adapters/openrouter.js';
import { NvidiaNimAdapter } from './adapters/nvidia-nim.js';
import { GroqAdapter } from './adapters/groq.js';
import { CerebrasAdapter } from './adapters/cerebras.js';
import { FallbackChain } from './fallback-chain.js';

/**
 * ProviderRouter — capability-based routing of pipeline stages to providers.
 * Reads a routing config and creates FallbackChain instances per stage.
 */
export class ProviderRouter {
  private adapters: Map<string, ProviderAdapter> = new Map();
  private stageChains: Map<PipelineStage, FallbackChain> = new Map();
  private config: ProviderRoutingConfig;

  constructor(config: ProviderRoutingConfig, env?: Record<string, string | undefined>) {
    this.config = config;
    this.initAdapters(env ?? process.env as Record<string, string | undefined>);
    this.buildStageChains();
  }

  private initAdapters(env: Record<string, string | undefined>): void {
    // Support both uppercase env vars and camelCase config keys
    const getKey = (key: string) => env[key] ?? env[key.toLowerCase().replace(/_/g, '')] ?? env[key.replace(/_/g, '')];
    
    // Initialize Groq if API key available (primary for Codegen — fast, reliable JSON)
    const groqKey = getKey('GROQ_API_KEY') ?? env['groqApiKey'];
    if (groqKey) {
      this.adapters.set(
        'groq',
        new GroqAdapter(groqKey, this.config.groq?.defaultModel),
      );
    }

    // Initialize Cerebras if API key available (secondary for Codegen — WSE hardware, ~2600 t/s)
    const cerebrasKey = getKey('CEREBRAS_API_KEY') ?? env['cerebrasApiKey'];
    if (cerebrasKey) {
      this.adapters.set(
        'cerebras',
        new CerebrasAdapter(cerebrasKey, this.config.cerebras?.defaultModel),
      );
    }

    // Initialize NVIDIA NIM if API key is available (fallback)
    const nvidiaKey = getKey('NVIDIA_API_KEY') ?? env['nvidiaApiKey'];
    if (nvidiaKey) {
      this.adapters.set(
        'nvidia-nim',
        new NvidiaNimAdapter(nvidiaKey, this.config.nvidiaNim?.defaultModel),
      );
    }

    // Initialize Gemini if API key is available
    const geminiKey = getKey('GEMINI_API_KEY') ?? env['geminiApiKey'];
    if (geminiKey) {
      this.adapters.set(
        'gemini',
        new GeminiAdapter(geminiKey, this.config.gemini?.defaultModel),
      );
    }

    // Initialize OpenRouter if API key is available
    const openrouterKey = getKey('OPENROUTER_API_KEY') ?? env['openrouterApiKey'];
    if (openrouterKey) {
      this.adapters.set(
        'openrouter',
        new OpenRouterAdapter(openrouterKey, this.config.openrouter?.defaultModel),
      );
    }

    // Initialize Ollama (local fallback — always available)
    const ollamaBaseUrl = getKey('OLLAMA_BASE_URL') ?? env['ollamaBaseUrl'] ?? this.config.ollama?.baseUrl;
    this.adapters.set(
      'ollama',
      new OllamaAdapter(
        ollamaBaseUrl,
        this.config.ollama?.defaultModel,
      ),
    );
  }

  private buildStageChains(): void {
    const stages: PipelineStage[] = [
      'intake', 'architect', 'design-brain',
      'motion-brain', 'codegen', 'qa-gate', 'critic',
    ];

    for (const stage of stages) {
      const stageConfig = this.config.stages[stage];
      if (!stageConfig) continue;

      // Use stage-specific fallback order if provided (e.g. codegen gets Groq → Cerebras → NIM)
      const fallbackOrder = (stage === 'codegen' && this.config.codegenFallbackOrder)
        ? this.config.codegenFallbackOrder
        : this.config.fallbackOrder;

      // Build ordered list of adapters for this stage
      const orderedAdapters: ProviderAdapter[] = [];

      // Primary: matching the stage tier, in fallback order
      const primaryTier = stageConfig.tier;
      for (const providerName of fallbackOrder) {
        const adapter = this.adapters.get(providerName);
        if (adapter && adapter.tier === primaryTier) {
          orderedAdapters.push(adapter);
        }
      }

      // Fallbacks: remaining adapters in fallback order
      for (const providerName of fallbackOrder) {
        const adapter = this.adapters.get(providerName);
        if (adapter && !orderedAdapters.includes(adapter)) {
          orderedAdapters.push(adapter);
        }
      }

      if (orderedAdapters.length > 0) {
        const chain = new FallbackChain(orderedAdapters, this.config.rateLimitDelayMs);
        this.stageChains.set(stage, chain);
      }
    }
  }

  /**
   * Get the provider (FallbackChain) for a given pipeline stage.
   * The chain handles automatic fallback if the primary provider errors.
   */
  getProviderForStage(stage: PipelineStage): ProviderAdapter {
    const chain = this.stageChains.get(stage);
    if (!chain) {
      throw new Error(
        `No provider configured for stage "${stage}". ` +
        `Available adapters: ${[...this.adapters.keys()].join(', ') || 'none'}. ` +
        `Check your GEMINI_API_KEY env var and Ollama availability.`
      );
    }
    return chain;
  }

  /**
   * Get the model override for a stage, checking env vars and config.
   */
  getModelForStage(stage: PipelineStage): string | undefined {
    // Check env var override first (e.g., FORGE_MODEL_CODEGEN)
    const envKey = `FORGE_MODEL_${stage.toUpperCase().replace(/-/g, '_')}`;
    const envModel = process.env[envKey];
    if (envModel) return envModel;

    // Then check config
    return this.config.stages[stage]?.model;
  }

  /** List all initialized adapters */
  getAdapters(): Map<string, ProviderAdapter> {
    return new Map(this.adapters);
  }

  /** Check which providers are actually available (async health check) */
  async checkAvailability(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    for (const [name, adapter] of this.adapters) {
      results.set(name, await adapter.isAvailable());
    }
    return results;
  }
}
