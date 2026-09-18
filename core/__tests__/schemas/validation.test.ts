import { describe, it, expect } from 'vitest';
import {
  ProjectBriefSchema,
  SitemapSchema,
  DesignTokensSchema,
  MotionPlanSchema,
  QAReportSchema,
  CriticReportSchema,
} from '../../schemas/index.js';

describe('ProjectBriefSchema', () => {
  it('validates a complete brief', () => {
    const brief = {
      name: 'dark-portfolio',
      description: 'A dark, brutalist portfolio site for a photographer',
      industry: 'photography',
      mood: ['dark', 'brutalist', 'editorial'],
      audience: 'Art directors and creative agencies',
      features: ['hero section', 'project gallery', 'about section'],
      constraints: ['No 3D', 'Must load under 2s'],
      darkMode: true,
      wants3D: false,
      references: [],
      scope: 'page' as const,
    };
    const result = ProjectBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });

  it('rejects a brief with empty name', () => {
    const brief = { name: '', description: 'test', industry: 'test', mood: ['test'], audience: 'test', features: [] };
    const result = ProjectBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });

  it('applies default values', () => {
    const brief = {
      name: 'test-project',
      description: 'A test project for validation',
      industry: 'tech',
      mood: ['modern'],
      audience: 'developers',
      features: ['hero'],
    };
    const result = ProjectBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.darkMode).toBe(false);
      expect(result.data.wants3D).toBe(false);
      expect(result.data.scope).toBe('section');
      expect(result.data.constraints).toEqual([]);
    }
  });

  it('rejects empty mood array', () => {
    const brief = {
      name: 'test',
      description: 'A test project with enough characters',
      industry: 'test',
      mood: [],
      audience: 'test',
      features: [],
    };
    const result = ProjectBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });
});

describe('SitemapSchema', () => {
  it('validates a complete sitemap', () => {
    const sitemap = {
      pages: [{
        path: '/',
        purpose: 'Main landing page',
        sections: [{
          id: 'hero',
          purpose: 'First impression and value proposition',
          contentType: 'hero',
          animationSafe: true,
        }],
        priority: 'high',
      }],
      sharedLayout: {
        navType: 'fixed-top',
        footerType: 'minimal',
        persistentElements: [],
      },
      routingNotes: '',
    };
    const result = SitemapSchema.safeParse(sitemap);
    expect(result.success).toBe(true);
  });

  it('rejects a sitemap with no pages', () => {
    const sitemap = {
      pages: [],
      sharedLayout: { navType: 'fixed-top', footerType: 'minimal', persistentElements: [] },
    };
    const result = SitemapSchema.safeParse(sitemap);
    expect(result.success).toBe(false);
  });
});

