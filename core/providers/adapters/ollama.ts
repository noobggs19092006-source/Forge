import { Ollama } from 'ollama';
import type {
  ProviderAdapter,
  CompletionParams,
  CompletionResult,
} from '../types.js';
import { ProviderError } from './gemini.js';

/**
 * Ollama provider adapter for local model inference.
 * Supports JSON mode via Ollama's `format: 'json'` option.
 * Falls back to prompt-wrapping for structured output.
 */
export class OllamaAdapter implements ProviderAdapter {
  readonly name = 'ollama' as const;
  readonly tier = 'local' as const;

  private client: Ollama;
  private defaultModel: string;

  constructor(
    baseUrl = 'http://localhost:11434',
    defaultModel = 'llama3.2:3b',
  ) {
    this.client = new Ollama({ host: baseUrl });
    this.defaultModel = defaultModel;
  }

  /**
   * Strip markdown code fences from response text.
   * Handles ```json ... ```, ``` ... ```, ```json{...}```, and ```{...}``` patterns.
   */
  private stripMarkdownFences(text: string): string {
    const trimmed = text.trim();
    
    // Pattern 1: ```json\n...\n``` or ```\n...\n``` (with newlines)
    let fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch && fenceMatch[1] !== undefined) {
      return fenceMatch[1].trim();
    }
    
    // Pattern 2: ```json{...}``` or ```{...}``` (no newlines, inline)
    fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch && fenceMatch[1] !== undefined) {
      return fenceMatch[1].trim();
    }
    
    // Pattern 3: Just remove leading ```json or ``` and trailing ```
    if (trimmed.startsWith('```')) {
      // Remove leading ```json or ```
      let cleaned = trimmed.replace(/^```(?:json)?\s*/, '');
      // Remove trailing ```
      cleaned = cleaned.replace(/\s*```$/, '');
      return cleaned.trim();
    }
    
    return trimmed;
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    // Only use params.model if it looks like an Ollama model name (contains ':')
    // Cloud model names like 'gemini-2.5-flash' are meaningless to Ollama
    const model = (params.model && params.model.includes(':')) 
      ? params.model 
      : this.defaultModel;

    // Build messages array with system prompt
    const messages = [
      { role: 'system' as const, content: params.systemPrompt },
      ...params.messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Build options object
    const options: { temperature?: number, num_ctx?: number, repeat_penalty?: number } = { 
      num_ctx: 4096,
      repeat_penalty: 1.2
    };
    if (params.temperature !== undefined) {
      options.temperature = params.temperature;
    }

    let format: 'json' | undefined;
    if (params.responseSchema) {
      format = 'json';
      // Enhance the last user message with JSON schema instructions
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        lastMsg.content += '\n\nIMPORTANT: Respond with valid JSON only. No markdown fences, no explanation.';
      }
    }

    try {
      const response = await this.client.chat({
        model,
        messages,
        format,
        options: Object.keys(options).length > 0 ? options : undefined,
      });

      let text = response.message.content;

      // Strip markdown code fences if present
      text = this.stripMarkdownFences(text);

      let structured: unknown;
      if (params.responseSchema && text) {
        try {
          structured = JSON.parse(text);
        } catch {
          // JSON parse failure — caller handles
        }
      }

      return {
        content: text,
        structured,
        usage: response.eval_count !== undefined ? {
          inputTokens: response.prompt_eval_count ?? 0,
          outputTokens: response.eval_count ?? 0,
        } : undefined,
        model,
        provider: this.name,
      };
    } catch (error: unknown) {
      const err = error as Error;
      throw new ProviderError(this.name, model, err.message);
    }
  }

  async *streamComplete(params: CompletionParams): AsyncGenerator<string, void, unknown> {
    const model = params.model ?? this.defaultModel;

    const messages = [
      { role: 'system' as const, content: params.systemPrompt },
      ...params.messages.map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
    ];

    try {
      const response = await this.client.chat({
        model,
        messages,
        stream: true,
      });

      for await (const chunk of response) {
        if (chunk.message.content) {
          yield chunk.message.content;
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      throw new ProviderError(this.name, model, err.message);
    }
  }

  supportsStructuredOutput(): boolean {
    // Ollama supports JSON mode but not schema-validated output
    return true;
  }

  supportsTools(): boolean {
    // Some Ollama models support tools, but not reliably enough to depend on
    return false;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Ollama is running by listing models
      const models = await this.client.list();
      // Check if our default model is available
      return models.models.some(m => m.name.startsWith(this.defaultModel.split(':')[0]!));
    } catch {
      return false;
    }
  }
}
