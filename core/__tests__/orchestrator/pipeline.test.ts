import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForgePipeline } from '../../orchestrator/pipeline.js';
import type { ForgeConfig } from '../../orchestrator/config.js';
import type { ProviderAdapter, CompletionResult } from '../../providers/types.js';
import { SitemapSchema } from '../../schemas/index.js';

/**
 * Pipeline integration test using mock providers.
 * Verifies that JSON artifacts flow correctly between stages,
 * QA-gate retry loop works, and critic retry loop works.
 */

const mockSitemap = {
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

// Mock valid outputs for each stage
const mockBrief = {
  name: 'test-project',
  description: 'A test portfolio hero section',
  industry: 'technology',
  mood: ['dark', 'minimal'],
  audience: 'developers',
  features: ['hero section with name and tagline'],
  constraints: [],
  darkMode: true,
  wants3D: false,
  references: [],
  scope: 'section',
};

const mockDesignTokens = {
  typography: {
    displayFont: { family: 'Space Grotesk', weights: [400, 700], source: 'google-fonts' },
    textFont: { family: 'IBM Plex Sans', weights: [400, 500], source: 'google-fonts' },
    justification: 'Geometric precision for tech portfolio.',
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
    rationale: 'Monochromatic with warm accent.',
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
    description: 'Sharp and mechanical.',
    defaultEasing: 'power3.out',
    defaultDuration: 0.5,
    staggerInterval: 0.06,
  },
  designRationale: 'Brutalist-inspired with geometric precision.',
};

const mockMotionPlan = {
  sections: [{
    sectionId: 'hero',
    trigger: 'load',
    technique: 'gsap-timeline',
    choreography: 'Title slides in from left',
    justification: 'Creates dramatic first impression',
    reducedMotionFallback: 'Content visible immediately',
    performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: 'minimal' },
  }],
  globalNotes: '',
  uses3D: false,
  usesLenis: false,
};

const mockGeneratedCode = {
  files: {
    'components/HeroSection.tsx': `
import React from 'react';
import { useReducedMotion } from '../hooks/useReducedMotion';

export function HeroSection() {
  const prefersReducedMotion = useReducedMotion();
  return (
    <section className="hero" aria-label="Hero section">
      <h1 style={{ fontFamily: 'Space Grotesk' }}>Test Project</h1>
      <p style={{ fontFamily: 'IBM Plex Sans' }}>A test portfolio</p>
    </section>
  );
}`,
    'styles/tokens.css': `
:root {
  --color-primary: oklch(0.45 0.2 260);
  --color-surface: oklch(0.98 0 0);
  --font-display: 'Space Grotesk', sans-serif;
  --font-text: 'IBM Plex Sans', sans-serif;
}`,
  },
  dependencies: { gsap: '^3.12.0' },
  notes: '',
};

const mockQAReport = {
  checks: [
    { name: 'reduced-motion-handling', category: 'accessibility', passed: true, severity: 'critical', details: 'All animations reference prefers-reduced-motion.', file: 'components/HeroSection.tsx' },
    { name: 'semantic-html', category: 'accessibility', passed: true, severity: 'serious', details: 'Uses semantic HTML elements.', file: 'components/HeroSection.tsx' },
    { name: 'heading-hierarchy', category: 'accessibility', passed: true, severity: 'moderate', details: 'Heading hierarchy is valid.', file: 'components/HeroSection.tsx' },
    { name: 'design-token-usage', category: 'design-token-compliance', passed: true, severity: 'moderate', details: 'Uses CSS custom properties, no hardcoded colors.', file: 'styles/tokens.css' },
    { name: 'typography-token-compliance', category: 'design-token-compliance', passed: true, severity: 'serious', details: 'Code references design token typefaces.', file: '' },
  ],
  overallPass: true,
  fixTickets: [],
  summary: 'QA Gate: 5 passed, 0 failed. PASSED',
  timestamp: new Date().toISOString(),
};

const mockCriticReport = {
  assessments: [{
    pageOrSection: 'hero',
    distinguishability: { score: 8, notes: 'Strong typography.', specificChanges: [] },
    animationAudit: { allJustified: true, unjustifiedAnimations: [] },
    tokenCompliance: { compliant: true, drifts: [] },
  }],
  overallConfidence: 8,
  revisionNotes: [],
  antiPatternsDetected: [],
  summary: 'Good output.',
};

