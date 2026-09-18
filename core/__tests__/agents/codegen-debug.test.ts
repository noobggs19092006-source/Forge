import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodegenAgent } from '../../agents/codegen/codegen-agent.js';
import type { GeneratedCode } from '../../agents/codegen/codegen-agent.js';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Minimal test: can CodegenAgent.execute() succeed with a mock provider
 * and the new checkpoint system?
 */

function createMockProvider() {
  return {
    name: 'mock',
    tier: 'cloud' as const,
    complete: vi.fn().mockImplementation(async (params: any) => {
      const userContent = params.messages[0]?.content || '';

      // Config batch: return { files: [...] } wrapper
      if (userContent.includes('TASK: Generate Config Files Batch')) {
        const fileLines = userContent.match(/^- (\S+) \(/gm) || [];
        const requestedPaths = fileLines.map((l: string) => l.replace(/^- /, '').replace(/ \(.*/, '').trim());
        const configPaths = requestedPaths.length > 0
          ? requestedPaths
          : ['package.json', 'tailwind.config.ts', 'postcss.config.js'];
        const files = configPaths.map((p: string) => ({
          path: p,
          content: `// Mock content for ${p}`,
          dependencies: {},
        }));
        console.log(`Mock provider called for config batch: ${configPaths.join(', ')}`);
        return {
          content: JSON.stringify({ files }),
          structured: { files },
          model: 'mock-model',
          provider: 'mock',
        };
      }

      const pathMatch = userContent.match(/Generate ONLY the file: ([^\n]+)/);
      const requestedPath = pathMatch ? pathMatch[1].trim() : 'unknown.ts';
      
      console.log(`Mock provider called for: ${requestedPath}`);
      
      return {
        content: JSON.stringify({
          path: requestedPath,
          content: `// Mock content for ${requestedPath}\nexport default function Test() { return null; }`,
          dependencies: {},
        }),
        structured: {
          path: requestedPath,
          content: `// Mock content for ${requestedPath}\nexport default function Test() { return null; }`,
          dependencies: {},
        },
        model: 'mock-model',
        provider: 'mock',
      };
    }),
    streamComplete: vi.fn(),
    supportsStructuredOutput: () => true,
    supportsTools: () => false,
    isAvailable: vi.fn().mockResolvedValue(true),
  };
}

const minimalSitemap = {
  pages: [{
    path: '/',
    purpose: 'Landing page',
    sections: [{ id: 'hero', purpose: 'Hero', contentType: 'hero', animationSafe: true }],
    priority: 'high',
  }],
  sharedLayout: { navType: 'fixed-top', footerType: 'minimal', persistentElements: [] },
  routingNotes: '',
};

const minimalDesignTokens = {
  typography: {
    displayFont: { family: 'Inter', weights: [400, 700], source: 'google-fonts' },
    textFont: { family: 'Inter', weights: [400], source: 'google-fonts' },
    justification: 'Clean',
    typeScale: [
      { name: 'base', minSize: '1rem', maxSize: '1.125rem', clampFormula: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)', lineHeight: 1.6 },
    ],
  },
  colors: {
    tokens: [
      { name: 'primary', light: '#000', dark: '#fff' },
    ],
    rationale: 'Simple',
  },
  spacing: {
    baseUnit: 8,
    scale: [{ name: 'md', value: '1rem' }],
    gridColumns: 12,
    maxWidth: '80rem',
    gutterWidth: '1.5rem',
  },
  motionPersonality: {
    description: 'Simple',
    defaultEasing: 'ease',
    defaultDuration: 0.3,
    staggerInterval: 0.05,
  },
  designRationale: 'Minimal',
};

const minimalMotionPlan = {
  sections: [{
    sectionId: 'hero',
    trigger: 'load',
    technique: 'gsap-timeline',
    choreography: 'Fade in',
    justification: 'Simple',
    reducedMotionFallback: 'Visible',
    performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: 'minimal' },
  }],
  globalNotes: '',
  uses3D: false,
  usesLenis: false,
};

describe('CodegenAgent execute with checkpoint', () => {
  let testDir: string;
  let checkpointDir: string;

  beforeEach(() => {
    // Create a unique temp directory for each test run to avoid checkpoint collision
    testDir = resolve(tmpdir(), `forge-codegen-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    checkpointDir = resolve(testDir, 'output');
    mkdirSync(checkpointDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it('generates files with mock provider', async () => {
    const mockProvider = createMockProvider();
    const agent = new CodegenAgent(mockProvider, 'mock-model', {
      interRequestDelayMs: 0,
      maxRetryPasses: 1,
      checkpointDir,
    });

    const result = await agent.execute({
      designTokens: minimalDesignTokens as any,
      motionPlan: minimalMotionPlan as any,
      sitemap: minimalSitemap as any,
      brief: { name: 'test-project', description: 'Test', mood: ['minimal'] },
    });

    console.log('Result files:', Object.keys(result.output.files));
    console.log('Result notes:', result.output.notes);
    console.log('File count:', Object.keys(result.output.files).length);

    expect(Object.keys(result.output.files).length).toBeGreaterThan(0);
  });
});