describe('DesignTokensSchema', () => {
  const validTokens = {
    typography: {
      displayFont: { family: 'Space Grotesk', weights: [400, 700], source: 'google-fonts' },
      textFont: { family: 'Inter', weights: [400, 500], source: 'google-fonts' },
      justification: 'Space Grotesk brings geometric precision matching the tech/brutalist tone.',
      typeScale: [
        { name: 'xs', minSize: '0.75rem', maxSize: '0.875rem', clampFormula: 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)', lineHeight: 1.5 },
        { name: 'sm', minSize: '0.875rem', maxSize: '1rem', clampFormula: 'clamp(0.875rem, 0.825rem + 0.25vw, 1rem)', lineHeight: 1.5 },
        { name: 'base', minSize: '1rem', maxSize: '1.125rem', clampFormula: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)', lineHeight: 1.6 },
        { name: 'lg', minSize: '1.25rem', maxSize: '1.5rem', clampFormula: 'clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)', lineHeight: 1.4 },
        { name: 'xl', minSize: '2rem', maxSize: '3rem', clampFormula: 'clamp(2rem, 1.5rem + 2.5vw, 3rem)', lineHeight: 1.2 },
      ],
    },
    colors: {
      tokens: [
        { name: 'primary', light: 'oklch(0.45 0.2 260)', dark: 'oklch(0.75 0.15 260)' },
        { name: 'surface', light: 'oklch(0.98 0 0)', dark: 'oklch(0.12 0 0)' },
        { name: 'on-surface', light: 'oklch(0.15 0 0)', dark: 'oklch(0.93 0 0)' },
        { name: 'accent', light: 'oklch(0.6 0.25 30)', dark: 'oklch(0.7 0.2 30)' },
      ],
      rationale: 'Monochromatic base with a warm accent for emphasis, reflecting the editorial mood.',
    },
    spacing: {
      baseUnit: 8,
      scale: [
        { name: 'xs', value: '0.25rem' },
        { name: 'sm', value: '0.5rem' },
        { name: 'md', value: '1rem' },
        { name: 'lg', value: '2rem' },
      ],
      gridColumns: 12,
      maxWidth: '80rem',
      gutterWidth: '1.5rem',
    },
    motionPersonality: {
      description: 'Sharp, high-contrast, minimal easing — feels mechanical and confident.',
      defaultEasing: 'power3.out',
      defaultDuration: 0.5,
      staggerInterval: 0.06,
    },
    designRationale: 'A brutalist-inspired system using Space Grotesk for geometric precision.',
  };

  it('validates complete design tokens', () => {
    const result = DesignTokensSchema.safeParse(validTokens);
    expect(result.success).toBe(true);
  });

  it('rejects tokens with fewer than 5 type scale steps', () => {
    const tokens = {
      ...validTokens,
      typography: {
        ...validTokens.typography,
        typeScale: validTokens.typography.typeScale.slice(0, 3),
      },
    };
    const result = DesignTokensSchema.safeParse(tokens);
    expect(result.success).toBe(false);
  });

  it('rejects tokens with fewer than 4 color tokens', () => {
    const tokens = {
      ...validTokens,
      colors: {
        ...validTokens.colors,
        tokens: validTokens.colors.tokens.slice(0, 2),
      },
    };
    const result = DesignTokensSchema.safeParse(tokens);
    expect(result.success).toBe(false);
  });
});

describe('MotionPlanSchema', () => {
  it('validates a motion plan', () => {
    const plan = {
      sections: [{
        sectionId: 'hero',
        trigger: 'load',
        technique: 'gsap-timeline',
        choreography: 'Title slides in from left with clipPath reveal',
        justification: 'Creates a dramatic first impression matching the editorial tone',
        reducedMotionFallback: 'Content immediately visible at final positions',
        performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: 'minimal' },
      }],
      globalNotes: '',
      uses3D: false,
      usesLenis: true,
    };
    const result = MotionPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });
});

describe('QAReportSchema', () => {
  it('validates a QA report', () => {
    const report = {
      checks: [{
        name: 'reduced-motion-handling',
        category: 'accessibility',
        passed: true,
        severity: 'critical',
        details: 'All animations reference prefers-reduced-motion.',
      }],
      overallPass: true,
      fixTickets: [],
      summary: 'All checks passed.',
      timestamp: new Date().toISOString(),
    };
    const result = QAReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });
});

describe('CriticReportSchema', () => {
  it('validates a critic report', () => {
    const report = {
      assessments: [{
        pageOrSection: 'hero',
        distinguishability: {
          score: 8,
          notes: 'Strong typographic hierarchy and unusual layout create distinctiveness.',
          specificChanges: [],
        },
        animationAudit: { allJustified: true, unjustifiedAnimations: [] },
        tokenCompliance: { compliant: true, drifts: [] },
      }],
      overallConfidence: 8,
      revisionNotes: [],
      antiPatternsDetected: [],
      summary: 'Strong output with distinctive design choices.',
    };
    const result = CriticReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  it('rejects confidence score outside 1-10', () => {
    const report = {
      assessments: [{
        pageOrSection: 'hero',
        distinguishability: { score: 5, notes: 'ok', specificChanges: [] },
        animationAudit: { allJustified: true, unjustifiedAnimations: [] },
        tokenCompliance: { compliant: true, drifts: [] },
      }],
      overallConfidence: 15,
      summary: 'test',
    };
    const result = CriticReportSchema.safeParse(report);
    expect(result.success).toBe(false);
  });
});