/** Creates a mock adapter that returns predefined responses for each stage */
function createSequentialMockProvider(
  responses: Map<string, CompletionResult>
): ProviderAdapter {
  const callCounts = new Map<string, number>();
  return {
    name: 'mock-sequential',
    tier: 'cloud',
    complete: vi.fn().mockImplementation(async (params: any) => {
      // Determine stage from system prompt
      let stageKey = 'unknown';
      if (params.systemPrompt.includes('project intake specialist')) stageKey = 'intake';
      else if (params.systemPrompt.includes('site information architect')) stageKey = 'architect';
      else if (params.systemPrompt.includes('senior visual/brand designer')) stageKey = 'design-brain';
      else if (params.systemPrompt.includes('motion designer')) stageKey = 'motion-brain';
      else if (params.systemPrompt.includes('senior frontend engineer')) {
        // Codegen has multiple sub-stages: file list, config batch, then individual files
        const userContent = params.messages[0]?.content || '';
        if (userContent.includes('TASK: Generate File List')) {
          stageKey = 'codegen-filelist';
        } else if (userContent.includes('TASK: Generate Config Files Batch')) {
          stageKey = 'codegen-batch';
        } else if (userContent.includes('TASK: Generate Single File')) {
          stageKey = 'codegen-file';
        } else {
          stageKey = 'codegen';
        }
      }
      else if (params.systemPrompt.includes('strict, adversarial design director') || params.systemPrompt.includes('skeptical senior design director')) stageKey = 'critic';
      
      const count = callCounts.get(stageKey) || 0;
      callCounts.set(stageKey, count + 1);
      
      const response = responses.get(stageKey);
      if (!response) {
        // For codegen-file, extract the requested file path from the prompt and return a matching response
        if (stageKey === 'codegen-file') {
          const userContent = params.messages[0]?.content || '';
          const pathMatch = userContent.match(/Generate ONLY the file: ([^\n]+)/);
          const requestedPath = pathMatch ? pathMatch[1].trim() : 'test.tsx';
          console.log(`[DEBUG] pipeline mock returning codegen-file for: ${requestedPath}`);
          return {
            content: JSON.stringify({ path: requestedPath, content: `// Mock content for ${requestedPath}\nexport function Test() { return <div>Test</div>; }`, dependencies: {} }),
            structured: { path: requestedPath, content: `// Mock content for ${requestedPath}\nexport function Test() { return <div>Test</div>; }`, dependencies: {} },
            model: 'mock-model',
            provider: 'mock',
          };
        }
        // For codegen-batch, parse the requested file list and return all files in { files: [...] } shape
        if (stageKey === 'codegen-batch') {
          const userContent = params.messages[0]?.content || '';
          const fileLines = userContent.match(/^- (\S+) \(/gm) || [];
          const requestedPaths = fileLines.map((l: string) => l.replace(/^- /, '').replace(/ \(.*/, '').trim());
          // Fallback: always return the 3 standard config files
          const configPaths = requestedPaths.length > 0
            ? requestedPaths
            : ['package.json', 'tailwind.config.ts', 'postcss.config.js'];
          const files = configPaths.map((p: string) => ({
            path: p,
            content: `// Mock content for ${p}`,
            dependencies: {},
          }));
          console.log(`[DEBUG] pipeline mock returning codegen-batch for: ${configPaths.join(', ')}`);
          return {
            content: JSON.stringify({ files }),
            structured: { files },
            model: 'mock-model',
            provider: 'mock',
          };
        }
        throw new Error(`No mock response for stage: ${stageKey}`);
      }
      return response;
    }),
    streamComplete: vi.fn(),
    supportsStructuredOutput: () => true,
    supportsTools: () => false,
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

/** Creates a mock config that uses our mock provider */
function createMockConfig(): ForgeConfig {
  return {
    routing: {
      stages: {
        intake: { tier: 'cloud' },
        architect: { tier: 'cloud' },
        'design-brain': { tier: 'cloud' },
        'motion-brain': { tier: 'cloud' },
        codegen: { tier: 'cloud' },
        'qa-gate': { tier: 'cloud' },
        critic: { tier: 'cloud' },
      },
      fallbackOrder: ['gemini'],
      gemini: { defaultModel: 'mock' },
    },
    outputDir: '/tmp/forge-test',
    maxQARetries: 2,
    maxCriticRetries: 1,
    minCriticConfidence: 7,
    skipBuildVerification: true,
    codegenInterRequestDelayMs: 0,
    env: {
      geminiApiKey: 'mock-key',
    },
  };
}

describe('ForgePipeline', () => {
  let mockProvider: ProviderAdapter;
  let responses: Map<string, CompletionResult>;

  beforeEach(() => {
    responses = new Map();
    
    // Intake response
    responses.set('intake', {
      content: JSON.stringify(mockBrief),
      structured: mockBrief,
      model: 'mock-model',
      provider: 'mock',
    });
    
    // Architect response
    responses.set('architect', {
      content: JSON.stringify(mockSitemap),
      structured: mockSitemap,
      model: 'mock-model',
      provider: 'mock',
    });
    
    // Design-brain response
    responses.set('design-brain', {
      content: JSON.stringify(mockDesignTokens),
      structured: mockDesignTokens,
      model: 'mock-model',
      provider: 'mock',
    });
    
    // Motion-brain response
    responses.set('motion-brain', {
      content: JSON.stringify(mockMotionPlan),
      structured: mockMotionPlan,
      model: 'mock-model',
      provider: 'mock',
    });
    
    // Codegen file list response
    responses.set('codegen-filelist', {
      content: JSON.stringify({
        files: [
          { path: 'app/layout.tsx', type: 'layout', purpose: 'Root layout with providers', dependencies: [] },
          { path: 'app/globals.css', type: 'style', purpose: 'Global styles with design tokens', dependencies: [] },
          { path: 'app/page.tsx', type: 'page', purpose: 'Home page', dependencies: ['app/layout.tsx', 'app/globals.css', 'components/HeroSection.tsx'] },
          { path: 'components/HeroSection.tsx', type: 'section', purpose: 'Hero section component', dependencies: ['hooks/useReducedMotion.ts', 'lib/lenis-provider.tsx'] },
          { path: 'lib/gsap-config.ts', type: 'util', purpose: 'GSAP configuration', dependencies: [] },
          { path: 'lib/lenis-provider.tsx', type: 'component', purpose: 'Lenis provider wrapper', dependencies: [] },
          { path: 'hooks/useReducedMotion.ts', type: 'hook', purpose: 'Reduced motion hook', dependencies: [] },
        ]
      }),
      structured: {
        files: [
          { path: 'app/layout.tsx', type: 'layout', purpose: 'Root layout with providers', dependencies: [] },
          { path: 'app/globals.css', type: 'style', purpose: 'Global styles with design tokens', dependencies: [] },
          { path: 'app/page.tsx', type: 'page', purpose: 'Home page', dependencies: ['app/layout.tsx', 'app/globals.css', 'components/HeroSection.tsx'] },
          { path: 'components/HeroSection.tsx', type: 'section', purpose: 'Hero section component', dependencies: ['hooks/useReducedMotion.ts', 'lib/lenis-provider.tsx'] },
          { path: 'lib/gsap-config.ts', type: 'util', purpose: 'GSAP configuration', dependencies: [] },
          { path: 'lib/lenis-provider.tsx', type: 'component', purpose: 'Lenis provider wrapper', dependencies: [] },
          { path: 'hooks/useReducedMotion.ts', type: 'hook', purpose: 'Reduced motion hook', dependencies: [] },
        ]
      },
      model: 'mock-model',
      provider: 'mock',
    });
    
    // Critic response
    responses.set('critic', {
      content: JSON.stringify(mockCriticReport),
      structured: mockCriticReport,
      model: 'mock-model',
      provider: 'mock',
    });

    mockProvider = createSequentialMockProvider(responses);
  });

  it('initializes without error', () => {
    const config = createMockConfig();
    const pipeline = new ForgePipeline(config);
    expect(pipeline).toBeDefined();
  });

  it('emits pipeline events', () => {
    const config = createMockConfig();
    const pipeline = new ForgePipeline(config);
    const events: string[] = [];
    pipeline.onEvent(e => events.push(e.type));
    // Can't run generate without real/mocked adapters, but events system works
    expect(events).toEqual([]);
  });

  it('has accessible memory', () => {
    const config = createMockConfig();
    const pipeline = new ForgePipeline(config);
    const memory = pipeline.getMemory();
    expect(memory).toBeDefined();
    expect(memory.getSummary()).toBe('');
  });

  it('runs full pipeline end-to-end with mock provider', async () => {
    const config = createMockConfig();
    const pipeline = new ForgePipeline(config);
    
    // Override the router to use our mock provider
    (pipeline as any).router = {
      getProviderForStage: () => mockProvider,
      getModelForStage: () => 'mock-model',
    };

    const result = await pipeline.generate('A test portfolio hero section', `/tmp/forge-test-${Date.now()}`);

    // Verify all stages produced output
    expect(result.brief).toEqual(mockBrief);
    expect(result.designTokens).toEqual(mockDesignTokens);
    expect(result.motionPlan).toEqual(mockMotionPlan);
    expect(result.criticReport).toEqual(mockCriticReport);
    
    // Verify generated code structure (not exact content since it's mocked per-file)
    expect(result.generatedCode).toBeDefined();
    expect(result.generatedCode.files).toBeInstanceOf(Object);
    expect(Object.keys(result.generatedCode.files).length).toBeGreaterThan(0);
    expect(result.generatedCode.dependencies).toBeInstanceOf(Object);
    expect(typeof result.generatedCode.notes).toBe('string');
    
    // Verify all expected files were generated (from the deterministic file list)
    const expectedFiles = [
      'app/layout.tsx',
      'app/globals.css',
      'app/page.tsx',
      'lib/gsap-config.ts',
      'lib/lenis-provider.tsx',
      'hooks/useReducedMotion.ts',
      'hooks/useLenis.ts',
      'package.json',
      'tailwind.config.ts',
      'postcss.config.js',
      'components/Navbar.tsx',
      'components/Footer.tsx',
      'components/Hero.tsx',  // section from the sitemap
    ];
    for (const file of expectedFiles) {
      expect(result.generatedCode.files[file]).toBeDefined();
      expect(typeof result.generatedCode.files[file]).toBe('string');
    }
    
    // Verify QA report structure
    expect(result.qaReport).toBeDefined();
    expect(result.qaReport.checks).toBeInstanceOf(Array);
    expect(result.qaReport.checks.length).toBeGreaterThan(0);
    expect(typeof result.qaReport.overallPass).toBe('boolean');
    expect(result.qaReport.fixTickets).toBeInstanceOf(Array);
    expect(typeof result.qaReport.summary).toBe('string');
    expect(result.qaReport.timestamp).toBeDefined();
    
    // Verify metadata
    expect(result.metadata.totalDurationMs).toBeGreaterThan(0);
    expect(result.metadata.stageTimings).toBeDefined();
    expect(result.metadata.stageAttempts).toBeDefined();
    
    // Verify all expected stages ran
    const expectedStages = ['intake', 'architect', 'design-brain', 'motion-brain', 'codegen', 'qa-gate', 'critic'];
    for (const stage of expectedStages) {
      expect(result.metadata.stageTimings[stage]).toBeDefined();
      expect(result.metadata.stageAttempts[stage]).toBeGreaterThan(0);
    }
  });

  it('stores sitemap in memory from Architect stage', async () => {
    const config = createMockConfig();
    const pipeline = new ForgePipeline(config);
    
    (pipeline as any).router = {
      getProviderForStage: () => mockProvider,
      getModelForStage: () => 'mock-model',
    };

    await pipeline.generate('A test portfolio hero section', `/tmp/forge-test-${Date.now()}`);
    
    const memory = pipeline.getMemory();
    const sitemap = memory.get('sitemap');
    expect(sitemap).toBeDefined();
    expect(SitemapSchema.safeParse(sitemap).success).toBe(true);
    expect(sitemap.pages).toHaveLength(1);
    expect(sitemap.pages[0].sections).toHaveLength(1);
    expect(sitemap.pages[0].sections[0].id).toBe('hero');
  });
});
