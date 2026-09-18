import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
  ProviderAdapter,
  CompletionParams,
  CompletionResult,
} from '../types.js';
import { RateLimitError, ProviderError } from './gemini.js';

/**
 * Post-process JSON schema to add additionalProperties: false to all object schemas.
 * This is required by Groq's JSON schema validation.
 */
function addAdditionalPropertiesFalseRecursive(obj: any): void {
  if (obj && typeof obj === 'object') {
    if (obj.type === 'object') {
      obj.additionalProperties = false;
      if (obj.properties) {
        for (const key of Object.keys(obj.properties)) {
          addAdditionalPropertiesFalseRecursive(obj.properties[key]);
        }
      }
      if (obj.additionalProperties && typeof obj.additionalProperties === 'object') {
        addAdditionalPropertiesFalseRecursive(obj.additionalProperties);
      }
    }
    if (obj.items) {
      addAdditionalPropertiesFalseRecursive(obj.items);
    }
    if (obj.allOf) {
      obj.allOf.forEach(addAdditionalPropertiesFalseRecursive);
    }
    if (obj.anyOf) {
      obj.anyOf.forEach(addAdditionalPropertiesFalseRecursive);
    }
    if (obj.oneOf) {
      obj.oneOf.forEach(addAdditionalPropertiesFalseRecursive);
    }
  }
}

/**
 * NVIDIA NIM provider adapter using OpenAI-compatible endpoint.
 * Endpoint: https://integrate.api.nvidia.com/v1
 */
export class NvidiaNimAdapter implements ProviderAdapter {
  readonly name = 'nvidia-nim' as const;
  readonly tier = 'cloud' as const;

  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://integrate.api.nvidia.com/v1/chat/completions';

  constructor(apiKey: string, defaultModel = 'nvidia/llama-3.1-nemotron-70b-instruct') {
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  /**
   * Strip markdown code fences from response text.
   * Handles ```json ... ``` and ``` ... ``` patterns.
   */
  private stripMarkdownFences(text: string): string {
    const trimmed = text.trim();
    // Match ```json\n...\n``` or ```\n...\n``` patterns
    const fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch && fenceMatch[1] !== undefined) {
      return fenceMatch[1].trim();
    }
    // Also handle case where there's no newline after opening fence
    const fenceMatch2 = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch2 && fenceMatch2[1] !== undefined) {
      return fenceMatch2[1].trim();
    }
    return trimmed;
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
      body.max_tokens = params.maxTokens;
    }

    if (params.responseSchema && this.supportsStructuredOutput()) {
      const jsonSchema = zodToJsonSchema(params.responseSchema, { target: 'openApi3', $refStrategy: 'none', removeAdditionalStrategy: 'strict' });
      addAdditionalPropertiesFalseRecursive(jsonSchema);

      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response',
          strict: true,
          schema: jsonSchema,
        }
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new RateLimitError(this.name, model, errorText, 5000, false);
        }
        throw new ProviderError(this.name, model, `${response.status} ${response.statusText}: ${errorText}`);
      }

      const data: any = await response.json();
      let text = data.choices[0]?.message?.content ?? '';

      // Strip markdown code fences if present
      text = this.stripMarkdownFences(text);

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
      body.max_tokens = params.maxTokens;
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
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
    // Nemotron models return clean JSON, but keep false for safety and let
    // base agent's extractJSON handle any markdown wrapping
    return false;
  }

  supportsTools(): boolean {
    return false;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }
}

