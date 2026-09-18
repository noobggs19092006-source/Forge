import { z } from 'zod';
import { BaseAgent } from '../agents/base-agent.js';
import { ProjectBriefSchema } from '../schemas/index.js';
import type { ProjectBrief } from '../schemas/index.js';

/**
 * IntakeAgent — normalizes freeform user prompts into structured ProjectBrief.
 * This is the first step in the pipeline.
 */
class IntakeAgent extends BaseAgent<{ rawPrompt: string }, ProjectBrief> {
  readonly agentName = 'Intake';

  readonly inputSchema = z.object({
    rawPrompt: z.string().min(1),
  });

  readonly outputSchema = ProjectBriefSchema;

  readonly systemPrompt = `You are a project intake specialist. Given a freeform description of a website or web section to build, extract a structured project brief.

Your output must be a JSON object with these fields:
{
  "name": "Short project name (2-4 words, kebab-case-friendly)",
  "description": "One paragraph describing what this project is",
  "industry": "Target industry or domain (e.g., 'fintech', 'portfolio', 'e-commerce', 'saas', 'agency')",
  "mood": ["array", "of", "mood/tone", "keywords"],
  "audience": "Target audience description",
  "features": ["Specific features or sections requested"],
  "constraints": ["Any explicit constraints mentioned"],
  "darkMode": true/false,
  "wants3D": true/false,
  "references": ["Any reference URLs or descriptions"],
  "scope": "section" | "page" | "site"
}

RULES:
1. Extract as much information as possible from the prompt. Infer reasonable defaults for missing fields based on the industry/mood.
2. "mood" should have at least 2-3 keywords that capture the tone (e.g., "bold", "minimal", "playful", "professional", "dark", "editorial").
3. If the prompt doesn't specify scope, default to "section" for short prompts and "page" for longer ones.
4. Set wants3D to true ONLY if the user explicitly requests 3D, WebGL, or immersive elements.
5. Set darkMode to true if the user mentions dark mode, dark theme, or if the mood strongly implies it (e.g., "dark", "moody", "noir").
6. For "features", break down what sections or elements the user wants. If they say "portfolio hero", features might be ["hero section with name/title", "animated background", "call-to-action link"].

Respond with valid JSON only. No explanation, no markdown fences.`;

  protected override formatInput(input: { rawPrompt: string }): string {
    return `User's request:\n\n${input.rawPrompt}`;
  }
}

/**
 * Normalize a raw user prompt into a structured ProjectBrief
 * using the Intake LLM agent.
 */
export async function createIntakeAgent(
  provider: import('../providers/types.js').ProviderAdapter,
  modelOverride?: string,
): Promise<IntakeAgent> {
  return new IntakeAgent(provider, modelOverride);
}
