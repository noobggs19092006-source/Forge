import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OllamaAdapter } from './core/dist/providers/adapters/ollama.js';
import { CodegenAgent } from './core/dist/agents/codegen/codegen-agent.js';

const testInput = {
  designTokens: {
    typography: {
      displayFont: { family: 'Libre Baskerville', weights: [400, 700], source: 'google-fonts' },
      textFont: { family: 'Source Sans Pro', weights: [400, 500], source: 'google-fonts' },
      justification: 'Test',
      typeScale: [
        { name: 'base', minSize: '1rem', maxSize: '1.125rem', clampFormula: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)', lineHeight: 1.6 },
      ]
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
      gutterWidth: '1.5rem'
    },
    motionPersonality: {
      description: 'Simple',
      defaultEasing: 'ease',
      defaultDuration: 0.3,
      staggerInterval: 0.05,
    },
    designRationale: 'Minimal',
  },
  motionPlan: {
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
  },
  sitemap: {
    pages: [{
      path: '/',
      purpose: 'Landing page',
      sections: [{ id: 'hero', purpose: 'Hero', contentType: 'hero', animationSafe: true }],
      priority: 'high',
    }],
    sharedLayout: { navType: 'none', footerType: 'none', persistentElements: [] },
    routingNotes: '',
  },
  brief: { name: 'test-project', description: 'Test', mood: ['minimal'] },
};

const outputDir = 'A:\\\\Forge\\\\generated\\\\test-ollama-full-' + Date.now();
mkdirSync(outputDir, { recursive: true });
console.log('Output dir:', outputDir);

const adapter = new OllamaAdapter('http://localhost:11434', 'qwen2.5-coder:7b');
const agent = new CodegenAgent(adapter, 'qwen2.5-coder:7b', {
  interRequestDelayMs: 1000,
  maxRetryPasses: 1,
  checkpointDir: outputDir,
});

agent.onFileGenerated((path, content) => {
  console.log('fileCallback called with path:', path);
  const fullPath = resolve(outputDir, path);
  console.log('Full path:', fullPath);
  const dirPath = resolve(fullPath, '..');
  console.log('Dir path:', dirPath);
  mkdirSync(dirPath, { recursive: true });
  writeFileSync(fullPath, content);
  console.log('Written:', path);
});

const startTime = Date.now();
try {
  const result = await agent.execute(testInput);
  const duration = Date.now() - startTime;
  console.log('Result:', result);
  console.log('Files:', Object.keys(result.output.files).length);
  console.log('Duration:', duration, 'ms');
  
  if (result.output) {
    let syntaxErrors = 0;
    for (const [path, content] of Object.entries(result.output.files)) {
      console.log('Generated:', path);
      if (path.endsWith('.ts') || path.endsWith('.tsx')) {
        try {
          require('typescript').transpileModule(content, {
            compilerOptions: { target: 99, module: 99, moduleResolution: 2, jsx: 4, strict: false, skipLibCheck: true }
          });
        } catch {
          syntaxErrors++;
          console.log('  SYNTAX ERROR in', path);
        }
      }
    }
    console.log('Syntax errors:', syntaxErrors);
    
    if (result.output.files['components/Hero.tsx']) {
      console.log('\n=== Hero.tsx ===');
      console.log(result.output.files['components/Hero.tsx'].substring(0, 800));
    }
    
    if (result.output.files['components/Hero.module.css']) {
      console.log('\n=== Hero.module.css ===');
      console.log(result.output.files['components/Hero.module.css'].substring(0, 500));
    }
  }
} catch (error) {
  console.log('ERROR:', error.message);
  console.log(error.stack);
}