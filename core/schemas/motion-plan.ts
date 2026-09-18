import { z } from 'zod';

/**
 * MotionPlan — the Motion-Brain agent's output.
 * Per-section animation choreography with justification and fallbacks.
 * Must respect the DesignTokens motion personality.
 */

export const MotionSectionEntrySchema = z.object({
  sectionId: z.string().describe('Matches a PageSection.id from the sitemap'),

  /** What triggers this animation */
  trigger: z.enum([
    'load',               // Runs on page load / component mount
    'scroll-enter',       // Fires once when section enters viewport (IntersectionObserver)
    'scroll-progress',    // Scrubbed to scroll position (ScrollTrigger scrub)
    'hover',              // On hover interaction
    'interaction',        // On click/tap/form interaction
    'none',               // No animation for this section
  ]).describe('What triggers the animation'),

  /** Implementation technique */
  technique: z.enum([
    'css-transition',     // Simple CSS transitions (lowest overhead)
    'css-animation',      // CSS @keyframes
    'gsap-timeline',      // GSAP timeline (non-scroll)
    'gsap-scrolltrigger', // GSAP ScrollTrigger (scroll-driven)
    'r3f-scene',          // React Three Fiber 3D scene
    'lenis-parallax',     // Lenis smooth scroll + parallax layers
    'none',               // No technique needed
  ]).describe('Implementation technique'),

  /** What elements animate and how (brief description for codegen) */
  choreography: z.string()
    .describe('Description of what animates, in what order, with what properties (e.g., "title slides in from left with clipPath reveal, followed by staggered paragraph lines")'),

  /** Why this animation exists — must not be "just because" */
  justification: z.string()
    .describe('One sentence explaining WHY this section needs this animation, tied to content purpose'),

  /** Required reduced-motion fallback */
  reducedMotionFallback: z.string()
    .describe('How this section degrades for prefers-reduced-motion users (e.g., "instant opacity: 1, no transform", "static render of final state")'),

  /** Performance considerations */
  performanceBudget: z.object({
    gpuIntensive: z.boolean().default(false)
      .describe('Whether this animation is GPU-intensive (3D, complex shaders)'),
    lazyMount: z.boolean().default(false)
      .describe('Whether this section should lazy-mount below the fold'),
    estimatedCost: z.enum(['minimal', 'moderate', 'heavy']).default('minimal')
      .describe('Estimated rendering cost'),
  }).optional().default({
    gpuIntensive: false,
    lazyMount: false,
    estimatedCost: 'minimal'
  }),

  /** GSAP/CSS easing override — if omitted, uses design token default */
  easingOverride: z.string().optional()
    .describe('Custom easing for this specific animation (overrides motion personality default)'),

  /** Duration override in seconds — if omitted, uses design token default */
  durationOverride: z.number().optional()
    .describe('Custom duration for this animation in seconds'),
});

export const MotionPlanSchema = z.object({
  sections: z.array(MotionSectionEntrySchema).min(1)
    .describe('Per-section motion choreography entries'),

  /** Global motion notes applying to all sections */
  globalNotes: z.string().default('')
    .describe('Any cross-section motion considerations (e.g., "all scroll animations should use a shared Lenis instance", "respect scroll velocity for duration scaling")'),

  /** Whether any section uses 3D — determines if R3F needs to be loaded */
  uses3D: z.boolean().default(false)
    .describe('Whether any section in this plan requires React Three Fiber'),

  /** Whether smooth scroll (Lenis) is needed */
  usesLenis: z.boolean().default(false)
    .describe('Whether smooth scroll via Lenis is recommended for this page'),
});

export type MotionSectionEntry = z.infer<typeof MotionSectionEntrySchema>;
export type MotionPlan = z.infer<typeof MotionPlanSchema>;
