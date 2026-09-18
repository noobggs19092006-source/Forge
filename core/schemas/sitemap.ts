import { z } from 'zod';

/**
 * Sitemap — the Architect agent's output.
 * Defines the information architecture: pages, sections, navigation, routing.
 * Consumed by Design-Brain and Motion-Brain stages.
 */

export const SharedLayoutSchema = z.object({
  navType: z.enum(['fixed-top', 'sidebar', 'hamburger', 'minimal', 'none'])
    .describe('Navigation pattern'),
  footerType: z.enum(['full', 'minimal', 'none'])
    .describe('Footer style'),
  persistentElements: z.array(z.string()).default([])
    .describe('Elements that persist across pages (e.g., "floating CTA", "scroll progress bar")'),
});

export const PageSectionSchema = z.object({
  id: z.string().describe('Unique section identifier (e.g., "hero", "features", "testimonials")'),
  purpose: z.string().describe('What this section communicates or enables'),
  contentType: z.enum([
    'hero', 'features', 'testimonials', 'pricing', 'cta',
    'about', 'gallery', 'contact', 'stats', 'team',
    'faq', 'blog-list', 'custom',
  ]).describe('Section archetype'),
  animationSafe: z.boolean().default(true)
    .describe('Whether heavy animation is appropriate here (false for scannable data tables, etc.)'),
});

export const PageSchema = z.object({
  path: z.string().describe('Route path (e.g., "/", "/about", "/work/[slug]")'),
  purpose: z.string().describe('Single primary purpose of this page'),
  sections: z.array(PageSectionSchema).min(1).describe('Ordered list of page sections'),
  priority: z.enum(['high', 'medium', 'low']).default('medium')
    .describe('Build priority — determines generation order'),
});

export const SitemapSchema = z.object({
  pages: z.array(PageSchema).min(1).describe('All pages in the site'),
  sharedLayout: SharedLayoutSchema.default({
    navType: 'fixed-top',
    footerType: 'minimal',
    persistentElements: [],
  }).describe('Shared layout configuration'),
  routingNotes: z.string().default('')
    .describe('Notes on dynamic routes, nested layouts, or special routing needs'),
});

export type SharedLayout = z.infer<typeof SharedLayoutSchema>;
export type PageSection = z.infer<typeof PageSectionSchema>;
export type Page = z.infer<typeof PageSchema>;
export type Sitemap = z.infer<typeof SitemapSchema>;
