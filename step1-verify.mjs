/**
 * STEP 1 verification script:
 * Generates ONLY Hero.tsx and Hero.module.css for the "simple" fixture using Ollama.
 * Hard 5-minute timeout. Checks:
 *   1. CSS variable names in Hero.module.css match globals.css exactly
 *   2. import/export pattern for useReducedMotion matches its real signature (default export)
 */

import { OllamaAdapter } from './core/dist/providers/adapters/ollama.js';
import { CodegenAgent } from './core/dist/agents/codegen/codegen-agent.js';

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes hard limit

// "simple" fixture: minimal single-page site, dark brutalist hero
const SIMPLE_DESIGN_TOKENS = {
  typography: {
    displayFont: { family: 'Libre Baskerville', weights: [400, 700], source: 'google-fonts' },
    textFont: { family: 'Source Sans Pro', weights: [400, 600], source: 'google-fonts' },
    justification: 'Serif display for gravitas, humanist sans for readability — classic brutalist pairing.',
    typeScale: [
      { name: 'xs', minSize: '0.75rem', maxSize: '0.875rem', clampFormula: 'clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)', lineHeight: 1.4 },
      { name: 'sm', minSize: '0.875rem', maxSize: '1rem', clampFormula: 'clamp(0.875rem, 0.82rem + 0.25vw, 1rem)', lineHeight: 1.5 },
      { name: 'base', minSize: '1rem', maxSize: '1.125rem', clampFormula: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)', lineHeight: 1.6 },
      { name: 'lg', minSize: '1.25rem', maxSize: '1.5rem', clampFormula: 'clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem)', lineHeight: 1.4 },
      { name: 'xl', minSize: '1.5rem', maxSize: '2rem', clampFormula: 'clamp(1.5rem, 1.2rem + 1.5vw, 2rem)', lineHeight: 1.2 },
      { name: 'display', minSize: '2.5rem', maxSize: '4rem', clampFormula: 'clamp(2.5rem, 1.5rem + 5vw, 4rem)', lineHeight: 1.1, letterSpacing: '-0.02em' },
    ],
  },
  colors: {
    tokens: [
      { name: 'primary', light: 'oklch(0.3 0.2 260)', dark: 'oklch(0.75 0.15 260)' },
      { name: 'surface', light: 'oklch(0.1 0 0)', dark: 'oklch(0.95 0 0)' },
      { name: 'on-surface', light: 'oklch(0.95 0 0)', dark: 'oklch(0.1 0 0)' },
      { name: 'accent', light: 'oklch(0.65 0.25 140)', dark: 'oklch(0.55 0.25 140)' },
    ],
    rationale: 'Dark neutral surface with high-contrast on-surface — classic brutalist high-contrast palette.',
  },
  spacing: {
    baseUnit: 8,
    scale: [
      { name: 'xs', value: '0.25rem' },
      { name: 'sm', value: '0.5rem' },
      { name: 'md', value: '1rem' },
      { name: 'lg', value: '1.5rem' },
      { name: 'xl', value: '3rem' },
      { name: '2xl', value: '6rem' },
    ],
    gridColumns: 12,
    maxWidth: '80rem',
    gutterWidth: '1.5rem',
  },
  motionPersonality: {
    description: 'Sharp, high-contrast animations — feels mechanical and confident.',
    defaultEasing: 'power2.out',
    defaultDuration: 0.6,
    staggerInterval: 0.08,
  },
  designRationale: 'Dark brutalist aesthetic with high contrast typography, mechanical motion, and minimal decoration.',
};


const SIMPLE_MOTION_PLAN = {
  sections: [
    {
      sectionId: 'hero',
      trigger: 'scroll-enter',
      technique: 'gsap-scrolltrigger',
      choreography: 'h1 fades in from below (y: 40px → 0, opacity: 0 → 1). p fades in 0.1s later with same transform.',
      justification: 'Entrance animation draws attention and establishes energy of the page.',
      reducedMotionFallback: 'instant opacity: 1, no transform — static render of final state.',
      performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: 'minimal' },
      easingOverride: 'power2.out',
      durationOverride: 0.8,
    },
  ],
  globalNotes: 'Use a single shared Lenis instance in app/layout.tsx. All ScrollTrigger instances should use the same context.',
  uses3D: false,
  usesLenis: true,
};

const SIMPLE_SITEMAP = {
  pages: [
    {
      path: '/',
      purpose: 'Landing page — showcases the dark brutalist hero section.',
      sections: [
        { id: 'hero', purpose: 'First impression, introduces the brand boldly.', contentType: 'hero', animationSafe: true },
      ],
      priority: 'high',
    },
  ],
  sharedLayout: { navType: 'fixed-top', footerType: 'minimal', persistentElements: [] },
  routingNotes: '',
};

