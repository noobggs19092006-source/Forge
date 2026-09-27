/**
 * test-critic-isolated.mjs
 * Runs the CriticAgent in isolation using the actual core module
 * to capture the raw model output for diagnosis.
 * 
 * Usage: node test-critic-isolated.mjs
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Import the built dist versions
const { CriticAgent, OllamaAdapter } = await import('./core/dist/index.js');

// Minimal but realistic inputs
const brief = {
  name: 'Simple Portfolio',
  description: 'A minimal portfolio landing page with smooth scroll, hero section, and about section.',
  mood: ['minimal', 'clean', 'modern'],
  industry: 'portfolio',
};

const sitemap = {
  pages: [
    {
      path: '/',
      purpose: 'Home',
      sections: [
        { id: 'hero', purpose: 'Introduce the portfolio owner', contentType: 'hero', animationSafe: true }
      ],
      priority: 'high',
    }
  ],
  sharedLayout: { navType: 'minimal', footerType: 'minimal', persistentElements: [] },
  routingNotes: ''
};

const designTokens = {
  colorPalette: {
    primary: '#0a0a0a',
    secondary: '#1a1a1a',
    accent: '#6366f1',
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#0a0a0a',
    textMuted: '#6b7280',
    border: '#e5e7eb',
    error: '#ef4444',
  },
  typography: {
    displayFont: { family: 'Inter', weights: [700, 900], style: 'sans-serif' },
    textFont: { family: 'Inter', weights: [400, 500], style: 'sans-serif' },
    scale: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem' },
  },
  spacing: { scale: [4, 8, 16, 24, 32, 48, 64, 96], unit: 'px' },
  borderRadius: { sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  shadows: { sm: '0 1px 2px rgba(0,0,0,0.05)', md: '0 4px 6px rgba(0,0,0,0.07)', lg: '0 10px 15px rgba(0,0,0,0.1)' },
  motionPersonality: {
    description: 'Smooth and intentional, minimal transitions that feel premium',
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    durationFast: '150ms',
    durationNormal: '300ms',
    durationSlow: '600ms',
  },
};

const motionPlan = {
  globalScrollBehavior: 'smooth',
  scrollPlugin: 'lenis',
  sections: [
    {
      id: 'hero',
      entrance: { type: 'fade', direction: 'up', stagger: false, duration: 0.8, delay: 0 },
      scrollTrigger: false,
    }
  ],
  globalAnimationRules: ['Respect prefers-reduced-motion', 'No infinite loops on text'],
};

// Small synthetic generated code that's representative
const generatedCode = {
  files: {
    'app/page.tsx': `'use client';
import Hero from '../components/Hero';

export default function HomePage() {
  return (
    <main>
      <Hero />
    </main>
  );
}`,
    'components/Hero.tsx': `'use client';
import React, { useRef, useEffect } from 'react';
import styles from './Hero.module.css';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { setupGSAP } from '../lib/gsap-config';

const Hero: React.FC = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (prefersReduced || !heroRef.current) return;
    const { gsap } = setupGSAP();
    gsap.fromTo(heroRef.current, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8 });
  }, [prefersReduced]);

  return (
    <section ref={heroRef} className={styles.hero} id="hero" aria-label="Hero section">
      <h1 className={styles.title}>Portfolio</h1>
      <p className={styles.subtitle}>Minimal, clean, modern.</p>
    </section>
  );
};

export default Hero;`,
    'components/Navbar.tsx': `'use client';
import React from 'react';
import styles from './Navbar.module.css';

const Navbar: React.FC = () => {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <span className={styles.logo}>Portfolio</span>
    </nav>
  );
};

export default Navbar;`,
    'components/Footer.tsx': `'use client';
import React from 'react';
import styles from './Footer.module.css';

const Footer: React.FC = () => {
  return (
    <footer className={styles.footer}>
      <p>&copy; 2024 Portfolio. All rights reserved.</p>
    </footer>
  );
};

export default Footer;`,
    'app/layout.tsx': `import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Simple Portfolio',
  description: 'A minimal portfolio landing page',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}`,
    'app/globals.css': `:root {
  --color-primary: #0a0a0a;
  --color-accent: #6366f1;
  --color-background: #ffffff;
  --font-display: 'Inter', sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font-display); background: var(--color-background); color: var(--color-primary); }`,
    'components/Hero.module.css': `.hero { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0 2rem; }
.title { font-size: 4rem; font-weight: 900; letter-spacing: -0.05em; }
.subtitle { font-size: 1.125rem; color: #6b7280; margin-top: 1rem; }`,
    'components/Navbar.module.css': `.nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; display: flex; align-items: center; padding: 1.5rem 2rem; backdrop-filter: blur(8px); }
.logo { font-weight: 700; font-size: 1.125rem; }`,
    'components/Footer.module.css': `.footer { padding: 2rem; text-align: center; font-size: 0.875rem; color: #6b7280; border-top: 1px solid #e5e7eb; }`,
  },
  dependencies: {
    'gsap': '^3.12.0',
    'lenis': '^1.0.0',
  },
  notes: '',
};

console.log('\n=== CRITIC ISOLATION TEST ===');
console.log('Creating OllamaAdapter...');

const provider = new OllamaAdapter('http://localhost:11434', 'qwen2.5-coder:7b');
const critic = new CriticAgent(provider, undefined);

// Monkey-patch to capture raw output
const originalComplete = provider.complete.bind(provider);
let capturedRaw = null;
let capturedUsage = null;

provider.complete = async (params) => {
  const result = await originalComplete(params);
  capturedRaw = result.content;
  capturedUsage = result.usage;
  return result;
};

console.log('Running CriticAgent.execute()...');
console.log('(May take 1-2 minutes)\n');

try {
  const result = await critic.execute({
    brief,
    designTokens,
    motionPlan,
    sitemap,
    generatedCode,
  });

  console.log('\n=== CRITIC SUCCEEDED ===');
  console.log('Output:', JSON.stringify(result.output, null, 2));
  console.log(`Attempts: ${result.attempts}`);
} catch (err) {
  console.log('\n=== CRITIC FAILED ===');
  console.log('Error:', err.message);
}

console.log('\n=== RAW MODEL OUTPUT ===');
console.log(capturedRaw ?? '(not captured)');

if (capturedUsage) {
  console.log('\n=== TOKEN USAGE ===');
  console.log(`Input tokens:  ${capturedUsage.inputTokens}`);
  console.log(`Output tokens: ${capturedUsage.outputTokens}`);
  const truncated = capturedUsage.outputTokens >= 3900;
  if (truncated) {
    console.log('⚠️  TRUNCATED: output hit num_predict limit!');
  }
}

// Try to parse the raw output
if (capturedRaw) {
  try {
    const parsed = JSON.parse(capturedRaw);
    console.log('\n=== PARSED JSON TOP-LEVEL KEYS ===');
    console.log(Object.keys(parsed));
    console.log('\n=== SCHEMA FIELD CHECK ===');
    console.log(`  assessments:          ${parsed.assessments !== undefined ? '✓ present' : '✗ MISSING'}`);
    console.log(`  overallConfidence:    ${parsed.overallConfidence !== undefined ? '✓ present' : '✗ MISSING'}`);
    console.log(`  summary:              ${parsed.summary !== undefined ? '✓ present' : '✗ MISSING'}`);
    console.log(`  revisionNotes:        ${parsed.revisionNotes !== undefined ? '✓ present' : '✗ MISSING'}`);
    console.log(`  antiPatternsDetected: ${parsed.antiPatternsDetected !== undefined ? '✓ present' : '✗ MISSING'}`);
  } catch (e) {
    console.log('\n=== RAW IS NOT VALID JSON ===');
    console.log(`Parse error: ${e.message}`);
  }
}
