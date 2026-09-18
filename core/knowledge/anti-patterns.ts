/**
 * Anti-pattern blocklist — fed into Design-Brain and Critic agent prompts.
 * This is a living list that grows as we identify more convergent AI patterns.
 */

export interface AntiPattern {
  id: string;
  name: string;
  description: string;
  /** What to look for in generated output */
  indicators: string[];
  /** What to do instead */
  alternatives: string[];
  /** Which agents should check for this */
  relevantStages: Array<'design-brain' | 'codegen' | 'critic'>;
}

export const ANTI_PATTERNS: AntiPattern[] = [
  {
    id: 'gradient-hero-default',
    name: 'Default gradient hero background',
    description: 'Purple→blue or pink→orange linear-gradient used as the hero background with no other visual interest or compositional thought.',
    indicators: [
      'linear-gradient with purple-to-blue or pink-to-orange',
      'gradient-only hero background with no texture, imagery, or spatial depth',
      'bg-gradient-to-r from-purple-* to-blue-* (Tailwind defaults)',
    ],
    alternatives: [
      'Solid color with strong typography as the focal point',
      'Full-bleed photography or illustration',
      'Geometric patterns derived from the brand system',
      'Subtle grain/noise texture over a muted background',
      'Split-layout hero with asymmetric composition',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
  {
    id: 'fade-up-only',
    name: 'Fade-up-only scroll animation',
    description: '"Fade up + slight translateY on scroll" used as the ONLY scroll animation technique site-wide, applied uniformly to every section.',
    indicators: [
      'Every section uses identical opacity + translateY animation on scroll',
      'No variation in animation technique across sections',
      'No scroll-linked/scrubbed animations, only intersection-triggered fades',
    ],
    alternatives: [
      'Vary technique per section: parallax, clip-path reveals, stagger, scale transforms',
      'Use scroll-linked (scrubbed) animation for at least one section',
      'Mix trigger types: some on scroll-enter, some scrubbed, some on interaction',
      'Use CSS clip-path or mask reveals instead of opacity fades',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
  {
    id: 'unmodified-shadcn',
    name: 'Default shadcn/ui styling',
    description: 'shadcn/ui card/button/component styling left completely unmodified — default border-radius, shadow, colors, spacing.',
    indicators: [
      'Components visually identical to shadcn/ui defaults',
      'No custom theming applied to component primitives',
      'Default rounded-lg border shadow-sm pattern everywhere',
    ],
    alternatives: [
      'Override component tokens to match the locked design system',
      'Modify border-radius, shadow depth, padding to create a distinct feel',
      'Apply the motion personality to component transitions',
      'Use the project\'s color tokens, not Tailwind defaults',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
  {
    id: 'centered-monotony',
    name: 'Centered single-column monotony',
    description: 'Every section is a centered single-column layout with no compositional rhythm, asymmetry, or grid variation.',
    indicators: [
      'Every section: centered heading + centered paragraph + centered button',
      'No asymmetric layouts, split sections, or offset grids',
      'No variation in section width or alignment',
      'Uniform padding/margin on every section',
    ],
    alternatives: [
      'Use asymmetric split layouts for some sections',
      'Vary section widths (some full-bleed, some narrow-focus)',
      'Use CSS grid with intentional column spans and offsets',
      'Break the vertical rhythm with horizontal scrolling sections or offset elements',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
  {
    id: 'default-typeface',
    name: 'Unjustified default typeface',
    description: 'Inter/Geist/system-ui used as the only typeface with no design justification.',
    indicators: [
      'Font-family: Inter, system-ui, or Geist with no stated reason',
      'Only one typeface used for both display and body',
      'No typographic personality — everything reads the same',
    ],
    alternatives: [
      'Choose typefaces that reflect the project\'s tone/industry',
      'Use a display face for headings and a text face for body',
      'Justify the choice in the design rationale',
      'If Inter IS the right choice, state why explicitly',
    ],
    relevantStages: ['design-brain', 'critic'],
  },
  {
    id: 'spinning-3d-object',
    name: 'Contextless spinning 3D object',
    description: '3D hero objects that spin continuously for no contextual reason — generic rotating abstract shapes with no relation to content.',
    indicators: [
      'autoRotate on a 3D scene with no user interaction purpose',
      'Abstract geometric shape as 3D hero with no brand/product connection',
      '3D used "to seem impressive" with no content justification',
    ],
    alternatives: [
      'Only use 3D when the content IS spatial (product configurator, data viz, architecture)',
      'Make 3D interactive (user controls rotation, exploded views reveal information)',
      'If the hero needs visual interest, consider 2D animation or strong typography instead',
      'If 3D is used, tie it to the product/brand (not abstract blobs)',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
  {
    id: 'glassmorphism-default',
    name: 'Default glassmorphism aesthetic',
    description: 'Glassmorphism/blur-everything used as a default aesthetic rather than a deliberate, justified design choice.',
    indicators: [
      'backdrop-filter: blur() on most cards/surfaces with no reasoning',
      'Semi-transparent surfaces everywhere without supporting the content hierarchy',
      'Glass effect used as a substitute for actual visual design',
    ],
    alternatives: [
      'Use solid, opaque surfaces as the default — glass only where layering serves the UI',
      'If blur is used, limit it to specific interactive overlays (modals, dropdowns)',
      'Build visual hierarchy through color, spacing, and typography instead of transparency',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
  {
    id: 'rounded-card-grid',
    name: 'Generic rounded-card grid',
    description: 'Uniform grid of rounded cards with shadows and no compositional variation — the "features section" every AI generates.',
    indicators: [
      'Grid of 3 or 4 equally-sized cards with identical styling',
      'Each card: icon + heading + short paragraph, uniform border-radius and shadow',
      'No size variation, hierarchy, or visual focus point in the grid',
    ],
    alternatives: [
      'Vary card sizes to create visual hierarchy (featured item larger)',
      'Use bento-style asymmetric grid layouts',
      'Replace card grids with horizontal scroll, accordion, or tabbed layouts',
      'Use border/outline treatments instead of shadow-on-white',
    ],
    relevantStages: ['design-brain', 'codegen', 'critic'],
  },
];

/**
 * Format the anti-pattern blocklist for injection into agent prompts.
 */
export function formatAntiPatternsForPrompt(): string {
  let output = '## Anti-Pattern Blocklist (MUST AVOID)\n\n';
  output += 'The following patterns are explicitly banned. If you produce any of these, the output will be rejected by the Critic stage.\n\n';

  for (const pattern of ANTI_PATTERNS) {
    output += `### ❌ ${pattern.name}\n`;
    output += `${pattern.description}\n\n`;
    output += `**Red flags:** ${pattern.indicators.join('; ')}\n\n`;
    output += `**Do instead:** ${pattern.alternatives.join('; ')}\n\n`;
  }

  return output;
}
