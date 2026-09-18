/**
 * Accessibility rules — WCAG 2.2 AA distilled into
 * codegen-actionable rules for the QA-gate and Codegen agents.
 */

export interface A11yRule {
  id: string;
  category: 'perceivable' | 'operable' | 'understandable' | 'robust';
  name: string;
  requirement: string;
  /** How codegen should implement this */
  implementation: string;
  /** What the QA gate checks for */
  qaCheck: string;
  severity: 'critical' | 'serious' | 'moderate';
}

export const A11Y_RULES: A11yRule[] = [
  {
    id: 'color-contrast',
    category: 'perceivable',
    name: 'Color contrast ratio',
    requirement: 'WCAG 2.2 SC 1.4.3 — normal text ≥ 4.5:1, large text ≥ 3:1 against background.',
    implementation: 'Validate all text/background color token pairs at build time. Use OKLCH lightness calculations to ensure contrast.',
    qaCheck: 'Compute contrast ratio for every text-on-background token combination in design-tokens.json.',
    severity: 'critical',
  },
  {
    id: 'keyboard-navigation',
    category: 'operable',
    name: 'Full keyboard navigability',
    requirement: 'WCAG 2.2 SC 2.1.1 — all functionality available via keyboard. No keyboard traps.',
    implementation: 'Use semantic HTML (button, a, input) for interactive elements. Custom scroll/3D elements must have tabIndex and keyboard handlers (Enter, Space, Arrow keys).',
    qaCheck: 'Verify every interactive element has a keyboard-accessible equivalent. Check for tabIndex on custom controls.',
    severity: 'critical',
  },
  {
    id: 'focus-visible',
    category: 'operable',
    name: 'Visible focus indicators',
    requirement: 'WCAG 2.2 SC 2.4.7 — focus indicator must be visible and styled intentionally.',
    implementation: 'Never set outline: none without a replacement. Style :focus-visible with a visible ring/border using design tokens. Must be at least 2px with 3:1 contrast.',
    qaCheck: 'Check CSS for outline: none/0 without :focus-visible replacement. Verify focus styles exist.',
    severity: 'serious',
  },
  {
    id: 'reduced-motion',
    category: 'operable',
    name: 'Reduced motion preference',
    requirement: 'WCAG 2.2 SC 2.3.3 — honor prefers-reduced-motion for all animations.',
    implementation: 'Every GSAP/CSS animation must check prefers-reduced-motion. Use matchMedia("(prefers-reduced-motion: reduce)"). GSAP animations should be killed or set to their end state.',
    qaCheck: 'Verify every animation file references prefers-reduced-motion. Check for a global reduced-motion handler.',
    severity: 'critical',
  },
  {
    id: 'semantic-html',
    category: 'robust',
    name: 'Semantic HTML structure',
    requirement: 'Use correct HTML5 semantic elements. ARIA only where semantic HTML is insufficient.',
    implementation: 'Use <header>, <nav>, <main>, <section>, <article>, <footer>. Use <h1>-<h6> in correct hierarchy. One <h1> per page. Do not use ARIA roles that duplicate semantic elements.',
    qaCheck: 'Check for single <h1>, heading hierarchy, presence of <main>, proper landmark elements.',
    severity: 'serious',
  },
  {
    id: 'image-alt-text',
    category: 'perceivable',
    name: 'Image alternative text',
    requirement: 'WCAG 2.2 SC 1.1.1 — all non-decorative images must have descriptive alt text.',
    implementation: 'Every <img> and next/image must have alt prop. Decorative images use alt="" and role="presentation". Content images must have meaningful descriptions.',
    qaCheck: 'Check all <img> and Image components have alt attributes. Flag empty alt on non-decorative images.',
    severity: 'critical',
  },
  {
    id: 'canvas-alternative',
    category: 'perceivable',
    name: '3D/Canvas accessible alternative',
    requirement: 'All <canvas> and 3D content must have an accessible text alternative.',
    implementation: 'Wrap R3F <Canvas> with a div that has role="img" and aria-label describing the content. Provide a text fallback for screen readers.',
    qaCheck: 'Check all <canvas>/<Canvas> elements have aria-label or aria-describedby on a wrapper element.',
    severity: 'serious',
  },
  {
    id: 'touch-target-size',
    category: 'operable',
    name: 'Touch target minimum size',
    requirement: 'WCAG 2.2 SC 2.5.8 — interactive targets must be at least 24×24px (AA).',
    implementation: 'Ensure buttons, links, and interactive elements have minimum 44×44px touch targets (best practice) or at minimum 24×24px.',
    qaCheck: 'Check computed styles of interactive elements for minimum dimensions.',
    severity: 'moderate',
  },
  {
    id: 'heading-hierarchy',
    category: 'perceivable',
    name: 'Heading hierarchy',
    requirement: 'WCAG 2.2 SC 1.3.1 — headings must follow a logical, non-skipping hierarchy.',
    implementation: 'Do not skip heading levels (e.g., <h1> → <h3>). Each section should start one level below its parent.',
    qaCheck: 'Parse heading elements and verify no levels are skipped.',
    severity: 'moderate',
  },
  {
    id: 'link-purpose',
    category: 'operable',
    name: 'Link purpose clarity',
    requirement: 'WCAG 2.2 SC 2.4.4 — link text must describe its destination. No "click here" or "read more" without context.',
    implementation: 'Use descriptive link text or aria-label. If using generic text, wrap with visually-hidden context.',
    qaCheck: 'Flag links with generic text ("click here", "read more", "learn more") without aria-label.',
    severity: 'moderate',
  },
];

/**
 * Format a11y rules for injection into Codegen and QA-gate prompts.
 */
export function formatA11yRulesForPrompt(): string {
  let output = '## Accessibility Requirements (WCAG 2.2 AA — Non-negotiable)\n\n';
  output += 'Every rule below is a build gate, not a suggestion. QA-gate WILL reject code that violates these.\n\n';

  for (const rule of A11Y_RULES) {
    const icon = rule.severity === 'critical' ? '🔴' : rule.severity === 'serious' ? '🟠' : '🟡';
    output += `### ${icon} ${rule.name} [${rule.severity}]\n`;
    output += `${rule.requirement}\n`;
    output += `**Implementation:** ${rule.implementation}\n\n`;
  }

  return output;
}
