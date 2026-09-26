import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProviderRoutingConfig } from '../providers/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * ForgeConfig — configuration for the pipeline.
 * Loaded from .forgerc.json, env vars, or passed directly.
 */
export interface ForgeConfig {
  /** Provider routing configuration */
  routing: ProviderRoutingConfig;

  /** Output directory for generated projects */
  outputDir: string;

  /** Maximum QA-gate retry loops */
  maxQARetries: number;

  /** Maximum critic retry loops */
  maxCriticRetries: number;

  /** Minimum critic confidence score to pass (1-10) */
  minCriticConfidence: number;

  /** Skip the mandatory build verification stage (for testing) */
  skipBuildVerification?: boolean;

  /** Delay between Codegen sequential API calls (ms) - for NIM rate limiting */
  codegenInterRequestDelayMs?: number;

  /** Maximum number of codegen retry passes (total passes including first). Default 2 */
  codegenMaxRetryPasses?: number;

  /**
   * Maximum concurrent LLM requests during parallel Codegen level execution.
   * Default 3 — safe for Groq's 30 RPM free tier (3 concurrent × ~5s avg = 36/min).
   * Raise to 5-6 if using paid tiers or Cerebras-only.
   */
  codegenMaxConcurrency?: number;

  /** API keys and provider config from env */
  env: {
    geminiApiKey?: string;
    openrouterApiKey?: string;
    ollamaBaseUrl?: string;
    nvidiaApiKey?: string;
    groqApiKey?: string;
    cerebrasApiKey?: string;
  };
}

/**
 * Load configuration from .forgerc.json, provider-routing.json, and environment.
 */
export function loadConfig(overrides?: Partial<ForgeConfig>): ForgeConfig {
  // Load provider routing config
  let routing: ProviderRoutingConfig;
  // Find project root by walking up from this file's location until we find core/provider-routing.json
  let searchDir = __dirname;
  let routingPath: string | null = null;
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(searchDir, 'core', 'provider-routing.json');
    if (existsSync(candidate)) {
      routingPath = candidate;
      break;
    }
    searchDir = resolve(searchDir, '..');
  }
  if (routingPath) {
    routing = JSON.parse(readFileSync(routingPath, 'utf-8')) as ProviderRoutingConfig;
  } else {
    // Default routing
    routing = {
      stages: {
        'intake': { tier: 'cloud', model: 'gemini-2.5-flash' },
        'architect': { tier: 'cloud', model: 'gemini-2.5-flash' },
        'design-brain': { tier: 'cloud', model: 'gemini-2.5-flash' },
        'motion-brain': { tier: 'cloud', model: 'gemini-2.5-flash' },
        'codegen': { tier: 'cloud', model: 'gemini-2.5-flash' },
        'qa-gate': { tier: 'cloud', model: 'gemini-2.5-flash' },
        'critic': { tier: 'cloud', model: 'gemini-2.5-flash' },
      },
      fallbackOrder: ['gemini', 'openrouter', 'ollama'],
      ollama: { baseUrl: 'http://localhost:11434', defaultModel: 'nemotron-3-ultra:cloud' },
      gemini: { defaultModel: 'gemini-2.5-flash' },
      openrouter: { defaultModel: 'google/gemini-2.5-flash' },
    };
  }

  // Apply env var overrides to routing
  const ollamaUrl = process.env['OLLAMA_BASE_URL'];
  if (ollamaUrl && routing.ollama) {
    routing.ollama.baseUrl = ollamaUrl;
  }

  const config: ForgeConfig = {
    routing,
    outputDir: process.env['FORGE_OUTPUT_DIR'] ?? resolve(process.cwd(), 'generated'),
    maxQARetries: 3,
    maxCriticRetries: 2,
    minCriticConfidence: 7,
    // 0ms default: Groq/Cerebras handle rate limits via Retry-After headers,
    // no artificial delay needed. NIM fallback can set this via env if needed.
    codegenInterRequestDelayMs: parseInt(process.env['FORGE_CODEGEN_DELAY_MS'] ?? '0', 10),
    // Default 2 passes: Groq/Cerebras are reliable enough that 3 passes are rarely needed
    codegenMaxRetryPasses: parseInt(process.env['FORGE_CODEGEN_MAX_PASSES'] ?? '2', 10),
    // Default 3 concurrent: safe for Groq 30 RPM free tier
    codegenMaxConcurrency: parseInt(process.env['FORGE_CODEGEN_CONCURRENCY'] ?? '3', 10),
    env: {
      geminiApiKey: process.env['GEMINI_API_KEY'],
      openrouterApiKey: process.env['OPENROUTER_API_KEY'],
      ollamaBaseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
      nvidiaApiKey: process.env['NVIDIA_API_KEY'],
      groqApiKey: process.env['GROQ_API_KEY'],
      cerebrasApiKey: process.env['CEREBRAS_API_KEY'],
    },
    ...overrides,
  };

  return config;
}
