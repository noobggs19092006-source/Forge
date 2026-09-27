import { z } from 'zod';

/**
 * DesignTokens — the Design-Brain agent's output.
 * A locked set of design decisions that ALL downstream stages must obey.
 * This is the mechanism that prevents "different vibe per page."
 */

// --- Typography ---

export const FluidTypeStepSchema = z.object({
  name: z.string().describe('Step name (e.g., "xs", "sm", "base", "lg", "xl", "2xl", "display")'),
  minSize: z.string().describe('Minimum size in rem (e.g., "0.75rem")'),
  maxSize: z.string().describe('Maximum size in rem (e.g., "1rem")'),
  clampFormula: z.string().describe('Full clamp() formula (e.g., "clamp(0.75rem, 0.65rem + 0.5vw, 1rem)")'),
  lineHeight: z.coerce.number().describe('Line height as unitless ratio (e.g., 1.5)'),
  letterSpacing: z.string().optional().describe('Letter spacing (e.g., "-0.02em")'),
});

export const TypographySystemSchema = z.object({
  displayFont: z.object({
    family: z.string().describe('Font family name (e.g., "Space Grotesk")'),
    weights: z.array(z.number()).min(1).describe('Available weights (e.g., [400, 700])'),
    source: z.enum(['google-fonts', 'local', 'variable']).describe('Font source for loading strategy'),
  }),
  textFont: z.object({
    family: z.string().describe('Font family name'),
    weights: z.array(z.number()).min(1),
    source: z.enum(['google-fonts', 'local', 'variable']),
  }),
  /** Why these typefaces were chosen — tied to the brief's tone */
  justification: z.string().describe('One-sentence justification for the typographic choice'),
  typeScale: z.array(FluidTypeStepSchema).min(2).describe('Fluid type scale with clamp() formulas'),
});

// --- Color ---

export const ColorTokenSchema = z.object({
  name: z.string().describe('Token name (e.g., "primary", "surface", "on-surface", "accent")'),
  light: z.string().describe('OKLCH value for light mode (e.g., "oklch(0.45 0.2 260)")'),
  dark: z.string().describe('OKLCH value for dark mode'),
});

export const ColorSystemSchema = z.object({
  tokens: z.array(ColorTokenSchema).min(2).describe('Color tokens with light/dark values'),
  /** How the palette was derived from the brief */
  rationale: z.string().describe('How the palette connects to the brief mood/industry'),
});

// --- Spacing / Grid ---

export const SpacingSystemSchema = z.object({
  baseUnit: z.number().default(8).describe('Base spacing unit in px (typically 8)'),
  scale: z.array(z.object({
    name: z.string().describe('Token name (e.g., "xs", "sm", "md", "lg", "xl", "2xl")'),
    value: z.string().describe('Value in rem or calc (e.g., "0.5rem", "calc(var(--space-base) * 2)")'),
  })).min(2).describe('Spacing scale'),
  gridColumns: z.number().default(12).describe('Grid column count'),
  maxWidth: z.string().default('80rem').describe('Content max width'),
  gutterWidth: z.string().default('1.5rem').describe('Grid gutter width'),
});

// --- Motion Personality ---

export const MotionPersonalitySchema = z.object({
  description: z.string()
    .describe('1-2 sentence personality definition (e.g., "sharp, high-contrast, minimal easing — feels mechanical and confident")'),
  defaultEasing: z.string()
    .describe('Default GSAP/CSS easing (e.g., "power3.out", "cubic-bezier(0.16, 1, 0.3, 1)")'),
  defaultDuration: z.coerce.number()
    .describe('Default animation duration in seconds (e.g., 0.6)'),
  staggerInterval: z.coerce.number()
    .describe('Default stagger interval for grouped animations in seconds (e.g., 0.08)'),
});

// --- Top-level ---

export const DesignTokensSchema = z.object({
  typography: TypographySystemSchema,
  colors: ColorSystemSchema,
  spacing: SpacingSystemSchema,
  motionPersonality: MotionPersonalitySchema,
  designRationale: z.string()
    .describe('One-paragraph rationale connecting all design decisions to the project brief'),
});

export type FluidTypeStep = z.infer<typeof FluidTypeStepSchema>;
export type TypographySystem = z.infer<typeof TypographySystemSchema>;
export type ColorToken = z.infer<typeof ColorTokenSchema>;
export type ColorSystem = z.infer<typeof ColorSystemSchema>;
export type SpacingSystem = z.infer<typeof SpacingSystemSchema>;
export type MotionPersonality = z.infer<typeof MotionPersonalitySchema>;
export type DesignTokens = z.infer<typeof DesignTokensSchema>;
