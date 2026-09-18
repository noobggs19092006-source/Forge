/**
 * Curated animation recipes — reference patterns the Motion-Brain
 * and Codegen agents can draw from.
 * 
 * These are NOT templates to copy — they're technique examples
 * that should be adapted to each project's motion personality.
 */

export interface AnimationRecipe {
  id: string;
  name: string;
  description: string;
  technique: 'css-transition' | 'css-animation' | 'gsap-timeline' | 'gsap-scrolltrigger' | 'r3f-scene' | 'lenis-parallax';
  /** When this recipe is appropriate */
  useWhen: string;
  /** Pseudocode/description of the implementation */
  implementation: string;
  /** Required reduced-motion behavior */
  reducedMotion: string;
  /** Performance cost */
  cost: 'minimal' | 'moderate' | 'heavy';
}

export const ANIMATION_RECIPES: AnimationRecipe[] = [
  {
    id: 'clip-path-reveal',
    name: 'Clip-path section reveal',
    description: 'Section content revealed through an animated clip-path (e.g., circle or polygon expanding from center/edge). GPU-composited, zero layout thrash.',
    technique: 'gsap-timeline',
    useWhen: 'Hero sections, about sections, or any content that benefits from a dramatic reveal moment.',
    implementation: `
      - Set initial clip-path: inset(100% 0 0 0) or circle(0% at 50% 50%)
      - On scroll-enter or load, animate to clip-path: inset(0) or circle(100%)
      - Stagger child elements after the reveal completes
      - Use will-change: clip-path for GPU compositing
    `,
    reducedMotion: 'Show content immediately with opacity: 1, no clip-path animation.',
    cost: 'minimal',
  },
  {
    id: 'staggered-text-lines',
    name: 'Per-line text stagger',
    description: 'Heading or paragraph text split into lines, each sliding in with slight stagger. Uses SplitText or manual line wrapping.',
    technique: 'gsap-timeline',
    useWhen: 'Headlines, hero text, or any text block where the reading order creates a natural stagger.',
    implementation: `
      - Wrap each line in a span with overflow: hidden on the parent
      - Set initial transform: translateY(110%) on each line
      - Animate to translateY(0) with stagger: 0.08s
      - Use the design token's default easing
    `,
    reducedMotion: 'Text appears instantly, no transform animation.',
    cost: 'minimal',
  },
  {
    id: 'parallax-layers',
    name: 'Scroll-linked parallax layers',
    description: 'Multiple visual layers moving at different speeds relative to scroll, creating depth. Uses Lenis + GSAP ScrollTrigger.',
    technique: 'lenis-parallax',
    useWhen: 'Visual storytelling sections, image-heavy layouts, or sections that benefit from depth perception.',
    implementation: `
      - Assign data-speed attributes to layers (e.g., 0.5, 0.8, 1.2)
      - Use ScrollTrigger scrub: true to link transform: translateY to scroll progress
      - Back layer moves slower (speed < 1), front layer moves faster (speed > 1)
      - Ensure content is still readable without parallax
    `,
    reducedMotion: 'All layers scroll at the same speed (static layout).',
    cost: 'moderate',
  },
  {
    id: 'scroll-scrub-progress',
    name: 'Scroll-scrubbed progress animation',
    description: 'Animation progress directly tied to scroll position — scrubbing through a timeline as the user scrolls. Elements transform, scale, or recolor based on scroll progress.',
    technique: 'gsap-scrolltrigger',
    useWhen: 'Process/timeline sections, feature showcases, or narrative content that should unfold with scroll.',
    implementation: `
      - Create GSAP timeline with scrub: true
      - Pin the section during the scroll-through
      - Animate elements through states as scroll progresses
      - Use snap for discrete steps if the content has clear stages
    `,
    reducedMotion: 'Show all states simultaneously or use a tabbed/carousel interface.',
    cost: 'moderate',
  },
  {
    id: 'hover-magnetic',
    name: 'Magnetic hover effect',
    description: 'Elements subtly follow the cursor within a radius, creating a magnetic pull effect. Uses requestAnimationFrame for smooth tracking.',
    technique: 'gsap-timeline',
    useWhen: 'Buttons, cards, or interactive elements where hover engagement matters. Use sparingly — not on every element.',
    implementation: `
      - Track mouse position relative to element center
      - Apply transform: translate(dx, dy) scaled to a fraction of the offset
      - Use GSAP.to() with short duration for smooth following
      - Reset on mouse leave with spring-like easing
    `,
    reducedMotion: 'Standard CSS :hover state only, no magnetic tracking.',
    cost: 'minimal',
  },
  {
    id: 'product-3d-viewer',
    name: '3D product viewer',
    description: 'Interactive 3D product model that responds to user input (drag to rotate, scroll to zoom). Uses R3F with lazy loading.',
    technique: 'r3f-scene',
    useWhen: 'Product pages, configurators, or any content where spatial understanding of a physical object is the primary goal.',
    implementation: `
      - Lazy-load R3F canvas with next/dynamic (ssr: false)
      - Use OrbitControls with constrained rotation
      - Progressive loading: show 2D image → load 3D model → fade transition
      - Optimize model with draco compression
      - Add ARIA description of the product for screen readers
    `,
    reducedMotion: 'Show static product images from key angles (front, side, detail).',
    cost: 'heavy',
  },
  {
    id: 'counter-scroll-in',
    name: 'Counter/stat scroll-in',
    description: 'Numerical stats count up from 0 to their final value when scrolled into view. Numbers animate in real-time.',
    technique: 'gsap-scrolltrigger',
    useWhen: 'Statistics sections, KPI displays, or anywhere numerical impact needs emphasis.',
    implementation: `
      - Use ScrollTrigger onEnter to start the count
      - Animate a proxy object { value: 0 } → { value: targetNumber }
      - Update DOM text content on each GSAP tick
      - Use Intl.NumberFormat for locale-aware formatting
      - Snap to integers to avoid decimal flicker
    `,
    reducedMotion: 'Show final numbers immediately, no counting animation.',
    cost: 'minimal',
  },
  {
    id: 'horizontal-scroll-section',
    name: 'Horizontal scroll gallery',
    description: 'A section that scrolls horizontally while the user scrolls vertically. Content moves left-to-right as the page scrolls down.',
    technique: 'gsap-scrolltrigger',
    useWhen: 'Project galleries, portfolio showcases, or timeline/process views that benefit from horizontal space.',
    implementation: `
      - Pin the container section
      - Use ScrollTrigger scrub to translate inner content along x-axis
      - Calculate total scroll distance from content width
      - Add snap points for discrete items
      - Ensure keyboard accessibility with arrow key support
    `,
    reducedMotion: 'Show items in a standard vertical stack or carousel with prev/next buttons.',
    cost: 'moderate',
  },
];

/**
 * Format animation recipes for injection into Motion-Brain agent prompts.
 */
export function formatRecipesForPrompt(): string {
  let output = '## Available Animation Techniques (reference, not mandatory)\n\n';
  output += 'You may draw from these techniques but MUST adapt them to the project\'s motion personality. Do not copy verbatim.\n\n';

  for (const recipe of ANIMATION_RECIPES) {
    output += `### ${recipe.name} (${recipe.technique}, cost: ${recipe.cost})\n`;
    output += `${recipe.description}\n`;
    output += `**Use when:** ${recipe.useWhen}\n`;
    output += `**Reduced-motion:** ${recipe.reducedMotion}\n\n`;
  }

  return output;
}
