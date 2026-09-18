import type { z } from 'zod';

/**
 * Provider abstraction layer types.
 * Every LLM provider (Gemini, Ollama, OpenRouter, etc.) implements ProviderAdapter.
 * The orchestrator never talks to a specific provider — it goes through the router.
 */

/** Pipeline stages that can be routed to different providers */
export type PipelineStage =
  | 'intake'
  | 'architect'
  | 'design-brain'
  | 'motion-brain'
  | 'codegen'
  | 'qa-gate'
  | 'critic';

/** A single message in a conversation */
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Parameters for a completion request */
export interface CompletionParams {
  /** Model identifier (provider-specific). If omitted, uses adapter default. */
  model?: string;
  /** System prompt — sets the agent's persona/instructions */
  systemPrompt: string;
  /** Conversation messages */
  messages: Message[];
  /**
   * If provided, the adapter should request structured JSON output
   * matching this Zod schema. Not all providers support this natively;
   * adapters that don't should wrap the prompt with JSON instructions.
   */
  responseSchema?: z.ZodType;
  /** Temperature (0-2). Lower = more deterministic. */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
}

/** Result from a completion request */
export interface CompletionResult {
  /** Raw text content of the response */
  content: string;
  /** Parsed structured data if responseSchema was provided */
  structured?: unknown;
  /** Token usage if the provider reports it */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Model that actually served the request */
  model: string;
  /** Provider name that served the request */
  provider: string;
}

/** Events emitted by providers for observability */
export interface ProviderEvent {
  type: 'attempt' | 'success' | 'error' | 'fallback';
  provider: string;
  model: string;
  stage?: PipelineStage;
  error?: string;
  durationMs?: number;
}

/**
 * ProviderAdapter — the interface every LLM provider must implement.
 * Adapters are stateless and reusable across requests.
 */
export interface ProviderAdapter {
  /** Human-readable provider name (e.g., "gemini", "ollama") */
  readonly name: string;
  /** Provider tier — affects routing priority */
  readonly tier: 'cloud' | 'local';

  /**
   * Single-turn completion.
   * Must handle structured output if responseSchema is provided.
   */
  complete(params: CompletionParams): Promise<CompletionResult>;

  /**
   * Streaming completion — yields text chunks as they arrive.
   * Used for progress feedback in the CLI.
   */
  streamComplete(params: CompletionParams): AsyncGenerator<string, void, unknown>;

  /** Whether this adapter supports native structured JSON output */
  supportsStructuredOutput(): boolean;

  /** Whether this adapter supports tool/function calling */
  supportsTools(): boolean;

  /**
   * Check if the provider is reachable and configured.
   * For cloud: API key is set and valid.
   * For local (Ollama): server is running and a model is available.
   */
  isAvailable(): Promise<boolean>;
}

/** Configuration for the provider routing layer */
export interface ProviderRoutingConfig {
  stages: Record<PipelineStage, {
    tier: 'cloud' | 'local';
    model?: string;
  }>;
  /** Default fallback order for all stages */
  fallbackOrder: string[];
  /**
   * Stage-specific fallback order override.
   * If set, this overrides fallbackOrder for the named stage.
   * e.g. codegenFallbackOrder: ['groq', 'cerebras', 'nvidia-nim', 'ollama']
   */
  codegenFallbackOrder?: string[];
  /** Delay in milliseconds before retrying next provider on rate limit (default: 1000) */
  rateLimitDelayMs?: number;
  ollama?: {
    baseUrl?: string;
    defaultModel?: string;
  };
  gemini?: {
    defaultModel?: string;
  };
  openrouter?: {
    defaultModel?: string;
  };
  nvidiaNim?: {
    defaultModel?: string;
  };
  /** Groq (OpenAI-compatible) — free tier, llama-3.3-70b-versatile */
  groq?: {
    defaultModel?: string;
  };
  /** Cerebras (OpenAI-compatible) — free tier, llama-3.3-70b on WSE */
  cerebras?: {
    defaultModel?: string;
  };
}
