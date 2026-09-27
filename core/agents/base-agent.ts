import { type z, type ZodTypeDef } from 'zod';
import type { ProviderAdapter, CompletionResult } from '../providers/types.js';

/**
 * BaseAgent — abstract foundation for all pipeline agents.
 * 
 * Each agent:
 * - Has a system prompt defining its persona/instructions
 * - Takes typed input validated by inputSchema
 * - Produces typed output validated by outputSchema
 * - Retries up to maxRetries times on validation failure,
 *   feeding the validation error back to the model
 * - Does NOT choose its own model — the orchestrator assigns one via the router
 */
export abstract class BaseAgent<TInput, TOutput> {
  /** Human-readable agent name for logging */
  abstract readonly agentName: string;

  /** System prompt that defines this agent's persona and instructions */
  abstract readonly systemPrompt: string;

  /** Zod schema to validate input */
  abstract readonly inputSchema: z.ZodType<TInput, ZodTypeDef, unknown>;

  /** Zod schema to validate output */
  abstract readonly outputSchema: z.ZodType<TOutput, ZodTypeDef, unknown>;

  /** Maximum retries on output validation failure */
  protected maxRetries = 2;

  /** The provider adapter assigned by the orchestrator */
  protected provider: ProviderAdapter;

  /** Optional model override */
  protected modelOverride?: string;

  /** Optional event emitter for progress reporting */
  protected eventEmitter?: (event: 'stage:start' | 'stage:complete' | 'stage:error', message: string) => void;

  constructor(provider: ProviderAdapter, modelOverride?: string) {
    this.provider = provider;
    this.modelOverride = modelOverride;
  }

  /** Set event emitter for progress reporting */
  setEventEmitter(emitter: (event: 'stage:start' | 'stage:complete' | 'stage:error', message: string) => void): void {
    this.eventEmitter = emitter;
  }

  /** Emit a progress event */
  protected emit(event: 'stage:start' | 'stage:complete' | 'stage:error', message: string): void {
    this.eventEmitter?.(event, message);
  }

  /**
   * Format the input into a user message string for the LLM.
   * Override this in subclasses for custom input formatting.
   */
  protected formatInput(input: TInput): string {
    return JSON.stringify(input, null, 2);
  }

  /**
   * Execute this agent: send input to the LLM, validate output,
   * retry with validation errors on failure.
   */
  async execute(input: TInput): Promise<AgentResult<TOutput>> {
    // Validate input
    const inputValidation = this.inputSchema.safeParse(input);
    if (!inputValidation.success) {
      throw new AgentValidationError(
        this.agentName,
        'input',
        inputValidation.error.format(),
      );
    }

    const userMessage = this.formatInput(inputValidation.data);
    let lastResult: CompletionResult | undefined;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const messages = [
        { role: 'user' as const, content: userMessage },
      ];

      // On retry, add the validation error as context
      if (attempt > 0 && lastError) {
        messages.push({
          role: 'user' as const,
          content: `Your previous response failed validation. Here is the error:\n\n${lastError}\n\nPlease fix the issues and respond again with valid JSON matching the required schema.`,
        });
      }

      lastResult = await this.provider.complete({
        model: this.modelOverride,
        systemPrompt: this.systemPrompt,
        messages,
        responseSchema: this.outputSchema,
        temperature: 0.1,
      });

      // Try to parse structured output
      let parsed: unknown;
      if (lastResult.structured) {
        parsed = lastResult.structured;
      } else {
        // Try to extract JSON from raw content
        try {
          parsed = extractJSON(lastResult.content);
        } catch {
          lastError = `Could not parse JSON from response. Raw content starts with: "${lastResult.content.substring(0, 200)}"`;
          continue;
        }
      }

      // Validate against output schema
      const outputValidation = this.outputSchema.safeParse(parsed);
      if (outputValidation.success) {
        return {
          output: outputValidation.data,
          raw: lastResult.content,
          usage: lastResult.usage,
          attempts: attempt + 1,
          model: lastResult.model,
          provider: lastResult.provider,
        };
      }

      // Validation failed — format error for retry
      lastError = formatZodError(outputValidation.error);
    }

    // All retries exhausted
    throw new AgentValidationError(
      this.agentName,
      'output',
      lastError ?? 'Unknown validation error',
      lastResult?.content,
    );
  }
}

/** Result from a successful agent execution */
export interface AgentResult<T> {
  /** Validated, typed output */
  output: T;
  /** Raw LLM response text */
  raw: string;
  /** Token usage */
  usage?: { inputTokens: number; outputTokens: number };
  /** Number of attempts needed (1 = first try succeeded) */
  attempts: number;
  /** Model that served the request */
  model: string;
  /** Provider that served the request */
  provider: string;
}

/** Thrown when agent input or output fails schema validation */
export class AgentValidationError extends Error {
  constructor(
    public readonly agentName: string,
    public readonly phase: 'input' | 'output',
    public readonly validationError: unknown,
    public readonly rawContent?: string,
  ) {
    super(
      `[${agentName}] ${phase} validation failed: ${
        typeof validationError === 'string'
          ? validationError
          : JSON.stringify(validationError, null, 2)
      }`
    );
    this.name = 'AgentValidationError';
  }
}

/**
 * Extract JSON from a string that might contain markdown fences or other text.
 */
function extractJSON(text: string): unknown {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Look for JSON in code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch?.[1]) {
      return JSON.parse(fenceMatch[1]);
    }

    // Look for first { to last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.substring(firstBrace, lastBrace + 1));
    }

    throw new Error('No JSON found in response');
  }
}

/**
 * Format a Zod error into a human-readable string for LLM retry.
 */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map(issue => {
      const path = issue.path.join('.');
      return `- ${path ? `${path}: ` : ''}${issue.message}`;
    })
    .join('\n');
}
