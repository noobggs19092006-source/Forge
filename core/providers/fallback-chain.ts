import type {
  ProviderAdapter,
  CompletionParams,
  CompletionResult,
  ProviderEvent,
} from './types.js';
import { RateLimitError } from './adapters/gemini.js';

/**
 * FallbackChain — wraps multiple ProviderAdapters and tries them in order.
 * If the primary errors or rate-limits, cascades to the next available adapter.
 * Emits structured events for observability.
 */
export class FallbackChain implements ProviderAdapter {
  readonly name: string;
  readonly tier: 'cloud' | 'local';

  private adapters: ProviderAdapter[];
  private eventListeners: Array<(event: ProviderEvent) => void> = [];
  private readonly rateLimitDelayMs: number;

  constructor(adapters: ProviderAdapter[], rateLimitDelayMs?: number) {
    if (adapters.length === 0) {
      throw new Error('FallbackChain requires at least one adapter');
    }
    this.adapters = adapters;
    this.rateLimitDelayMs = rateLimitDelayMs ?? 1000;
    // Take name and tier from the primary (first) adapter
    this.name = `fallback(${adapters.map(a => a.name).join(' → ')})`;
    this.tier = adapters[0]!.tier;
  }

  /** Register a listener for provider events */
  onEvent(listener: (event: ProviderEvent) => void): void {
    this.eventListeners.push(listener);
  }

  private emit(event: ProviderEvent): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  async complete(params: CompletionParams): Promise<CompletionResult> {
    const errors: Array<{ adapter: string; error: Error }> = [];

    // Don't pass a single model to all adapters — each adapter has its own default model.
    // Remove model from params so each adapter uses its configured default.
    const { model: _, ...paramsWithoutModel } = params;

    for (const adapter of this.adapters) {
      const startTime = Date.now();

      this.emit({
        type: 'attempt',
        provider: adapter.name,
        model: params.model ?? 'default',
      });

      try {
        const result = await adapter.complete(paramsWithoutModel);

        this.emit({
          type: 'success',
          provider: adapter.name,
          model: result.model,
          durationMs: Date.now() - startTime,
        });

        return result;
      } catch (error: any) {
        const err = error instanceof Error ? error : new Error(String(error));
        const durationMs = Date.now() - startTime;

        errors.push({ adapter: adapter.name, error: err });

        this.emit({
          type: 'error',
          provider: adapter.name,
          model: params.model ?? 'default',
          error: err.message,
          durationMs,
        });

        // If rate limited, check if it's transient (retry same adapter) or quota exhaustion (fall back)
        if (error.name === 'RateLimitError') {
          if (!error.isQuotaExhausted) {
            // Transient rate limit — wait the suggested delay and retry the SAME adapter (up to 2 times)
            const maxRateLimitRetries = 2;
            let retried = false;
            for (let rlRetry = 0; rlRetry < maxRateLimitRetries; rlRetry++) {
              this.emit({
                type: 'fallback',
                provider: adapter.name,
                model: params.model ?? 'default',
                error: `Rate limited — waiting ${((error.retryDelayMs || error.retryAfterMs || 60000) / 1000).toFixed(0)}s before retry ${rlRetry + 1}/${maxRateLimitRetries}`,
              });
              await sleep((error.retryDelayMs || error.retryAfterMs || 60000));
              try {
                const retryResult = await adapter.complete(params);
                this.emit({
                  type: 'success',
                  provider: adapter.name,
                  model: retryResult.model,
                  durationMs: Date.now() - startTime,
                });
                return retryResult;
              } catch (retryError: any) {
                if (!(retryError.name === 'RateLimitError') || retryError.isQuotaExhausted) {
                  break; // Not a rate limit anymore, or quota exhausted — fall back
                }
                // Still rate limited, try again
              }
            }
          } else {
            // Quota exhaustion — fall back to next adapter immediately
            this.emit({
              type: 'fallback',
              provider: adapter.name,
              model: params.model ?? 'default',
              error: 'Quota exhausted — falling back to next provider',
            });
          }
        }

        // Continue to next adapter
        continue;
      }
    }

    // All adapters failed
    const summary = errors
      .map(e => `  ${e.adapter}: ${e.error.message}`)
      .join('\n');
    throw new Error(
      `All providers in fallback chain failed:\n${summary}`
    );
  }

  async *streamComplete(params: CompletionParams): AsyncGenerator<string, void, unknown> {
    // For streaming, try each adapter in order
    // Unlike complete(), we can't retry mid-stream, so we only try the first
    // available adapter
    // Don't pass a single model to all adapters — each adapter has its own default model.
    const { model: _, ...paramsWithoutModel } = params;

    for (const adapter of this.adapters) {
      this.emit({
        type: 'attempt',
        provider: adapter.name,
        model: params.model ?? 'default',
      });

      try {
        yield* adapter.streamComplete(paramsWithoutModel);
        return;
      } catch (error: any) {
        const err = error instanceof Error ? error : new Error(String(error));

        this.emit({
          type: 'error',
          provider: adapter.name,
          model: params.model ?? 'default',
          error: err.message,
        });

        if (error.name === 'RateLimitError') {
          await sleep(this.rateLimitDelayMs);
        }

        continue;
      }
    }

    throw new Error('All providers in fallback chain failed for streaming');
  }

  supportsStructuredOutput(): boolean {
    return this.adapters.some(a => a.supportsStructuredOutput());
  }

  supportsTools(): boolean {
    return this.adapters.some(a => a.supportsTools());
  }

  async isAvailable(): Promise<boolean> {
    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        return true;
      }
    }
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

