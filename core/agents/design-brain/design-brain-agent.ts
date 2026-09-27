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
      "source": "google-fonts"
    },
    "textFont": {
      "family": "Font Name",
      "weights": [400, 500],
      "source": "google-fonts"
    },
    "justification": "One sentence explaining why these typefaces match the brief's tone.",
    "typeScale": [
      {
        "name": "xs",
        "minSize": "0.75rem",
        "maxSize": "0.875rem",
        "clampFormula": "clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)",
        "lineHeight": 1.5
      },
      {
        "name": "sm",
        "minSize": "0.875rem",
        "maxSize": "1rem",
        "clampFormula": "clamp(0.875rem, 0.8rem + 0.3vw, 1rem)",
        "lineHeight": 1.5
      },
      {
        "name": "base",
        "minSize": "1rem",
        "maxSize": "1.125rem",
        "clampFormula": "clamp(1rem, 0.9rem + 0.4vw, 1.125rem)",
        "lineHeight": 1.5
      },
      {
        "name": "lg",
        "minSize": "1.125rem",
        "maxSize": "1.25rem",
        "clampFormula": "clamp(1.125rem, 1rem + 0.5vw, 1.25rem)",
        "lineHeight": 1.4
      },
      {
        "name": "xl",
        "minSize": "1.25rem",
        "maxSize": "1.5rem",
        "clampFormula": "clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)",
        "lineHeight": 1.2
      }
    ]
  },
  "colors": {
    "tokens": [
      {
        "name": "primary",
        "light": "oklch(0.45 0.2 260)",
        "dark": "oklch(0.75 0.15 260)"
      },
      {
        "name": "surface",
        "light": "oklch(0.98 0.01 260)",
        "dark": "oklch(0.15 0.02 260)"
      },
      {
        "name": "on-surface",
        "light": "oklch(0.1 0.05 260)",
        "dark": "oklch(0.95 0.02 260)"
      },
      {
        "name": "accent",
        "light": "oklch(0.6 0.15 120)",
        "dark": "oklch(0.8 0.1 120)"
      }
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
    "description": "1-2 sentence personality",
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

5. JSON FORMATTING & SCHEMA COMPLIANCE (CRITICAL FOR LOCAL MODELS):
   - Font source MUST be exactly "google-fonts", "local", or "variable". DO NOT output "Google Fonts".
   - \`defaultDuration\` and \`staggerInterval\` MUST be raw numbers (e.g., 0.6), NOT strings (e.g., not "0.6s").
   - You MUST fully populate all arrays. Do NOT output empty or incomplete arrays. \`typeScale\` MUST have at least 5 complete elements. \`colors.tokens\` MUST have at least 4 complete elements. \`spacing.scale\` MUST have at least 4 complete elements.

${formatAntiPatternsForPrompt()}

Respond with valid JSON only. No explanation, no markdown fences.`;
}
