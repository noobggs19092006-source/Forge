import { z } from 'zod';
import { BaseAgent } from '../base-agent.js';
import { CriticReportSchema, SitemapSchema } from '../../schemas/index.js';
import type { CriticReport, DesignTokens, MotionPlan, ProjectBrief, Sitemap } from '../../schemas/index.js';
import type { GeneratedCode } from '../codegen/codegen-agent.js';
import { formatAntiPatternsForPrompt } from '../../knowledge/anti-patterns.js';

/**
 * CriticAgent — adversarial design director.
 * Reviews generated output for originality, purpose, and token compliance.
 * Anything below confidence 7 triggers codegen revision.
 */

const CriticInputSchema = z.object({
  brief: z.object({
    name: z.string(),
    description: z.string(),
    mood: z.array(z.string()),
    industry: z.string(),
  }),
  designTokens: z.unknown(),
  motionPlan: z.unknown(),
  sitemap: SitemapSchema,
  generatedCode: z.object({
    files: z.record(z.string(), z.string()),
    dependencies: z.record(z.string(), z.string()).default({}),
    notes: z.string().default(''),
  }),
});

type CriticInput = {
  brief: {
    name: string;
    description: string;
    mood: string[];
    industry: string;
  };
  designTokens: DesignTokens;
  motionPlan: MotionPlan;
  sitemap: Sitemap;
  generatedCode: GeneratedCode;
};

export class CriticAgent extends BaseAgent<CriticInput, CriticReport> {
  readonly agentName = 'Critic';

  readonly inputSchema = CriticInputSchema as z.ZodType<CriticInput>;
  readonly outputSchema = CriticReportSchema;

  readonly systemPrompt = `You are a strict, adversarial design director and technical architect.
You evaluate the generated codebase against the project brief, design tokens, motion plan, and the architecture sitemap.

Your job is NOT to be nice. Your job is to prevent generic, "AI-looking", or broken multi-page implementations from reaching the user.
You evaluate the entire codebase as a holistic system.

EVALUATION CRITERIA:
1. Sitemap Compliance: Are all pages and routes from the sitemap present and correctly structured? Do they share the requested layout (navType, footerType)?
2. Distinguishability: Does it look like a generic Bootstrap/Tailwind template? (If yes, score heavily down). Does it capture the requested mood?
3. Animation Audit: Did they implement the exact motion choreography? Is it janky? Did they use will-change properly?
4. Token Compliance: Did they strictly use the provided typography, colors, and scaling formulas, or did they invent their own?

ANTI-PATTERNS (Fail immediately if found):
${formatAntiPatternsForPrompt()}

Output valid JSON matching the CriticReport schema. No markdown, no explanations outside JSON.`;

  protected override formatInput(input: CriticInput): string {
    let prompt = `## Project Brief
Name: ${input.brief.name}
Description: ${input.brief.description}
Industry: ${input.brief.industry}
Mood: ${input.brief.mood.join(', ')}

## Architect Sitemap
${JSON.stringify(input.sitemap, null, 2)}

## Design Tokens
${JSON.stringify(input.designTokens, null, 2)}

## Motion Plan (what codegen was supposed to implement)
${JSON.stringify(input.motionPlan, null, 2)}

## Generated Code (what you're reviewing)
`;

    for (const [fileName, content] of Object.entries(input.generatedCode.files)) {
      prompt += `\n### File: ${fileName}\n\`\`\`\n${content}\n\`\`\`\n`;
    }

    return prompt;
  }
}
