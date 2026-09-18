import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
  ProviderAdapter,
  CompletionParams,
  CompletionResult,
} from '../types.js';
import { ProviderError, RateLimitError } from './gemini.js';

/**
 * OpenRouter provider adapter using standard fetch to the OpenAI-compatible endpoint.
 */
export class OpenRouterAdapter implements ProviderAdapter {
  readonly name = 'openrouter' as const;
  readonly tier = 'cloud' as const;

  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

  constructor(apiKey: string, defaultModel = 'google/gemini-2.5-flash:free') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const model = params.model && params.model !== 'gemini-2.5-flash' 
      ? params.model 
      : this.defaultModel;

    const messages = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const body: any = {
      model,
      messages,
    };

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined) {
      body.max_tokens = params.maxTokens; } else { body.max_tokens = 4096; }

    if (params.responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: zodToJsonSchema(params.responseSchema, { target: 'openApi3', $refStrategy: 'none' }),
        }
      };
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/forge',
          'X-Title': 'Forge',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new RateLimitError(this.name, model, errorText, 5000, false);
        }
        throw new ProviderError(this.name, model, `${response.status} ${response.statusText}: ${errorText}`);
      }

      const data: any = await response.json();
      const text = data.choices[0]?.message?.content ?? '';

      let structured: unknown;
      if (params.responseSchema && text) {
        try {
          structured = JSON.parse(text);
        } catch {
          // ignore
        }
      }

      return {
        content: text,
        structured,
        usage: data.usage ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        } : undefined,
        model,
        provider: this.name,
      };
    } catch (error: unknown) {
      if (error instanceof RateLimitError || error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError(this.name, model, String(error));
    }
  }

  async *streamComplete(params: CompletionParams): AsyncGenerator<string, void, unknown> {
    const model = params.model && params.model !== 'gemini-2.5-flash' 
      ? params.model 
      : this.defaultModel;

    const messages = [
      { role: 'system', content: params.systemPrompt },
      ...params.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const body: any = {
      model,
      messages,
      stream: true,
    };

    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }
    if (params.maxTokens !== undefined) {
      body.max_tokens = params.maxTokens; } else { body.max_tokens = 4096; }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/forge',
        'X-Title': 'Forge',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new RateLimitError(this.name, model, errorText, 5000, false);
      }
      throw new ProviderError(this.name, model, `${response.status} ${response.statusText}: ${errorText}`);
    }

    if (!response.body) {
      throw new ProviderError(this.name, model, 'No response body stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.slice(6));
            const chunk = data.choices[0]?.delta?.content;
            if (chunk) {
              yield chunk;
            }
          } catch {
            // ignore JSON parse errors for incomplete chunks
          }
        }
      }
    }
  }

  supportsStructuredOutput(): boolean {
    return true;
  }

  supportsTools(): boolean {
    return false; // not needed right now
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}


