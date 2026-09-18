import { BaseAgent } from '../base-agent.js';
import { ProjectBriefSchema, SitemapSchema } from '../../schemas/index.js';
import type { ProjectBrief, Sitemap } from '../../schemas/index.js';

/**
 * ArchitectAgent — site information architect.
 * Produces a JSON sitemap from a project brief.
 * 
 * At M1 scope (single section), this agent is skipped
 * but exists and is tested for M2+ multi-page generation.
 */
export class ArchitectAgent extends BaseAgent<ProjectBrief, Sitemap> {
  readonly agentName = 'Architect';

  readonly inputSchema = ProjectBriefSchema;
  readonly outputSchema = SitemapSchema;

  readonly systemPrompt = `You are a site information architect. Given a project brief, produce a JSON sitemap.

Your output must be a JSON object with this structure:
- pages[]: array of pages, each with:
  - path: string (route path like "/", "/about", "/work/[slug]")
  - purpose: string (single primary purpose of this page)
  - sections[]: array of sections, each with:
    - id: string (unique identifier like "hero", "features", "testimonials")
    - purpose: string (what this section communicates or enables)
    - contentType: one of "hero", "features", "testimonials", "pricing", "cta", "about", "gallery", "contact", "stats", "team", "faq", "blog-list", "custom"
    - animationSafe: boolean (false for scannable data like pricing tables)
  - priority: "high" | "medium" | "low"
- sharedLayout: object with:
  - navType: one of "fixed-top", "sidebar", "hamburger", "minimal", "none"
  - footerType: one of "full", "minimal", "none"
  - persistentElements: string[] (e.g., "floating CTA", "scroll progress bar")
- routingNotes: string (any dynamic routes, nested layouts needed)

RULES:
1. Do NOT invent pages the brief doesn't need. A 3-page site described as "portfolio" should not become 8 pages.
2. Every page must have a clear, single primary purpose.
3. Flag any page where 3D/heavy animation could hurt (e.g., a pricing table with load-bearing scannable text should NOT be animation-heavy — set animationSafe: false).
4. Section IDs must be unique within a page.
5. Choose navType and footerType based on the site's complexity and purpose, not defaults.

Respond with valid JSON only. No explanation, no markdown fences.`;
}
