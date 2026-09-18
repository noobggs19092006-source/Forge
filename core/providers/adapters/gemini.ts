import { GoogleGenAI } from '@google/genai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
  ProviderAdapter,
  CompletionParams,
  CompletionResult,
} from '../types.js';

/**
 * Gemini provider adapter using the @google/genai unified SDK.
 * Supports native structured JSON output via responseSchema.
 */
export class GeminiAdapter implements ProviderAdapter {
  readonly name = 'gemini' as const;
  readonly tier = 'cloud' as const;

  private client: GoogleGenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gemini-2.5-flash') {
    this.client = new GoogleGenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const model = params.model ?? this.defaultModel;

    // Build the content string from messages
    const userContent = params.messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    // Build generation config using proper typed object
    const generationConfig: {
      temperature?: number;
      maxOutputTokens?: number;
      responseMimeType?: string;
      responseSchema?: unknown;
      systemInstruction?: string;
    } = {};

    if (params.temperature !== undefined) {
      generationConfig.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = params.maxTokens;
    }

    // Structured output support
    if (params.responseSchema) {
      generationConfig.responseMimeType = 'application/json';
      // Convert Zod schema to JSON Schema for Gemini's responseSchema
      const jsonSchema = zodToJsonSchema(params.responseSchema, {
        target: 'openApi3',
        $refStrategy: 'none',
      });
      generationConfig.responseSchema = jsonSchema;
    }

    generationConfig.systemInstruction = params.systemPrompt;

    try {
      const response = await this.client.models.generateContent({
        model,
        contents: userContent,
        config: generationConfig,
      });

      const text = response.text ?? '';

      let structured: unknown;
      if (params.responseSchema && text) {
        try {
          structured = JSON.parse(text);
        } catch {
          // If JSON parsing fails, return raw text — caller will handle
        }
      }

      return {
        content: text,
        structured,
        usage: response.usageMetadata ? {
          inputTokens: response.usageMetadata.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata.candidatesTokenCount ?? 0,
        } : undefined,
        model,
        provider: this.name,
      };
    } catch (error: unknown) {
      const err = error as Error & { status?: number };
      // Check for rate limiting
      if (err.status === 429 || err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
        // Extract retry delay from error message (e.g., "Please retry in 14.671857795s")
        const delayMatch = err.message?.match(/retry in (\d+(?:\.\d+)?)s/i);
        const retryDelayMs = delayMatch ? Math.ceil(parseFloat(delayMatch[1]!) * 1000) : 15000;
        
        // Check if this is a quota exhaustion (daily limit) vs transient rate limit
        const isQuotaExhausted = err.message?.includes('Quota exceeded') || 
                                  err.message?.includes('quota') ||
                                  err.message?.includes('FreeTier');
        
        throw new RateLimitError(this.name, model, err.message, retryDelayMs, isQuotaExhausted);
      }
      throw new ProviderError(this.name, model, err.message);
    }
  }

  async *streamComplete(params: CompletionParams): AsyncGenerator<string, void, unknown> {
    const model = params.model ?? this.defaultModel;

    const userContent = params.messages
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    const generationConfig: {
      temperature?: number;
      maxOutputTokens?: number;
      systemInstruction?: string;
    } = {};

    if (params.temperature !== undefined) {
      generationConfig.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = params.maxTokens;
    }
    generationConfig.systemInstruction = params.systemPrompt;

    try {
      const response = await this.client.models.generateContentStream({
        model,
        contents: userContent,
        config: generationConfig,
      });

      for await (const chunk of response) {
        if (chunk.text) {
          yield chunk.text;
        }
      }
    } catch (error: unknown) {
      const err = error as Error & { status?: number };
      if (err.status === 429) {
        throw new RateLimitError(this.name, model, err.message);
      }
      throw new ProviderError(this.name, model, err.message);
    }
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsTools(): boolean {
    return true;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Quick health check — list models
      const response = await this.client.models.generateContent({
        model: this.defaultModel,
        contents: 'Reply with just the word "ok"',
        config: {
          maxOutputTokens: 5,
        },
      });
      return !!response.text;
    } catch {
      return false;
    }
  }
}

/** Thrown when a provider rate-limits us (HTTP 429) */
export class RateLimitError extends Error {
  /** Suggested retry delay in milliseconds, extracted from the API response */
  public readonly retryDelayMs: number;
  /** True if this is a daily/monthly quota exhaustion (not a transient spike) */
  public readonly isQuotaExhausted: boolean;

  constructor(
    public readonly provider: string,
    public readonly model: string,
    message: string,
    retryDelayMs?: number,
    isQuotaExhausted?: boolean,
  ) {
    super(`[${provider}/${model}] Rate limited: ${message}`);
    this.name = 'RateLimitError';
    this.retryDelayMs = retryDelayMs ?? 15000;
    this.isQuotaExhausted = isQuotaExhausted ?? false;
  }
}

/** General provider error */
export class ProviderError extends Error {
  constructor(
    public readonly provider: string,
    public readonly model: string,
    message: string,
  ) {
    super(`[${provider}/${model}] Error: ${message}`);
    this.name = 'ProviderError';
  }
}
