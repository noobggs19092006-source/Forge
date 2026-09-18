import { z } from 'zod';

/**
 * CriticReport — the Critic agent's output.
 * Adversarial design review assessing originality, purpose, and token compliance.
 * Anything below confidence 7 triggers a codegen revision loop.
 */

export const PageAssessmentSchema = z.object({
  pageOrSection: z.string().describe('Page path or section ID being assessed'),

  /** Would this be visually distinguishable from a generic template? */
  distinguishability: z.object({
    score: z.number().min(1).max(10).describe('1 = totally generic, 10 = unmistakably unique'),
    notes: z.string().describe('What specifically makes it distinguishable or generic'),
    specificChanges: z.array(z.string()).default([])
      .describe('Concrete changes to improve distinctiveness (not vague "make it more unique")'),
  }),

  /** Does every animation earn its place? */
  animationAudit: z.object({
    allJustified: z.boolean().describe('True if every animation serves a content purpose'),
    unjustifiedAnimations: z.array(z.string()).default([])
      .describe('Specific animations that are decoration without purpose'),
  }),

  /** Do design choices match the locked tokens? */
  tokenCompliance: z.object({
    compliant: z.boolean().describe('True if codegen followed the design tokens faithfully'),
    drifts: z.array(z.string()).default([])
      .describe('Specific places where codegen drifted from the design token plan'),
  }),
});

export const CriticReportSchema = z.object({
  assessments: z.array(PageAssessmentSchema).min(1)
    .describe('Per-page or per-section assessment'),

  /** Overall confidence that a designer would NOT call this "AI-generated slop" */
  overallConfidence: z.number().min(1).max(10)
    .describe('1-10 confidence that a human designer would NOT say "this is AI-generated". Below 7 requires revision.'),

  /** Actionable revision notes sent back to codegen if confidence < 7 */
  revisionNotes: z.array(z.string()).default([])
    .describe('Specific, actionable revision instructions for codegen'),

  /** Anti-patterns detected from the blocklist */
  antiPatternsDetected: z.array(z.string()).default([])
    .describe('Any anti-patterns from the blocklist that were found in the output'),

  /** Summary paragraph */
  summary: z.string().describe('One-paragraph summary of the critic review'),
});

export type PageAssessment = z.infer<typeof PageAssessmentSchema>;
export type CriticReport = z.infer<typeof CriticReportSchema>;
