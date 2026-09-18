import { z } from 'zod';
import { BaseAgent } from '../base-agent.js';
import { DesignTokensSchema, MotionPlanSchema, SitemapSchema } from '../../schemas/index.js';
import type { DesignTokens, MotionPlan, PageSection, Sitemap } from '../../schemas/index.js';
import { formatRecipesForPrompt } from '../../knowledge/animation-recipes.js';

/**
 * MotionBrainAgent — motion designer specializing in scroll-driven web experiences.
 * Produces a per-section motion plan respecting the locked design tokens.
 */

const MotionBrainInputSchema = z.object({
  designTokens: DesignTokensSchema,
  sections: z.array(z.object({
    id: z.string(),
    purpose: z.string(),
    contentType: z.string(),
    animationSafe: z.boolean().default(true),
  })),
  sitemap: SitemapSchema.optional(),
});

type MotionBrainInput = {
  designTokens: DesignTokens;
  sections: Array<{
    id: string;
    purpose: string;
    contentType: string;
    animationSafe: boolean;
  }>;
  sitemap?: Sitemap;
};

export class MotionBrainAgent extends BaseAgent<MotionBrainInput, MotionPlan> {
  readonly agentName = 'Motion-Brain';

  readonly inputSchema = MotionBrainInputSchema as z.ZodType<MotionBrainInput>;
  readonly outputSchema = MotionPlanSchema;

  readonly systemPrompt = `You are a motion designer specializing in scroll-driven web experiences (GSAP/Lenis/R3F level).
Given locked design tokens (including a motion personality) and a list of page sections, produce a motion plan.

Your output must be a JSON object with this structure:
{
  "sections": [
    {
      "sectionId": "hero",
      "trigger": "load" | "scroll-enter" | "scroll-progress" | "hover" | "interaction" | "none",
      "technique": "css-transition" | "css-animation" | "gsap-timeline" | "gsap-scrolltrigger" | "r3f-scene" | "lenis-parallax" | "none",
      "choreography": "Description of what animates, in what order, with what properties",
      "justification": "One sentence on WHY this section needs this animation — tied to content purpose",
      "reducedMotionFallback": "How this degrades for prefers-reduced-motion users",
      "performanceBudget": {
        "gpuIntensive": false,
        "lazyMount": false,
        "estimatedCost": "minimal" | "moderate" | "heavy"
      },
      "easingOverride": "optional — custom easing if different from motion personality default",
      "durationOverride": 0.8  // optional — custom duration in seconds
    }
  ],
  "globalNotes": "Cross-section considerations",
  "uses3D": false,
  "usesLenis": false
}

CRITICAL RULES:

3. NO NULL VALUES: If you do not need an optional field (like easingOverride or durationOverride), you MUST OMIT the key entirely from the JSON object. Do NOT output "easingOverride": null or "durationOverride": null.


1. RESPECT THE MOTION PERSONALITY: The design tokens include a motion personality with default easing and duration. Your choreography must match this personality. Only override easing/duration when a specific section has a strong content reason to differ.

2. JUSTIFY EVERY ANIMATION: Every section entry must have a justification tied to content purpose. "It looks cool" or "for visual interest" are NOT valid justifications. If a section doesn't need animation, set trigger and technique to "none".

3. REDUCED-MOTION FALLBACK: Required for EVERY entry without exception. Never just say "no animation" — specify what the user sees instead (e.g., "content immediately visible at final positions", "static render with all content visible").

4. 3D/WebGL USAGE:
   - ONLY propose r3f-scene for: hero moments with genuine spatial/product content, data visualization that benefits from 3D space, or explicit brand requests for immersive feel
   - Every 3D scene MUST have a static/low-fidelity fallback
   - NEVER propose 3D "to seem impressive" — if the brief pushes for unjustified 3D, flag it and suggest 2D alternatives
   - Set uses3D to true ONLY if at least one section genuinely uses r3f-scene

5. CONTEXT-AWARE MOTION:
   - Animation duration/easing should implicitly scale with viewport (mobile = snappier)
   - Note if scroll velocity should affect any scroll-linked animations
   - Every animated interaction must degrade gracefully with zero JS (content visible before animations load)

6. PERFORMANCE:
   - Set gpuIntensive: true for any 3D, complex shader, or heavy particle animations
   - Set lazyMount: true for below-fold sections with heavy animation
   - Mark estimatedCost honestly — don't mark everything as "minimal"

7. VARIETY: Do NOT use the same trigger+technique combination for every section. Vary your approach based on content type and purpose. Reference the available techniques below.

${formatRecipesForPrompt()}

Respond with valid JSON only. No explanation, no markdown fences.`;
}
