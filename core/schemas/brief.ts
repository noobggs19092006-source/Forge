import { z } from 'zod';

/**
 * ProjectBrief — the normalized intake artifact.
 * Produced by the Intake stage from freeform user input.
 * Consumed by Architect, Design-Brain, and downstream stages.
 */
export const ProjectBriefSchema = z.object({
  /** Human-readable project name */
  name: z.string().min(1).describe('Project name'),

  /** One-paragraph description of what this project is */
  description: z.string().min(10).describe('Project description'),

  /** Target industry or domain (e.g., "fintech", "portfolio", "e-commerce") */
  industry: z.string().describe('Industry or domain'),

  /** Mood/tone keywords (e.g., "bold", "minimal", "playful", "corporate") */
  mood: z.array(z.string()).min(1).describe('Mood/tone keywords'),

  /** Target audience description */
  audience: z.string().describe('Target audience'),

  /** Specific features or sections requested */
  features: z.array(z.string()).describe('Requested features or sections'),

  /** Explicit constraints or requirements from the user */
  constraints: z.array(z.string()).default([]).describe('User-specified constraints'),

  /** Whether dark mode is requested */
  darkMode: z.boolean().default(false).describe('Dark mode requested'),

  /** Whether 3D/WebGL elements are explicitly requested */
  wants3D: z.boolean().default(false).describe('3D/WebGL explicitly requested'),

  /** Reference URLs or descriptions the user provided */
  references: z.array(z.string()).default([]).describe('Reference URLs or descriptions'),

  /** Generation scope: are we building a single section, a page, or a full site? */
  scope: z.enum(['section', 'page', 'site']).default('section').describe('Generation scope'),
});

export type ProjectBrief = z.infer<typeof ProjectBriefSchema>;
