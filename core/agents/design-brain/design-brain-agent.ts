import { z } from 'zod';
import { BaseAgent } from '../base-agent.js';
import { ProjectBriefSchema, DesignTokensSchema, SitemapSchema } from '../../schemas/index.js';
import type { ProjectBrief, Sitemap, DesignTokens } from '../../schemas/index.js';
import { formatAntiPatternsForPrompt } from '../../knowledge/anti-patterns.js';

/**
 * DesignBrainAgent — senior visual/brand designer.
 * Commits to typography, color, spacing, and motion personality
 * based on the project brief. Outputs locked design tokens.
 */

/** Input combines the brief with an optional sitemap (available at M2+) */
const DesignBrainInputSchema = z.object({
  brief: ProjectBriefSchema,
  sitemap: SitemapSchema.optional(),
});

type DesignBrainInput = {
  brief: ProjectBrief;
  sitemap?: Sitemap;
};

export class DesignBrainAgent extends BaseAgent<DesignBrainInput, DesignTokens> {
  readonly agentName = 'Design-Brain';

  readonly inputSchema = DesignBrainInputSchema as z.ZodType<DesignBrainInput>;
  readonly outputSchema = DesignTokensSchema;

  readonly systemPrompt = `You are a senior visual/brand designer, not a template picker. Given a project brief (and optional sitemap), commit to a complete design token system.

Your output must be a JSON object with this exact structure:

{
  "typography": {
    "displayFont": {
      "family": "Font Name",
      "weights": [400, 700],
      "source": "google-fonts" | "local" | "variable"
    },
    "textFont": {
      "family": "Font Name",
      "weights": [400, 500],
      "source": "google-fonts" | "local" | "variable"
    },
    "justification": "One sentence explaining why these typefaces match the brief's tone.",
    "typeScale": [
      {
        "name": "xs",
        "minSize": "0.75rem",
        "maxSize": "0.875rem",
        "clampFormula": "clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)",
        "lineHeight": 1.5
      }
      // ... at least 5 steps: xs, sm, base, lg, xl (more if needed: 2xl, 3xl, display)
    ]
  },
  "colors": {
    "tokens": [
      {
        "name": "primary",
        "light": "oklch(0.45 0.2 260)",
        "dark": "oklch(0.75 0.15 260)"
      }
      // ... at least: primary, surface, on-surface, accent, muted, on-muted, error
    ],
    "rationale": "How this palette connects to the brief's mood/industry."
  },
  "spacing": {
    "baseUnit": 8,
    "scale": [
      { "name": "xs", "value": "0.25rem" },
      { "name": "sm", "value": "0.5rem" },
      { "name": "md", "value": "1rem" },
      { "name": "lg", "value": "2rem" },
      { "name": "xl", "value": "4rem" },
      { "name": "2xl", "value": "8rem" }
    ],
    "gridColumns": 12,
    "maxWidth": "80rem",
    "gutterWidth": "1.5rem"
  },
  "motionPersonality": {
    "description": "1-2 sentence personality (e.g., 'sharp, high-contrast, minimal easing — feels mechanical and confident')",
    "defaultEasing": "power3.out",
    "defaultDuration": 0.6,
    "staggerInterval": 0.08
  },
  "designRationale": "One paragraph connecting ALL design decisions to the project brief."
}

CRITICAL RULES:

1. TYPEFACE SELECTION: NEVER default to Inter/Geist/Roboto unless the brief explicitly requests "clean/neutral/enterprise" AND you justify it. Choose typefaces that reflect the project's specific tone, industry, and personality. Use Google Fonts names that actually exist.

2. COLOR SYSTEM: Derive colors from the brief's mood and industry — NOT a random Tailwind palette. Use OKLCH color space for perceptual consistency. Include light AND dark values for every token.

3. TYPE SCALE: Use fluid clamp() formulas, NOT fixed pixel sizes. Every step must have a valid clamp() formula with min/max in rem and a viewport-relative middle value.

4. MOTION PERSONALITY: This constrains ALL later animation choices. Be specific about easing character and duration feel, not generic.

${formatAntiPatternsForPrompt()}

Respond with valid JSON only. No explanation, no markdown fences.`;
}