const SIMPLE_BRIEF = {
  name: 'dark-brutalist-hero',
  description: 'Dark brutalist portfolio hero section',
  mood: ['dark', 'brutalist', 'bold'],
};


// useReducedMotion.ts exports a default function: export default useReducedMotion
// So import MUST be: import useReducedMotion from '../hooks/useReducedMotion'
// NOT: import { useReducedMotion } from '../hooks/useReducedMotion'
const CORRECT_IMPORT = "import useReducedMotion from '../hooks/useReducedMotion'";
const WRONG_IMPORT = "import { useReducedMotion }";

async function main() {
  console.log('=== STEP 1: Hero.tsx + Hero.module.css targeted generation (Ollama, 5-min timeout) ===\n');

  const adapter = new OllamaAdapter('http://localhost:11434', 'qwen2.5-coder:7b');
  const agent = new CodegenAgent(adapter, undefined, { maxConcurrency: 1 });

  const input = {
    designTokens: SIMPLE_DESIGN_TOKENS,
    motionPlan: SIMPLE_MOTION_PLAN,
    sitemap: SIMPLE_SITEMAP,
    brief: SIMPLE_BRIEF,
  };

  const alreadyGenerated = new Map([
    ['hooks/useReducedMotion.ts', `import { useEffect, useState } from 'react';\n\nconst useReducedMotion = () => {\n  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);\n  useEffect(() => {\n    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');\n    const handleChange = (e) => setPrefersReducedMotion(e.matches);\n    setPrefersReducedMotion(mq.matches);\n    mq.addEventListener('change', handleChange);\n    return () => mq.removeEventListener('change', handleChange);\n  }, []);\n  return prefersReducedMotion;\n};\n\nexport default useReducedMotion;\n`],
    ['lib/lenis-provider.tsx', `'use client'\nimport Lenis from 'lenis';\nimport { createContext, useContext, useEffect, useState } from 'react';\nexport const LenisContext = createContext<Lenis | null>(null);\nexport function useLenis() {\n  const lenis = useContext(LenisContext);\n  if (lenis === undefined) throw new Error('useLenis must be used inside LenisProvider');\n  return lenis;\n}\ninterface LenisProviderProps { children: React.ReactNode }\nexport default function LenisProvider({ children }: LenisProviderProps) {\n  const [lenis, setLenis] = useState<Lenis | null>(null);\n  useEffect(() => {\n    const l = new Lenis({ duration: 0.6, damping: 0.15 });\n    setLenis(l);\n    let raf: number;\n    function animate(t: number) { l.raf(t); raf = requestAnimationFrame(animate); }\n    raf = requestAnimationFrame(animate);\n    return () => { l.destroy(); cancelAnimationFrame(raf); };\n  }, []);\n  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;\n}\n`],
    ['lib/gsap-config.ts', `'use client'\nimport { gsap } from 'gsap';\nimport { ScrollTrigger } from 'gsap/ScrollTrigger';\ngsap.registerPlugin(ScrollTrigger);\nexport const defaultEasing = 'power2.out';\nexport const defaultDuration = 0.3;\nexport const staggerInterval = 0.05;\nexport function setupGSAP() {\n  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');\n  if (mq.matches) { gsap.globalTimeline.pause(); }\n}\nexport function GSAPInitializer() { setupGSAP(); return null; }\nexport default GSAPInitializer;\n`],
    ['app/globals.css', `:root {
  --primary-light: oklch(0.3 0.2 260);
  --primary-dark: oklch(0.75 0.15 260);
  --surface-light: oklch(0.1 0 0);
  --surface-dark: oklch(0.95 0 0);
  --on-surface-light: oklch(0.95 0 0);
  --on-surface-dark: oklch(0.1 0 0);
  --accent-light: oklch(0.65 0.25 140);
  --accent-dark: oklch(0.55 0.25 140);
  --base-unit: 8px;
  --xs: 0.25rem;
  --sm: 0.5rem;
  --md: 1rem;
  --lg: 1.5rem;
  --xl: 3rem;
  --2xl: 6rem;
  --grid-columns: 12;
  --max-width: 80rem;
  --gutter-width: 1.5rem;
  --font-display-family: 'Libre Baskerville';
  --font-text-family: 'Source Sans Pro';
  --clamp-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --clamp-sm: clamp(0.875rem, 0.82rem + 0.25vw, 1rem);
  --clamp-base: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --clamp-lg: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --clamp-xl: clamp(1.5rem, 1.2rem + 1.5vw, 2rem);
  --clamp-display: clamp(2.5rem, 1.5rem + 5vw, 4rem);
  --line-height-base: 1.6;
  --line-height-heading: 1.1;
  --default-easing: ease;
  --default-duration: 0.3s;
  --stagger-interval: 0.05s;
}
`],
  ]);

  const heroCssSpec = {
    path: 'components/Hero.module.css',
    type: 'style',
    purpose: 'Hero section CSS module styles',
    dependencies: ['app/globals.css'],
  };

  const heroTsxSpec = {
    path: 'components/Hero.tsx',
    type: 'section',
    purpose: 'Hero section with dark brutalist aesthetic',
    dependencies: ['app/globals.css', 'hooks/useReducedMotion.ts', 'lib/lenis-provider.tsx', 'lib/gsap-config.ts', 'components/Hero.module.css'],
  };

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT: exceeded 5-minute hard limit')), TIMEOUT_MS)
  );

  try {
    // Generate Hero.module.css first (no deps on Hero.tsx)
    console.log('▶ Generating Hero.module.css...');
    const cssResult = await Promise.race([
      agent.generateSingleFile(input, heroCssSpec, alreadyGenerated),
      timeoutPromise,
    ]);
    console.log('\n--- Hero.module.css CONTENT ---');
    console.log(cssResult.content);

    // --- CORRECT CSS VARIABLE CHECK ---
    // The check is: every var(--x) the model uses must exist in globals.css.
    // We do NOT require every globals.css variable to appear in the output —
    // a Hero section only needs a subset.
    console.log('\n--- CSS VARIABLE CHECK ---');
    const GLOBALS_CSS_CONTENT = alreadyGenerated.get('app/globals.css') ?? '';
    // Extract defined vars from globals.css
    const definedVarsInGlobals = new Set(
      [...GLOBALS_CSS_CONTENT.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1])
    );
    // Extract all var(--x) usages in the generated CSS
    const usedVars = [...cssResult.content.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]);
    const uniqueUsedVars = [...new Set(usedVars)];

    let allVarsMatch = true;
    if (uniqueUsedVars.length === 0) {
      console.log('  ⚠️  No var() usages found in output — model may have hardcoded values');
    } else {
      for (const v of uniqueUsedVars) {
        if (definedVarsInGlobals.has(v)) {
          console.log(`  ✅ var(${v}) — exists in globals.css`);
        } else {
          console.log(`  ❌ HALLUCINATED: var(${v}) — NOT in globals.css`);
          allVarsMatch = false;
        }
      }
    }

    // Check :root not used in CSS module
    if (cssResult.content.includes(':root')) {
      console.log('  ❌ VIOLATION: uses :root selector (must not in CSS Modules)');
      allVarsMatch = false;
    } else {
      console.log('  ✅ No :root selector (correct for CSS Modules)');
    }

    alreadyGenerated.set('components/Hero.module.css', cssResult.content);

    // Generate Hero.tsx
    console.log('\n▶ Generating Hero.tsx...');
    const tsxResult = await Promise.race([
      agent.generateSingleFile(input, heroTsxSpec, alreadyGenerated),
      timeoutPromise,
    ]);
    console.log('\n--- Hero.tsx CONTENT ---');
    console.log(tsxResult.content);

    // Check import/export pattern
    console.log('\n--- IMPORT/EXPORT PATTERN CHECK ---');
    if (tsxResult.content.includes(CORRECT_IMPORT)) {
      console.log(`  ✅ Correct default import: ${CORRECT_IMPORT}`);
    } else if (tsxResult.content.includes(WRONG_IMPORT)) {
      console.log(`  ❌ WRONG named import used: ${WRONG_IMPORT}`);
    } else {
      console.log(`  ⚠️  useReducedMotion import not found — check content above`);
    }

    // Check CSS modules import
    if (tsxResult.content.includes("import styles from './Hero.module.css'")) {
      console.log('  ✅ CSS module import present');
    } else {
      console.log("  ❌ Missing CSS module import: import styles from './Hero.module.css'");
    }

    // Summary
    console.log('\n=== STEP 1 SUMMARY ===');
    console.log(allVarsMatch ? '✅ CSS variables: all var() usages are valid globals.css names' : '❌ CSS variables: HALLUCINATED names found (see above)');
    const importOk = tsxResult.content.includes(CORRECT_IMPORT);
    console.log(importOk ? '✅ useReducedMotion: correct default import' : '❌ useReducedMotion: import pattern wrong');
    const cssModuleOk = tsxResult.content.includes("import styles from './Hero.module.css'");
    console.log(cssModuleOk ? '✅ CSS module: import present' : '❌ CSS module: import missing');

    if (allVarsMatch && importOk && cssModuleOk) {
      console.log('\n✅ STEP 1 PASSED — proceed to Step 2');
    } else {
      console.log('\n❌ STEP 1 FAILED — do NOT proceed to Step 2 until fixed');
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ FATAL:', err);
    process.exit(1);
  }
}

main();
