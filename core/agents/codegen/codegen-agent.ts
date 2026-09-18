import { z } from 'zod';
import { BaseAgent } from '../base-agent.js';
import type { AgentResult } from '../base-agent.js';
import { DesignTokensSchema, MotionPlanSchema, SitemapSchema } from '../../schemas/index.js';
import type { DesignTokens, MotionPlan, Sitemap } from '../../schemas/index.js';
import { formatA11yRulesForPrompt } from '../../knowledge/a11y-rules.js';
import { CodegenCheckpoint } from './codegen-checkpoint.js';
import type { PassResult } from './codegen-checkpoint.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * CodegenAgent -- senior frontend engineer.
 * Generates production React/Next.js code from locked design tokens and motion plan.
 * Uses chunked per-file generation to avoid output token limits.
 * 
 * Checkpoint-and-isolate strategy:
 * - Each file's success/failure is tracked in a persistent checkpoint manifest
 * - Individual file failures do NOT abort the entire stage
 * - Failed/blocked files are retried in subsequent passes
 * - Resuming a killed process skips already-successful files
 */

const FileSpecSchema = z.object({
  path: z.string().describe('Relative file path (e.g., "app/layout.tsx", "components/Hero.tsx")'),
  type: z.enum(['layout', 'page', 'section', 'component', 'hook', 'util', 'style', 'config']).describe('File type category'),
  purpose: z.string().describe('What this file does in the project'),
  dependencies: z.array(z.string()).default([]).describe('Other generated files this file imports/depends on'),
});

type FileSpec = z.infer<typeof FileSpecSchema>;

const SingleFileOutputSchema = z.object({
  path: z.string().describe('Relative file path'),
  content: z.string().describe('Complete file content'),
  dependencies: z.record(z.string(), z.string()).default({}).describe('npm packages needed (name -> version)'),
}).strict();

type SingleFileOutput = z.infer<typeof SingleFileOutputSchema>;

const GeneratedCodeSchema = z.object({
  files: z.record(z.string(), z.string()).describe('Map of relative file path to file content'),
  dependencies: z.record(z.string(), z.string()).default({}).describe('npm packages needed (name -> version)'),
  notes: z.string().default('').describe('Any implementation notes for the developer'),
});

export type GeneratedCode = z.infer<typeof GeneratedCodeSchema>;

const CodegenInputSchema = z.object({
  designTokens: DesignTokensSchema,
  motionPlan: MotionPlanSchema,
  sitemap: SitemapSchema,
  brief: z.object({
    name: z.string(),
    description: z.string(),
    mood: z.array(z.string()),
  }),
  fixTickets: z.array(z.object({
    file: z.string(),
    issue: z.string(),
    requiredChange: z.string(),
  })).optional(),
  revisionNotes: z.array(z.string()).optional(),
  /** Optional: specific pages to generate (paths like '/', '/features', etc.) */
  pagesToGenerate: z.array(z.string()).optional(),
});

type CodegenInput = z.infer<typeof CodegenInputSchema>;

export class CodegenAgent extends BaseAgent<CodegenInput, GeneratedCode> {
  readonly agentName = 'Codegen';
  readonly inputSchema = CodegenInputSchema;
  readonly outputSchema = GeneratedCodeSchema;
  protected override maxRetries = 3;

  /** Delay between parallel level waves (ms) -- 0 for Groq/Cerebras, set higher for NIM */
  private interRequestDelayMs: number;

  /** Maximum number of retry passes (total, including the first) */
  private maxRetryPasses: number;

  /**
   * Maximum concurrent in-flight LLM requests within a parallel level.
   * Default 3 = safe for Groq 30 RPM free tier (3 x ~5s avg response ~= 36/min).
   */
  private maxConcurrency: number;

  /** Directory for checkpoint persistence (e.g. the project output dir) */
  private checkpointDir?: string;

  /** Callback invoked after each file is successfully generated, for immediate disk persistence */
  private fileCallback?: (path: string, content: string) => void;

  constructor(provider: any, modelOverride?: string, options?: {
    interRequestDelayMs?: number;
    maxRetryPasses?: number;
    maxConcurrency?: number;
    checkpointDir?: string;
  }) {
    super(provider, modelOverride);
    this.interRequestDelayMs = options?.interRequestDelayMs ?? 0;
    this.maxRetryPasses = options?.maxRetryPasses ?? 2;
    this.maxConcurrency = options?.maxConcurrency ?? 3;
    this.checkpointDir = options?.checkpointDir;
  }

  /** Set a callback that fires after each individual file is generated */
  onFileGenerated(callback: (path: string, content: string) => void): void {
    this.fileCallback = callback;
  }

  readonly systemPrompt = `You are a senior frontend engineer generating production React/Next.js (App Router, TypeScript strict mode) code. You consume design-tokens, a motion-plan, and a full sitemap as HARD CONSTRAINTS -- you do NOT make new design or motion decisions, you implement the ones already made.

CODE REQUIREMENTS:
1. React 19 + Next.js 15 (App router). Use 'use client' where hooks or interactivity are needed.
2. Styling: Use vanilla CSS modules or Tailwind. Keep it extremely high-end.
3. Motion: Implement the motion plan precisely using GSAP or Framer Motion.
4. Output cleanly separated components. Do not dump everything in one file.

NON-NEGOTIABLE TECHNICAL REQUIREMENTS (build gates):

1. CLS = 0:
   - Every element that loads async content (images, fonts, embeds) must reserve exact space via explicit aspect-ratio/width/height BEFORE content loads
   - Web fonts must use font-display: optional or swap with size-adjust matched fallback

2. INP < 200ms:
   - No synchronous heavy work on main thread during interaction handlers
   - Debounce/throttle scroll listeners
   - Use CSS transforms/opacity (compositor-only) for animation

3. FLUID SCALING:
   - Use clamp()-based type/spacing from the design tokens

4. CODE QUALITY:
   - TypeScript strict mode -- no any, no type assertions unless absolutely necessary
   - React components must be functional with proper typing
   - Extract animation logic into separate files/hooks

5. DESIGN TOKEN & MOTION COMPLIANCE:
   - Generate CSS custom properties from the design tokens exactly as defined.
   - Follow the motion plan's technique and choreography exactly.

6. SINGLE LENIS/SCROLLTRIGGER INSTANCE:
   - Create ONE LenisProvider in app/layout.tsx that wraps all pages
   - All section components must consume the shared Lenis instance via context
   - All ScrollTrigger instances must register with a single shared context
   - Do NOT create multiple Lenis instances or ScrollTrigger contexts

${formatA11yRulesForPrompt()}

PACKAGE.JSON DEPENDENCY VERSION CONSTRAINTS (MANDATORY - these are tested working combinations):
- next: "15.0.0" (stable, not RC)
- react: "18.3.1" (stable)
- react-dom: "18.3.1" (stable)
- gsap: "^3.12.7"
- lenis: "^1.1.15" (use the current 'lenis' package - NOT @studio-freight/lenis which is deprecated)
- tailwindcss: "^3.4.10"
- autoprefixer: "^10.4.20"
- postcss: "^8.4.47"
- postcss-preset-env: "^10.1.0"
- postcss-nested: "^6.0.0"
- postcss-import: "^16.1.0"
- TypeScript: "^5.6.0"
- eslint: "^9.10.0"
- eslint-config-next: "15.0.0"
- @types/react: "^18.3.0"
- @types/react-dom: "^18.3.0"
- @types/node: "^22.7.0"

Output MUST be a JSON object mapping file paths to their content, along with any dependencies.`;

  protected override formatInput(input: CodegenInput): string {
    const MAX_STRING_LENGTH = 50000;
    const truncate = (str: string): string => 
      str.length > MAX_STRING_LENGTH ? str.slice(0, MAX_STRING_LENGTH) + '... [truncated]' : str;

    let prompt = `## Project: ${input.brief.name}
${input.brief.description}
Mood: ${input.brief.mood.join(', ')}

## Sitemap
${JSON.stringify(input.sitemap, null, 2)}

## Design Tokens
${JSON.stringify(input.designTokens, null, 2)}

## Motion Plan
${JSON.stringify(input.motionPlan, null, 2)}`;

    if (input.fixTickets && input.fixTickets.length > 0) {
      prompt += '\n\n## FIX TICKETS (must address ALL)\n';
      for (const ticket of input.fixTickets) {
        prompt += `- **${truncate(ticket.file)}**: ${truncate(ticket.issue)}\n  Required change: ${truncate(ticket.requiredChange)}\n`;
      }
    }

    if (input.revisionNotes && input.revisionNotes.length > 0) {
      prompt += '\n\n## CRITIC REVISION NOTES (must address ALL)\n';
      for (const note of input.revisionNotes) {
        prompt += `- ${truncate(note)}\n`;
      }
    }

    return prompt;
  }

  /**
   * Generate the complete file list for the project based on the sitemap.
   * This is now DETERMINISTIC - derived from the sitemap structure, not LLM-generated.
   * Avoids the output token limit that plagued the previous LLM-based approach.
   * Supports filtering by pagesToGenerate for per-page retries.
   */
  generateFileList(input: CodegenInput): FileSpec[] {
    const { sitemap, pagesToGenerate: inputPagesToGenerate } = input;
    const files: FileSpec[] = [];

    // Determine which pages to generate
    const pagesToGenerate = inputPagesToGenerate || sitemap.pages.map(p => p.path);
    const targetPages = sitemap.pages.filter(p => pagesToGenerate.includes(p.path));

    // Core files (always needed)
    files.push(
      { path: 'app/layout.tsx', type: 'layout', purpose: 'Root layout with LenisProvider, font loading, global styles', dependencies: [] },
      { path: 'app/globals.css', type: 'style', purpose: 'CSS custom properties from design tokens', dependencies: [] },
      { path: 'lib/gsap-config.ts', type: 'util', purpose: 'GSAP configuration, ScrollTrigger setup', dependencies: [] },
      { path: 'lib/lenis-provider.tsx', type: 'component', purpose: 'LenisProvider component for smooth scroll (MUST be a client component with "use client" directive since it uses React hooks: createContext, useContext, useEffect, useState)', dependencies: [] },
      { path: 'hooks/useReducedMotion.ts', type: 'hook', purpose: 'prefers-reduced-motion hook', dependencies: [] },
      { path: 'hooks/useLenis.ts', type: 'hook', purpose: 'Hook to access shared Lenis instance', dependencies: ['lib/lenis-provider.tsx'] },
      { path: 'package.json', type: 'config', purpose: 'Project dependencies and scripts', dependencies: [] },
      { path: 'next.config.js', type: 'config', purpose: 'Next.js configuration with Turbopack disabled for monorepo compatibility', dependencies: [] },
      { path: 'tsconfig.json', type: 'config', purpose: 'TypeScript configuration with path aliases', dependencies: [] },
    );

    // Tailwind config (if using Tailwind - detect from brief/tokens or always include)
    files.push(
      { path: 'tailwind.config.ts', type: 'config', purpose: 'Tailwind CSS configuration with design tokens', dependencies: [] },
      { path: 'postcss.config.js', type: 'config', purpose: 'PostCSS configuration', dependencies: [] },
    );

    // Navbar and Footer (if shared layout specifies them)
    const navType = sitemap.sharedLayout?.navType ?? 'fixed-top';
    const footerType = sitemap.sharedLayout?.footerType ?? 'full';

    if (navType !== 'none') {
      files.push({
        path: 'components/Navbar.tsx',
        type: 'component',
        purpose: 'Navigation component with active route highlighting',
        dependencies: ['hooks/useLenis.ts'],
      });
    }

    if (footerType !== 'none') {
      files.push({
        path: 'components/Footer.tsx',
        type: 'component',
        purpose: 'Site footer component',
        dependencies: ['components/Footer.module.css'],
      });
      files.push({
        path: 'components/Footer.module.css',
        type: 'style',
        purpose: 'Footer CSS module styles',
        dependencies: [],
      });
    }

    // Page files for each target page in sitemap
    for (const page of targetPages) {
      const pagePath = page.path === '/' ? 'app/page.tsx' : `app${page.path}/page.tsx`;
      const pageDeps: string[] = ['app/layout.tsx', 'app/globals.css'];
      
      // Only add Navbar/Footer if sitemap specifies them
      const sharedLayout = input.sitemap.sharedLayout;
      if (sharedLayout.navType !== 'none') {
        pageDeps.push('components/Navbar.tsx');
      }
      if (sharedLayout.footerType !== 'none') {
        pageDeps.push('components/Footer.tsx');
      }
      
      files.push({
        path: pagePath,
        type: 'page',
        purpose: page.purpose,
        dependencies: pageDeps,
      });
    }

    // Section components for each unique section type across target pages
    const uniqueSections = new Map<string, { contentType: string; purpose: string }>();
    for (const page of targetPages) {
      for (const section of page.sections) {
        // Normalize section ID to a component name
        const componentName = section.id
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');
        const componentPath = `components/${componentName}.tsx`;
        
        if (!uniqueSections.has(componentPath)) {
          uniqueSections.set(componentPath, {
            contentType: section.contentType,
            purpose: section.purpose,
          });
        }
      }
    }

    for (const [componentPath, info] of uniqueSections) {
      const componentName = componentPath.replace('components/', '').replace('.tsx', '');
      const cssModulePath = `components/${componentName}.module.css`;

      files.push({
        path: componentPath,
        type: 'section',
        purpose: info.purpose,
        dependencies: [
          'app/globals.css',
          'hooks/useReducedMotion.ts',
          'lib/lenis-provider.tsx',
          'lib/gsap-config.ts',
          cssModulePath,
        ],
      });

      files.push({
        path: cssModulePath,
        type: 'style',
        purpose: `${componentName} section CSS module styles`,
        dependencies: [],
      });
    }

    return files;
  }

  /**
   * Generate a single file with full context
   */
  async generateSingleFile(input: CodegenInput, fileSpec: FileSpec, alreadyGenerated: Map<string, string>): Promise<SingleFileOutput> {
    let dependencyContext = '';
    if (fileSpec.dependencies.length > 0) {
      dependencyContext = '\n\n## ALREADY GENERATED DEPENDENCIES\n';
      for (const depPath of fileSpec.dependencies) {
        const depContent = alreadyGenerated.get(depPath);
if (depContent) {
        dependencyContext += `\n### File: ${depPath}\n` + '```typescript\n' + depContent + '\n```\n';
      }
      }
    }

    const singleFilePrompt = this.formatInput(input) + dependencyContext + `

## TASK: Generate Single File
Generate ONLY the file: ${fileSpec.path}
Type: ${fileSpec.type}
Purpose: ${fileSpec.purpose}

Requirements for this specific file:
- Follow the design tokens, motion plan, and sitemap EXACTLY
- Import from already-generated dependencies where applicable
- Output complete, runnable code -- no placeholders, no TODOs
  - NEVER append CSS or unrelated file contents to a .tsx file. Output ONLY the code for the requested file.
  - NEVER import framer-motion. The project uses GSAP exclusively for all animations.
  - CSS Modules Bracket Notation: You MUST use bracket notation for any class name containing a hyphen (kebab-case). Dot notation is mathematically invalid in TypeScript and will cause build failures.
    - INCORRECT: <div className={styles.hero-section} />
    - CORRECT:   <div className={styles['hero-section']} />
- Include all necessary imports
- Use the shared LenisProvider and GSAP config from lib/lenis-provider.tsx and lib/gsap-config.ts
- For section components: implement the exact choreography from the motion plan for that section ID

${fileSpec.path === 'package.json' ? `
SPECIFIC PACKAGE.JSON REQUIREMENTS:
- Use EXACT versions from the system prompt's MANDATORY dependency list
- next: "15.0.0"
- react: "18.3.1"
- react-dom: "18.3.1"  
- gsap: "^3.12.7"
- lenis: "^1.1.15" (use the current 'lenis' package - NOT @studio-freight/lenis which is deprecated)
- tailwindcss: "^3.4.10"
- autoprefixer: "^10.4.20"
- postcss: "^8.4.47"
- postcss-preset-env: "^10.1.0"
- postcss-import: "^16.1.0"
- typescript: "^5.6.0"
- eslint: "^9.10.0"
- eslint-config-next: "15.0.0"
- @types/react: "^18.3.0"
- @types/react-dom: "^18.3.0"
- @types/node: "^22.7.0"
- Include scripts: dev, build, start, lint
- Set "private": true
` : ''}

${fileSpec.path === 'next.config.js' ? `
SPECIFIC NEXT.CONFIG.JS REQUIREMENTS:
- Do NOT use experimental.turbo key (invalid in Next.js 16+)
- Use standard CommonJS module.exports format (NOT ES modules, NO import/export)
- Do NOT use TypeScript
- For monorepo compatibility, set outputFileTracingRoot to the project root
- To disable Turbopack and use webpack, omit experimental.turbo entirely (webpack is default)
- Output a minimal valid config: module.exports = { outputFileTracingRoot: __dirname }
- Do NOT use path aliases like @/lib -- this is a CommonJS file, aliases only work in TypeScript/ES modules
- Do NOT include any import statements
- The content MUST be valid JavaScript with actual newlines (NOT escaped \\n in the output file)
` : ''}

${fileSpec.path === 'app/layout.tsx' ? `
SPECIFIC APP/LAYOUT.TSX REQUIREMENTS:
- CRITICAL: DO NOT OUTPUT RAW HTML. YOU MUST OUTPUT A TYPESCRIPT REACT MODULE. YOU MUST INCLUDE IMPORTS. YOU MUST EXPORT THE ROOTLAYOUT COMPONENT.
- YOU MUST INCLUDE: import './globals.css';
- Import global CSS as: import './globals.css' (NOT ../globals.css, NOT ../styles/globals.css - it is in the SAME directory)
- Import LenisProvider from '../lib/lenis-provider' (relative path from app/ to lib/)
- MUST NOT use 'use client' directive (this is a Server Component)
- NEVER use styled-jsx (e.g. <style jsx>). It is strictly forbidden in Server Components. If you need global styles, rely on the import of './globals.css'.
- Wrap children with LenisProvider (MUST be inside the <body> tag, do NOT wrap the <html> tag with LenisProvider)
- Set data-theme="dark" on html element for dark mode
- Use font-display: optional for Google Fonts (CLS = 0)
- TYPE the children prop: children: React.ReactNode (NOT implicit any)
  - DO NOT import any non-existent hooks or utilities like 'use-client-effect'. Only import what is strictly required.
  - MUST export default function RootLayout({ children }: { children: React.ReactNode })
  - MUST use default import: import LenisProvider from '../lib/lenis-provider' (DO NOT use named import)
` : ''}

${fileSpec.path === 'app/page.tsx' ? `
SPECIFIC APP/PAGE.TSX REQUIREMENTS:
- MUST start with 'use client' as a STRING LITERAL at the very top: 'use client' (WITH SINGLE QUOTES, on its own line). Example:
  'use client'
  import LenisProvider from '../lib/lenis-provider'
  NOT:
  use client
  import LenisProvider from '../lib/lenis-provider'
- Import LenisProvider from '../lib/lenis-provider' (relative path from app/ to lib/, NOT '@/lib/lenis-provider')
- Import section components from '../components/ComponentName' (NOT ./sections/... - the component files are in components/ folder)
- ONLY import and render section components that EXIST in the sitemap sections array (use the exact 'componentName' field provided below for the import path and component tag) - check the sitemap sections array and ONLY import those components
- For the current sitemap, the sections are: ${JSON.stringify(input.sitemap.pages.flatMap(p => p.sections.map(s => ({ id: s.id, contentType: s.contentType, componentName: s.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') }))), null, 2)}
- DO NOT import Footer in page.tsx - Footer is rendered via layout.tsx
- DO NOT import components that don't exist (e.g., About, Portfolio, Contact) unless they are in the sitemap sections above
- Use proper semantic HTML structure
` : ''}

${fileSpec.path === 'app/globals.css' ? `
SPECIFIC APP/GLOBALS.CSS REQUIREMENTS:
- Generate CSS custom properties in :root from the design tokens EXACTLY as specified below
- Color tokens: For each token in designTokens.colors.tokens, create TWO variables:
  * --{tokenName}-light: {token.light}
  * --{tokenName}-dark: {token.dark}
  Example: for token { name: "primary", light: "oklch(0.3 0.2 260)", dark: "oklch(0.75 0.15 260)" } create:
  --primary-light: oklch(0.3 0.2 260);
  --primary-dark: oklch(0.75 0.15 260);
- Spacing tokens: For each token in designTokens.spacing.scale, create:
  * --{tokenName}: {token.value}
  Example: { name: "md", value: "1rem" } creates --md: 1rem;
- Base unit: --base-unit: {designTokens.spacing.baseUnit}px
- Grid: --grid-columns: {designTokens.spacing.gridColumns}; --max-width: {designTokens.spacing.maxWidth}; --gutter-width: {designTokens.spacing.gutterWidth}
- Typography: --font-display-family: {designTokens.typography.displayFont.family}; --font-text-family: {designTokens.typography.textFont.family}
- Type scale: For each step in designTokens.typography.typeScale, create:
  * --clamp-{name}-min: {step.minSize}
  * --clamp-{name}-max: {step.maxSize}
  * --clamp-{name}: {step.clampFormula}
  * --line-height-{name}: {step.lineHeight}
- Motion: --default-easing: {designTokens.motionPersonality.defaultEasing}; --default-duration: {designTokens.motionPersonality.defaultDuration}s; --stagger-interval: {designTokens.motionPersonality.staggerInterval}s
- DO NOT invent variable names not listed above
- Use the EXACT naming convention: kebab-case with -- prefix
- Output valid CSS only, no markdown fences, no explanations
` : ''}

${fileSpec.path === 'components/Footer.tsx' ? `
SPECIFIC FOOTER.TSX REQUIREMENTS:
- Use CSS Modules: import styles from './Footer.module.css'
- Do NOT include CSS in the .tsx file - CSS goes in separate Footer.module.css file
- Use className={styles.className} for styling
- Keep footer minimal: copyright text, centered
- Export default Footer component
` : ''}

${fileSpec.path === 'components/Footer.module.css' ? `
SPECIFIC FOOTER.MODULE.CSS REQUIREMENTS:
- CSS Module file for Footer component
- Use CSS custom properties from design tokens (use ONLY these exact variable names from globals.css):
  * Color: var(--primary-light), var(--primary-dark) -- NO other color variables
  * Spacing: var(--base-unit), var(--md), var(--lg), etc. -- use EXACT spacing token names from globals.css
- Keep footer minimal: centered copyright text
- Use var() for all design token references
- Simple, clean styling
- DO NOT use :root selector -- CSS Modules scope styles automatically, use class selectors instead
- DO NOT invent variable names like --surface, --on-surface -- they do not exist in globals.css
` : ''}

${fileSpec.path === 'components/Contact.tsx' ? `
SPECIFIC CONTACT.TSX REQUIREMENTS:
- MUST start with 'use client;' as a STRING LITERAL at the very top
- Import globals.css as: import '../app/globals.css'
- Import LenisProvider from '../lib/lenis-provider'
- Use CSS Modules: import styles from './Contact.module.css' (DO NOT include the CSS content in this file, ONLY write the TSX code)
- Do NOT use styled-jsx or <style jsx> - use CSS Modules instead
  - IMPORTANT: NEVER use dot notation for kebab-case CSS classes (e.g., styles.contact-form is INVALID). Always use bracket notation for kebab-case class names: styles['contact-form']
- Implement contact form with proper validation
- Export default Contact component
` : ''}

${fileSpec.path === 'components/Contact.module.css' ? `
SPECIFIC CONTACT.MODULE.CSS REQUIREMENTS:
- CSS Module file for Contact form component
- Use CSS custom properties from design tokens (use ONLY these exact variable names from globals.css):
  * Color: var(--primary-light), var(--primary-dark), var(--accent-light), var(--accent-dark) -- NO other color variables
  * Spacing: var(--base-unit), var(--md), var(--lg), etc. -- use EXACT spacing token names from globals.css
- Style the contact form: max-width, centered, proper spacing, focus states
- Use var() for all design token references
- Clean, accessible styling
- DO NOT invent variable names like --surface, --on-surface -- they do not exist in globals.css
` : ''}

${fileSpec.path === 'components/Hero.tsx' ? `
SPECIFIC HERO.TSX REQUIREMENTS:
The file MUST begin with EXACTLY this pattern (copy it verbatim):

'use client';
import styles from './Hero.module.css';
import '../app/globals.css';
import { useLenis } from '../hooks/useLenis';
import useReducedMotion from '../hooks/useReducedMotion';
import { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

CRITICAL RULES:
- 'use client'; is a STRING on line 1 — NOT a comment (// use client is WRONG)
- import styles from './Hero.module.css' MUST be present (line 2)
- Use className={styles.heroContainer}, className={styles.heroTitle} etc. — NOT className="heroContainer"
- useReducedMotion is a DEFAULT import (no curly braces): import useReducedMotion from '../hooks/useReducedMotion'
- useLenis is a NAMED import (with curly braces): import { useLenis } from '../hooks/useLenis'
- Export default Hero component at the bottom
` : ''}

${fileSpec.path === 'postcss.config.js' ? `
SPECIFIC POSTCSS.CONFIG.JS REQUIREMENTS:
- Use CommonJS module.exports format
- Include plugins: postcss-import, tailwindcss, autoprefixer, postcss-nested (for @layer support)
- Configure postcss-nested to enable @layer and nesting
- Output a minimal valid config
` : ''}

${fileSpec.path === 'lib/gsap-config.ts' ? `
SPECIFIC GSAP-CONFIG.TS REQUIREMENTS:
- Import: import { gsap } from 'gsap'; import { ScrollTrigger } from 'gsap/ScrollTrigger'; (NOT 'gsap/all', NOT '../lenis-provider')
- Register ScrollTrigger plugin: gsap.registerPlugin(ScrollTrigger)
  - DO NOT USE ScrollTrigger.register(). It does not exist. Only use gsap.registerPlugin(ScrollTrigger).
- Export motion constants: defaultEasing, defaultDuration, staggerInterval
- Export setupGSAP() function that configures GSAP and ScrollTrigger. Use ONLY valid GSAP APIs: gsap.defaults({ ease: defaultEasing, duration: defaultDuration }) and gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => { gsap.ticker.fps(1); })
- Export GSAPInitializer component for app/layout.tsx
- Use 'use client' directive
- EXPORT DEFAULT GSAPInitializer at the end of the file: export default GSAPInitializer
` : ''}

${fileSpec.path === 'lib/lenis-provider.tsx' ? `
SPECIFIC LENIS-PROVIDER.TSX REQUIREMENTS:
- Import Lenis from 'lenis' (NOT '@studio-freight/lenis' - the package was renamed)
- Import gsap from 'gsap' (for defaultEase)
- MUST export LenisContext: export const LenisContext = createContext<Lenis | null>(null);
- Export LenisProvider component that creates single Lenis instance. Use ONLY valid LenisOptions: { duration: 0.6, orientation: 'vertical', gestureOrientation: 'vertical', smoothWheel: true } (DO NOT use 'direction', it does not exist)

- Render children in a div with height: '100vh', overflowY: 'auto'
- MUST start with 'use client' as a STRING LITERAL at the very top: 'use client' (with single quotes, on its own line)
- EXPORT DEFAULT LenisProvider at the end of the file: export default LenisProvider
- TYPE the component props to accept children: interface LenisProviderProps { children: React.ReactNode } and use function LenisProvider({ children }: LenisProviderProps) instead of React.FC
` : ''}

${fileSpec.path === 'hooks/useReducedMotion.ts' ? `
SPECIFIC USEREDUCEDMOTION.TS REQUIREMENTS:
- Import: import { useEffect, useState } from 'react';
- Export useReducedMotion() hook that returns boolean for prefers-reduced-motion
- Use matchMedia('(prefers-reduced-motion: reduce)') internally
  - DO NOT type the event parameter. Instead, use 'const handleChange = () => setReducedMotion(mediaQuery.matches);' to completely avoid TypeScript errors.
- Export default useReducedMotion at the end: export default useReducedMotion
` : ''}

${fileSpec.path === 'hooks/useLenis.ts' ? `
SPECIFIC USELENIS.TS REQUIREMENTS:
- Import: import { useContext } from 'react';
- Import: import { LenisContext } from '../lib/lenis-provider';
- Export useLenis() hook that returns Lenis instance from context (NAMED export: export const useLenis = ...)
- IMPORTANT: If context is null, return null (DO NOT throw an error, because it will be null during server-side prerendering).
` : ''}

${fileSpec.path === 'tsconfig.json' ? `
SPECIFIC TSCONFIG.JSON REQUIREMENTS:
  - MUST set lib array EXACTLY as: ["dom", "dom.iterable", "esnext"] (do not include "react" or "jsx")
- Use standard Next.js TypeScript config
- Include path aliases: "@/*": ["./*"]
- strict: true, noEmit: true, esModuleInterop: true
- module: "esnext", moduleResolution: "bundler", jsx: "preserve"
- Include plugins for next
- include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
- exclude: ["node_modules"]
- Do NOT include "extends": "next/tsconfig.json" (may not exist in generated project)
- Output a COMPLETE valid JSON object
` : ''}
`;

    // Build the EXACT CSS variable names that globals.css will generate from design tokens
    // This is the SINGLE SOURCE OF TRUTH for variable names -- section components MUST use these exact names
    const colorVarNames = input.designTokens.colors.tokens.map(t => `--${t.name}-light, --${t.name}-dark`).join(', ');
    const spacingVarNames = input.designTokens.spacing.scale.map(s => `--${s.name}`).join(', ');
    const typeScaleVarNames = input.designTokens.typography.typeScale.map(step => 
      `--clamp-${step.name}-min, --clamp-${step.name}-max, --clamp-${step.name}, --line-height-${step.name}`
    ).join(', ');
    const exactCssVariables = 
      `EXACT CSS VARIABLE NAMES FROM globals.css (use ONLY these, byte-for-byte -- COPY THESE EXACT STRINGS):\n` +
      `Color: ${colorVarNames}\n` +
      `Spacing: --base-unit, ${spacingVarNames}, --grid-columns, --max-width, --gutter-width\n` +
      `Typography: --font-display-family, --font-text-family, ${typeScaleVarNames}\n` +
      `Motion: --default-easing, --default-duration, --stagger-interval\n\n` +
      `CRITICAL: In your .module.css file, you MUST use var(--primary-light) or var(--primary-dark) for colors -- NEVER var(--primary) or var(--text-color) or any other invented names. COPY the exact names from the list above.`;

    // Extract defined CSS variables from the actual globals.css if it exists
    const globalsContent = alreadyGenerated.get('app/globals.css') ?? '';
    const actualVars = [...globalsContent.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map(m => m[1]);
    const varListString = actualVars.length > 0 
      ? `EXACT CSS VARIABLE NAMES FROM globals.css:\n${actualVars.map(v => `  ${v}`).join('\n')}\n`
      : exactCssVariables;

    // Compute section styling requirement text
    const sectionStyling = fileSpec.type === 'section'
        ? ('GENERAL SECTION COMPONENT STYLING REQUIREMENT (applies to every section component):\n' +
           '- Use CSS Modules for all component-scoped styling: import styles from \'./' +
           fileSpec.path.replace('components/', '').replace('.tsx', '') + '.module.css\'\n' +
           '- Do NOT use inline styles, styled-jsx, or <style jsx> tags\n' +
             '- IMPORTANT: For all imports from lib or hooks directories, use ONE level up relative path (e.g. \'../lib/lenis-provider\' or \'../hooks/useReducedMotion\' or \'../lib/gsap-config\'). Do NOT use \'../../\'.\n' +
             '- IMPORT ScrollTrigger CORRECTLY: import { ScrollTrigger } from \'gsap/ScrollTrigger\';\n' +
             '- IMPORT useReducedMotion CORRECTLY: import useReducedMotion from \'../hooks/useReducedMotion\'; (It is a DEFAULT export, do NOT use curly braces)\n' +
             '- IMPORT useLenis CORRECTLY: import { useLenis } from \'../hooks/useLenis\'; (It is a NAMED export, do NOT import it from lenis-provider)\n' +
             '- ALWAYS include ALL imports used in the file! If you use lenis, you MUST import it!\n' +
             '- For React hooks (useEffect, useRef, useState), ALWAYS import them explicitly: import React, { useEffect, useRef, useState } from \'react\';\n' +


             '- PROPS: ALWAYS declare an interface for your props (e.g. interface Props { id?: string }) and accept id in your component signature.\n' +
             '- CRITICAL RULE ABOUT IMPORTS: You MUST NOT write any duplicate imports. If you imported react hooks at the top, DO NOT write \'import { useEffect } from "react";\' again! DO NOT write \'import gsap from "gsap";\' again! ONLY ONE IMPORT PER MODULE IS ALLOWED.\n' +

           '- Use className={styles.yourClassName} for every styled element. CRITICAL: For CSS Modules with dashed class names, you MUST use bracket notation. Dot notation (styles.some-dashed-class) is INVALID TypeScript and will break the build. Example:\n' +
           '  ❌ <div className={styles.hero-section}>\n' +
           '  ✅ <div className={styles[\'hero-section\']}>\n' +
           '- Use var(--token-name) inside the CSS module to reference design tokens from globals.css -- never hardcode raw color/spacing values\n' +
           '- The matching .module.css file for this component is already in your file list as a dependency -- write real, complete styles into it, don\'t leave it as a stub\n' +
           '- DO NOT use :root selector in CSS Modules -- CSS Modules scope styles automatically, use class selectors instead\n\n' +
           varListString +
           `CRITICAL: In your .module.css file, you MUST use ONLY these variables. NEVER invent other names.\n`)
        : '';

    // For .module.css files (type=style): enforce exact variable names too.
    // sectionStyling only runs for type=section TSX files, so CSS module files need their own block.
    // Critically: parse the ACTUAL --variable-names from globals.css (already generated) rather than
    // re-deriving them from design tokens — the two sources can diverge in naming conventions.
    let cssModuleStyling = '';
    if (fileSpec.type === 'style' && fileSpec.path.endsWith('.module.css')) {
      const globalsContent = alreadyGenerated.get('app/globals.css') ?? '';
      // Extract all --variable-name: declarations from globals.css
      const definedVars = [...globalsContent.matchAll(/^\s*(--[\w-]+)\s*:/gm)]
        .map(m => m[1]);
      const definedSet = new Set(definedVars);
      const varList = definedVars.length > 0
        ? definedVars.map(v => `  ${v}`).join('\n')
        : exactCssVariables; // fallback to token-derived list if globals not yet available

      // Build concrete substitution examples from the actual available vars
      const colorVars = definedVars.filter((v): v is string => typeof v === 'string' && (v.includes('primary') || v.includes('surface') || v.includes('accent')));
      const sizeVars = definedVars.filter((v): v is string => typeof v === 'string' && (v.startsWith('--clamp-') || v.includes('font-size')));
      const bgExample = colorVars[0] ?? definedVars[0] ?? '--primary-light';
      const sizeExample = sizeVars[0] ?? '--clamp-base';

      cssModuleStyling =
        '\n## CSS MODULE VARIABLE CONSTRAINT (READ CAREFULLY BEFORE WRITING ANY CSS)\n\n' +
        'app/globals.css defines EXACTLY these CSS custom properties. No others exist.\n' +
        'AVAILABLE VARIABLES:\n' +
        varList + '\n\n' +
        'SUBSTITUTION RULES — follow these exactly:\n' +
        (definedSet.has('--surface-dark') ? '' :
          `  ❌ background-color: var(--surface-dark);   →  ✅ background-color: var(${bgExample});\n`) +
        (definedSet.has('--on-surface-dark') ? '' :
          `  ❌ color: var(--on-surface-dark);           →  ✅ color: var(--primary-light); or hardcode #fff\n`) +
        (definedSet.has('--on-surface') ? '' :
          `  ❌ color: var(--on-surface);               →  ✅ color: var(--primary-light); or hardcode\n`) +
        (definedSet.has('--clamp-display') ? '' :
          `  ❌ font-size: var(--clamp-display);         →  ✅ font-size: var(${sizeExample});\n`) +
        (definedSet.has('--letter-spacing') ? '' :
          `  ❌ letter-spacing: var(--letter-spacing);   →  ✅ letter-spacing: -0.02em; (hardcode it)\n`) +
        '\nIf a property you want does NOT appear in the AVAILABLE VARIABLES list, hardcode it directly.\n' +
        'Do NOT invent a variable name that is not in the list above.\n\n';
    }

    // Build the output format string
    const outputFormat = '## OUTPUT FORMAT (CRITICAL - follow EXACTLY)\n' +
        'You MUST output a JSON object with EXACTLY these three fields:\n' +
        '{\n' +
        '  "path": "' + fileSpec.path + '",\n' +
        '  "content": "<complete file content as a string with escaped newlines>",\n' +
        '  "dependencies": { "<package-name>": "<version>" }\n' +
        '}\n\n' +
        '- The "path" field MUST be exactly "' + fileSpec.path + '"\n' +
        '- The "content" field MUST contain the complete file content as a string (escape newlines as \\n, escape quotes as \\")\n' +
        '- The "dependencies" field MUST be an object mapping npm package names to version strings (empty object {} if none)\n' +
        '- Do NOT output a JSON object with the file path as the key\n' +
        '- Do NOT include any additional fields\n' +
        '- Do NOT wrap in markdown code fences\n' +
        '- Do NOT include any explanatory text\n\n' +
        'Output valid JSON matching the SingleFileOutput schema ONLY.';

    const messages = [
      { role: 'user' as const, content: singleFilePrompt + sectionStyling + cssModuleStyling + outputFormat },
    ];

    const result = await this.provider.complete({
      model: this.modelOverride,
      systemPrompt: this.systemPrompt,
      messages,
      responseSchema: SingleFileOutputSchema,
      temperature: 0.3,
      maxTokens: 16384,
    });

    let parsed: unknown;
    if (result.structured) {
      parsed = result.structured;
      // Fix common escaping issues from structured output
      if (parsed && typeof parsed === 'object' && 'content' in parsed && typeof parsed.content === 'string') {
        // Aggressively fix all common escape sequences that models output incorrectly
        parsed.content = parsed.content
          .split('\\n').join('\n')      // literal \n -> newline
          .split('\\"').join('"')       // literal \" -> quote
          .split('\\t').join('\t');     // literal \t -> tab
      }
    } else {
      try {
        parsed = JSON.parse(result.content);
      } catch {
        throw new Error(`Could not parse JSON for ${fileSpec.path} from response`);
      }
      // Fix double-escaped newlines (\\n -> \n) and double-escaped quotes (\\" -> ")
      if (parsed && typeof parsed === 'object' && 'content' in parsed && typeof parsed.content === 'string') {
        parsed.content = parsed.content
          .replace(/\\\\n/g, '\n')
          .replace(/\\\\"/g, '"')
          .replace(/\\\\t/g, '\t');
      }
    }

    const validation = SingleFileOutputSchema.safeParse(parsed);
    if (!validation.success) {
      throw new Error(`Single file validation failed for ${fileSpec.path}: ${JSON.stringify(validation.error.format())}`);
    }

    // Post-validation fix for next.config.js: strip imports, ensure CommonJS

    if (fileSpec.path === 'tailwind.config.ts' && validation.data.content) {
      validation.data.content = validation.data.content.replace(
        /import\s*\{\s*defineConfig\s*\}\s*from\s*['"]tailwindcss['"]\s*;?\s*export\s*default\s*defineConfig\s*\(/g,
        "import type { Config } from 'tailwindcss';\n\nconst config: Config = {"
      ).replace(
        /export\s*default\s*defineConfig\s*\(/g,
        "const config: Config = {"
      );
      if (validation.data.content.includes('const config: Config = {')) {
        validation.data.content = validation.data.content.replace(/}\)?;?\s*$/, "};\nexport default config;\n");
      }
    }

    if (fileSpec.path === 'next.config.js' && validation.data.content) {
      const lines = validation.data.content.includes('\n') 
        ? validation.data.content.split('\n')
        : validation.data.content.split('\\n');
      validation.data.content = lines
        .filter(line => {
          const trimmed = line.trim();
          return !trimmed.startsWith('import ') && 
                 !trimmed.startsWith('export ') &&
                 !trimmed.startsWith('import\\n') &&
                 !trimmed.startsWith('export\\n');
        })
        .join('\n');
    }


    if (validation.data && validation.data.content && (fileSpec.path.endsWith('.tsx') || fileSpec.path.endsWith('.ts'))) {
      let importsBlock = '';
      validation.data.content = validation.data.content.replace(/^(?:import\s+.*?;\s*)+/m, (match) => {
        importsBlock = match;
        return '';
      });
      if (importsBlock) {
        const uniqueImports = Array.from(new Set(importsBlock.split(/\r?\n/).map(s => s.trim()).filter(Boolean))).join('\n');
        validation.data.content = uniqueImports + '\n\n' + validation.data.content.trimStart();
      }
    }

    // Post-processing: fix the persistent small-model failure of outputting
    // `// use client;` or `// 'use client'` (a comment) instead of `'use client';` (directive).
    // This is a safe mechanical substitution — the directive must be line 1.
    if (validation.data.content && (fileSpec.path.endsWith('.tsx') || fileSpec.path.endsWith('.ts'))) {
      validation.data.content = validation.data.content
        // Robust fix for all variations of 'use client' comments, double quotes, missing semicolons, etc.
        // Catches: // 'use client', //"use client", //  use client;, /* use client */, "use client";
        
    }





    // Fix use client: move to top if present anywhere
    if (validation.data && validation.data.content) {
      if (validation.data.content.match(/["']use client["']/)) {
        validation.data.content = validation.data.content.replace(/^\s*(?:\/\*|\/\/)?\s*["']?use client["']?[\s;\*\/]*\n?/gm, "");
        validation.data.content = "'use client';\n" + validation.data.content.trimStart();
      }
      
      // Fix styled-jsx hallucinations
      validation.data.content = validation.data.content.replace(/<style\s+jsx[\s\S]*?<\/style>/g, "");
      validation.data.content = validation.data.content.replace(/import\s+.*?\s+from\s+['"]styled-jsx.*?['"];?/g, "");
    }

        
    // Fix layout.tsx raw HTML hallucination
    if (validation.data && validation.data.content && fileSpec.path === 'app/layout.tsx') {
      const content = validation.data.content.trim();
      if (content.startsWith('<html')) {
        validation.data.content = `import './globals.css';
import LenisProvider from '../lib/lenis-provider';

export const metadata = {
  title: 'Portfolio',
  description: 'Portfolio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    ${content.replace(/{children}/g, '<LenisProvider>{children}</LenisProvider>')}
  );
}
`;
      }
      
      // If missing export, append a default export just in case
      if (!validation.data.content.includes("export default")) {
         if (validation.data.content.includes("function RootLayout")) {
             validation.data.content = validation.data.content.replace("function RootLayout", "export default function RootLayout");
         } else {
             validation.data.content += "\nexport default function RootLayout({ children }: { children: React.ReactNode }) { return <>{children}</>; }\n";
         }
      }
    }


    // Fix unmatched quotes in use client
    if (validation.data && validation.data.content) {
      validation.data.content = validation.data.content.replace(/^\s*["']use client;\s*\n/gm, "");
    }
    
    // Fix CSS var() syntax in JS objects
    if (validation.data && validation.data.content) {
      validation.data.content = validation.data.content.replace(/duration:\s*var\((.*?)\)/g, "duration: 'var($1)'");
    }

    // Fix inline arrow functions in logical OR
    if (validation.data && validation.data.content) {
      validation.data.content = validation.data.content.replace(/\|\|\s*\([a-zA-Z0-9_: ]*\)\s*=>\s*\{\}/g, "|| (() => {})");
    }

    // Fix page.tsx raw HTML hallucination
    if (validation.data && validation.data.content && fileSpec.path.endsWith('/page.tsx')) {
      const content = validation.data.content.trim();
      if (content.startsWith('<html')) {
        let innerContent = content;
        // Try to extract body
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            innerContent = bodyMatch[1];
        } else {
            innerContent = content.replace(/<\/?(html|head|body|meta|title|link)[^>]*>/gi, "");
        }
        
        const componentName = fileSpec.path === 'app/page.tsx' ? 'HomePage' : (fileSpec.path.split('/').slice(-2)[0] || 'Unknown') + 'Page';
        const safeName = componentName.charAt(0).toUpperCase() + componentName.slice(1).replace(/[^a-zA-Z0-9]/g, '');
        
        validation.data.content = `import React from 'react';

export default function ${safeName}() {
  return (
    <main>
      ${innerContent}
    </main>
  );
}
`;
      }
    }

// Post-processing: generic missing imports auto-fixer for 7B models
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
      const missing = [];
      const c = validation.data.content;
      if (c.includes('useEffect(') && !c.includes('useEffect}')) missing.push('import { useEffect } from "react";');
      if (c.includes('useRef(') && !c.includes('useRef}')) missing.push('import { useRef } from "react";');
      if (c.includes('useState(') && !c.includes('useState}')) missing.push('import { useState } from "react";');
      if (c.includes('gsap.') && !c.match(/import\s+gsap/)) missing.push('import gsap from "gsap";');
      
      if (missing.length > 0) {
        // Insert missing imports directly after the first import or use client directive
        const lines = validation.data!.content!.split('\n');
        let insertIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]?.startsWith('import ')) {
            insertIdx = i + 1;
          }
        }
        lines.splice(insertIdx, 0, ...missing);
        validation.data!.content = lines.join('\n');
      }
    }
    return validation.data;
  }

  /**
   * Main execution: parallel level-based generation with checkpoint-and-isolate.
   *
   * Flow:
   * 1. Generate deterministic file list from sitemap
   * 2. Validate dependency graph for cycles
   * 3. Initialize checkpoint (fresh or resume from existing)
   * 4. Compute parallel levels (groups of files with no unmet deps on each other)
   * 5. For each pass (1..maxRetryPasses):
   *    a. Config batch: generate package.json + tailwind + postcss in one LLM call
   *    b. Remaining levels: generate all files in each level concurrently (capped at maxConcurrency)
   * 6. Return results with pass-by-pass reporting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Compute parallel execution levels from the file list.
   * Files in the same level have no dependencies on each other and can be
   * generated concurrently. Dependencies from previous levels are fully
   * satisfied before a level starts.
   *
   * Uses Kahn's BFS: at each step, all zero-indegree nodes form one level.
   */
  computeParallelLevels(fileList: FileSpec[]): FileSpec[][] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // node -> dependents (reverse edges)
    const fileMap = new Map<string, FileSpec>();

    for (const f of fileList) {
      fileMap.set(f.path, f);
      inDegree.set(f.path, 0);
      graph.set(f.path, []);
    }

    // Build dependency graph (dep -> files that depend on dep)
    for (const f of fileList) {
      for (const dep of f.dependencies) {
        if (!fileMap.has(dep)) continue; // skip external/non-generated deps
        inDegree.set(f.path, (inDegree.get(f.path) ?? 0) + 1);
        graph.get(dep)!.push(f.path);
      }
    }

    const levels: FileSpec[][] = [];
    let frontier = fileList.filter(f => inDegree.get(f.path) === 0);

    while (frontier.length > 0) {
      levels.push(frontier);
      const next: FileSpec[] = [];
      for (const f of frontier) {
        for (const dependent of graph.get(f.path) ?? []) {
          const deg = (inDegree.get(dependent) ?? 0) - 1;
          inDegree.set(dependent, deg);
          if (deg === 0) {
            next.push(fileMap.get(dependent)!);
          }
        }
      }
      frontier = next;
    }

    return levels;
  }

  /**
   * Semaphore-based concurrency limiter.
   * Runs `tasks` with at most `limit` in-flight simultaneously.
   * Returns results in original order (uses Promise.allSettled semantics per slot).
   */
  private async pConcurrent<T>(
    tasks: Array<() => Promise<T>>,
    limit: number,
  ): Promise<Array<PromiseSettledResult<T>>> {
    const results: Array<PromiseSettledResult<T>> = new Array(tasks.length);
    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < tasks.length) {
        const i = nextIndex++;
        try {
          results[i] = { status: 'fulfilled', value: await tasks[i]!() };
        } catch (err) {
          results[i] = { status: 'rejected', reason: err };
        }
      }
    };

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }

  /**
   * Config batch: generate package.json, tailwind.config.ts, and postcss.config.js
   * in a SINGLE LLM call (one structured response with all 3 files).
   * Saves 2 round trips compared to generating them individually.
   * Combined output is ~1-3KB -- well within any model's output token limit.
   */
  private async generateConfigBatch(
    input: CodegenInput,
    fileSpecs: FileSpec[],
  ): Promise<SingleFileOutput[]> {
    const ConfigBatchOutputSchema = z.object({
      files: z.array(SingleFileOutputSchema).describe('All config files, one entry per file'),
    }).strict();

    const fileDescriptions = fileSpecs
      .map(f => `- ${f.path} (${f.type}): ${f.purpose}`)
      .join('\n');

    const colorVarNames = input.designTokens.colors.tokens.map(t => `--${t.name}-light, --${t.name}-dark`).join(', ');
    const spacingVarNames = input.designTokens.spacing.scale.map(s => `--${s.name}`).join(', ');
    const typeScaleVarNames = input.designTokens.typography.typeScale.map(step => 
      `--clamp-${step.name}-min, --clamp-${step.name}-max, --clamp-${step.name}, --line-height-${step.name}`
    ).join(', ');
    const exactCssVariables = 
      `EXACT CSS VARIABLE NAMES (use ONLY these, byte-for-byte -- COPY THESE EXACT STRINGS for Tailwind variables):\n` +
      `Color: ${colorVarNames}\n` +
      `Spacing: --base-unit, ${spacingVarNames}, --grid-columns, --max-width, --gutter-width\n` +
      `Typography: --font-display-family, --font-text-family, ${typeScaleVarNames}\n` +
      `Motion: --default-easing, --default-duration, --stagger-interval\n\n` +
      `CRITICAL: In your tailwind.config.ts file, you MUST use var(--primary-light) or var(--primary-dark) for colors -- NEVER var(--primary) or var(--text-color) or any other invented names. COPY the exact names from the list above.`;

    // Build the batch prompt in parts to avoid issues with backticks in the template string
    const batchPromptParts = [
      this.formatInput(input),
      '',
      exactCssVariables,
      '',
      '## TASK: Generate Config Files Batch',
      'Generate ALL of the following config files in a single response:',
      fileDescriptions,
      '',
      'Requirements for each file:',
      '- Follow the design tokens and sitemap EXACTLY',
      '- Output complete, runnable content -- no placeholders, no TODOs',
      '',
              'SPECIFIC TAILWIND.CONFIG.TS REQUIREMENTS:',
        '- MUST include the content array with exact globs: content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],',
        '- MUST use a SINGLE string for font sizes, do NOT use arrays with min/max/clamp. (e.g. \'xs\': \'var(--clamp-xs)\')',
        '- NEVER use a 3-element array for fontSize.',
        '- MUST START EXACTLY WITH: import type { Config } from \'tailwindcss\';',
        '- MUST DECLARE: const config: Config = { ... }',
        '- MUST END WITH: export default config;',

        '',
        'SPECIFIC PACKAGE.JSON REQUIREMENTS:',
      '- next: "15.0.0" (NOT RC, NOT canary)',
      '- react: "18.3.1" (NOT RC)',
      '- react-dom: "18.3.1" (NOT RC)',
      '- gsap: "^3.12.7"',
      '- lenis: "^1.1.15" (use the current \'lenis\' package - NOT @studio-freight/lenis which is deprecated)',
      '- tailwindcss: "^3.4.10"',
      '- autoprefixer: "^10.4.20"',
      '- postcss: "^8.4.47"',
      '- postcss-preset-env: "^10.1.0"',
      '- postcss-import: "^16.1.0"',
      '- typescript: "^5.6.0"',
      '- eslint: "^9.10.0"',
      '- eslint-config-next: "15.0.0"',
      '- @types/react: "^18.3.0"',
      '- @types/react-dom: "^18.3.0"',
      '- @types/node: "^22.7.0"',
      '- Include scripts: dev, build, start, lint',
      '- Set "private": true',
      '',
      '## OUTPUT FORMAT (CRITICAL - follow EXACTLY)',
      'You MUST output a JSON object with a "files" array. Each entry in the array MUST have EXACTLY these three fields:',
      '{',
      '  "files": [',
      '    {',
      '      "path": "package.json",',
      '      "content": "<complete file content as a string with escaped newlines>",',
      '      "dependencies": { "<package-name>": "<version>" }',
      '    },',
      '    {',
      '      "path": "tailwind.config.ts",',
      '      "content": "<complete file content as a string with escaped newlines>",',
      '      "dependencies": {}',
      '    },',
      '    {',
      '      "path": "postcss.config.js",',
      '      "content": "<complete file content as a string with escaped newlines>",',
      '      "dependencies": {}',
      '    }',
      '  ]',
      '}',
      '',
      'CRITICAL FORMAT RULES:',
      '- The "path" field MUST be a string (e.g., "package.json")',
      '- The "content" field MUST be a STRING (escape newlines as \\n, escape quotes as \\")',
      '- The "dependencies" field MUST be an OBJECT mapping package names to version strings (empty object {} if none)',
      '- Do NOT output content as an object or array',
      '- Do NOT output dependencies as an array',
      '- Do NOT include any additional fields',
      '- Do NOT wrap in markdown code fences',
      '- Do NOT include any explanatory text',
      '',
      'Output valid JSON matching the ConfigBatchOutputSchema ONLY.'
    ];

    const batchPrompt = this.formatInput(input) + batchPromptParts.join('\n');

    const result = await this.provider.complete({
      model: this.modelOverride,
      systemPrompt: this.systemPrompt,
      messages: [{ role: 'user' as const, content: batchPrompt }],
      responseSchema: ConfigBatchOutputSchema,
      temperature: 0.2,
      maxTokens: 16384,
    });

    let parsed: unknown;
    if (result.structured) {
      parsed = result.structured;
    } else {
      try {
        parsed = JSON.parse(result.content);
      } catch {
        throw new Error('Could not parse config batch JSON response');
      }
    }

    const validation = ConfigBatchOutputSchema.safeParse(parsed);
    if (!validation.success) {
      throw new Error(`Config batch validation failed: ${JSON.stringify(validation.error.format())}`);
    }

    // Strip markdown fences from individual file contents if present
    const files = validation.data.files.map(file => ({
      ...file,
      content: this.stripMarkdownFences(file.content),
    }));

    return files;
  }

  /**
   * Strip markdown code fences from text.
   * Handles ```json ... ```, ``` ... ```, ```json{...}```, and ```{...}``` patterns.
   */
  private stripMarkdownFences(text: string): string {
    const trimmed = text.trim();
    
    // Pattern 1: ```json\n...\n``` or ```\n...\n``` (with newlines)
    let fenceMatch = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/);
    if (fenceMatch && fenceMatch[1] !== undefined) {
      return fenceMatch[1].trim();
    }
    
    // Pattern 2: ```json{...}``` or ```{...}``` (no newlines, inline)
    fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch && fenceMatch[1] !== undefined) {
      return fenceMatch[1].trim();
    }
    
    // Pattern 3: Just remove leading ```json or ``` and trailing ```
    if (trimmed.startsWith('```')) {
      let cleaned = trimmed.replace(/^```(?:json)?\s*/, '');
      cleaned = cleaned.replace(/\s*```$/, '');
      return cleaned.trim();
    }
    
    return trimmed;
  }

  public override async execute(input: CodegenInput): Promise<AgentResult<GeneratedCode>> {
    // Phase 1: Generate file list (deterministic, no LLM call)
    this.emit?.('stage:start', 'Generating file list from sitemap...');
    const fileList = this.generateFileList(input);
    this.emit?.('stage:complete', `File list generated: ${fileList.length} files`);

    // Phase 2: Validate dependency graph for cycles
    this.emit?.('stage:start', 'Validating dependency graph...');
    const cycle = this.detectCycles(fileList);
    if (cycle) {
      throw new Error(`Circular dependency detected: ${cycle.join(' -> ')}`);
    }
    this.emit?.('stage:complete', 'Dependency graph validated (no cycles)');

    // Phase 3: Initialize checkpoint
    const checkpointPath = this.checkpointDir
      ? resolve(this.checkpointDir, '.forge', 'checkpoint.json')
      : undefined;

    const checkpoint = checkpointPath
      ? new CodegenCheckpoint(checkpointPath)
      : new CodegenCheckpoint(resolve(process.cwd(), '.forge', 'checkpoint.json'));

    const projectName = input.brief?.name || 'forge-project';
    checkpoint.initialize(fileList, projectName);

    // Force reset any files that need fixing from QA gate
    if (input.fixTickets && input.fixTickets.length > 0) {
      checkpoint.forceReset(input.fixTickets.map(t => t.file));
    }

    // Check for resumed files
    const resumedCount = fileList.filter(f => checkpoint.isAlreadySuccessful(f.path)).length;
    if (resumedCount > 0) {
      this.emit?.('stage:complete', `Checkpoint resume: ${resumedCount}/${fileList.length} files already generated, skipping`);
    }

    // Phase 4: Compute parallel levels (replaces simple topological sort for execution)
    const parallelLevels = this.computeParallelLevels(fileList);
    const fileSpecMap = new Map<string, FileSpec>(fileList.map(f => [f.path, f]));

    // Config files that get batched into a single LLM call
    const CONFIG_BATCH_FILES = new Set(['package.json', 'tailwind.config.ts', 'postcss.config.js']);

    // Track generated file contents (populated from disk for resumed files, or from generation)
    const generatedFiles = new Map<string, string>();
    const allDependencies = new Map<string, string>();

    // Load already-successful files from disk for dependency context
    if (this.checkpointDir && resumedCount > 0) {
      for (const file of fileList) {
        if (checkpoint.isAlreadySuccessful(file.path)) {
          const diskPath = resolve(this.checkpointDir, file.path);
          if (existsSync(diskPath)) {
            try {
              const content = readFileSync(diskPath, 'utf-8');
              generatedFiles.set(file.path, content);
              this.emit?.('codegen:file:skipped' as any, `Skipped (checkpoint resume): ${file.path}`);
            } catch {
              // Can't read from disk -- will need to regenerate
            }
          }
        }
      }
    }

    // Phase 5: Multi-pass parallel generation
    for (let pass = 1; pass <= this.maxRetryPasses; pass++) {
      const passStart = Date.now();

      // Determine which files still need generation this pass
      const filesForPass = pass === 1
        ? fileList.filter(f => !checkpoint.isAlreadySuccessful(f.path)).map(f => f.path)
        : checkpoint.getFilesForPass(pass);

      if (filesForPass.length === 0) {
        this.emit?.('codegen:pass:complete' as any,
          `Pass ${pass}: no files to process (all succeeded)`);
        break;
      }

      const filesForPassSet = new Set(filesForPass);
      this.emit?.('stage:start',
        `Codegen pass ${pass}/${this.maxRetryPasses}: ${filesForPass.length} file(s) to generate in parallel levels`);

      let passAttempted = 0;
      let passSucceeded = 0;
      let passFailed = 0;
      let passBlocked = 0;
      let passSkipped = 0;

      // --- Config batch: collapse package.json + tailwind + postcss into 1 LLM call ---
      const configBatchSpecs = fileList.filter(
        f => CONFIG_BATCH_FILES.has(f.path) && filesForPassSet.has(f.path) && !generatedFiles.has(f.path)
      );

      if (configBatchSpecs.length > 0) {
        passAttempted += configBatchSpecs.length;
        try {
          this.emit?.('stage:start', `Generating config batch (${configBatchSpecs.map(f => f.path).join(', ')})...`);
          const batchOutputs = await this.generateConfigBatch(input, configBatchSpecs);

          for (const fileOutput of batchOutputs) {
            // Apply post-processing fix for next.config.js
            if (fileOutput.path === 'next.config.js' && fileOutput.content) {
              const lines = fileOutput.content.includes('\n') 
                ? fileOutput.content.split('\n')
                : fileOutput.content.split('\\n');
              fileOutput.content = lines
                .filter(line => {
                  const trimmed = line.trim();
                  return !trimmed.startsWith('import ') && 
                         !trimmed.startsWith('export ') &&
                         !trimmed.startsWith('import\\n') &&
                         !trimmed.startsWith('export\\n');
                })
                .join('\n');
            }
            generatedFiles.set(fileOutput.path, fileOutput.content);
            this.fileCallback?.(fileOutput.path, fileOutput.content);
            for (const [pkg, version] of Object.entries(fileOutput.dependencies)) {
              allDependencies.set(pkg, version);
            }
            checkpoint.markSuccess(fileOutput.path, pass, fileOutput.content);
            passSucceeded++;
            this.emit?.('codegen:file:success' as any, `Generated (batch): ${fileOutput.path}`);
          }

          // If batch returned fewer files than requested, mark missing ones failed
          const returnedPaths = new Set(batchOutputs.map(f => f.path));
          for (const spec of configBatchSpecs) {
            if (!returnedPaths.has(spec.path)) {
              checkpoint.markFailed(spec.path, 'Not returned by config batch', pass);
              passFailed++;
            }
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          // Batch failed -- mark each config file failed individually so retry logic can re-attempt them
          for (const spec of configBatchSpecs) {
            checkpoint.markFailed(spec.path, `Config batch error: ${err.message}`, pass);
            passFailed++;
            this.emit?.('codegen:file:failed' as any, `Config batch failed for ${spec.path}: ${err.message.slice(0, 200)}`);
          }
        }
      }

      // --- Remaining files: process in parallel levels ---
      for (let levelIdx = 0; levelIdx < parallelLevels.length; levelIdx++) {
        const level = parallelLevels[levelIdx]!;

        // Filter to files that are: in this pass, not already done, not config-batch files
        const pendingInLevel = level.filter(
          f => filesForPassSet.has(f.path) && !generatedFiles.has(f.path) && !CONFIG_BATCH_FILES.has(f.path)
        );

        if (pendingInLevel.length === 0) continue;

        // Build concurrent tasks for this level
        const tasks = pendingInLevel.map(fileSpec => async () => {
          const filePath = fileSpec.path;

          // Check if dependencies are blocked
          const blockingDep = checkpoint.getBlockingDependency(filePath);
          if (blockingDep) {
            checkpoint.markBlocked(filePath, blockingDep, pass);
            this.emit?.('codegen:file:blocked' as any,
              `Blocked: ${filePath} (dependency '${blockingDep}' not available)`);
            return { status: 'blocked' as const, filePath };
          }

          // Generate the file
          this.emit?.('stage:start', `Generating ${filePath}${pass > 1 ? ` (retry pass ${pass})` : ''}...`);
          const fileOutput = await this.generateSingleFile(input, fileSpec, generatedFiles);

          // Atomically update state (generatedFiles is shared across concurrent tasks,
          // but Map.set is synchronous and JS is single-threaded -- safe without locks)
          generatedFiles.set(fileOutput.path, fileOutput.content);
          this.fileCallback?.(fileOutput.path, fileOutput.content);
          for (const [pkg, version] of Object.entries(fileOutput.dependencies)) {
            allDependencies.set(pkg, version);
          }
          checkpoint.markSuccess(filePath, pass, fileOutput.content);
          this.emit?.('codegen:file:success' as any,
            `Generated: ${filePath}${pass > 1 ? ` (pass ${pass})` : ''}`);
          this.emit?.('stage:complete', `Generated ${filePath}`);
          return { status: 'success' as const, filePath };
        });

        // Execute level with concurrency cap (safe for Groq 30 RPM)
        const levelResults = await this.pConcurrent(tasks, this.maxConcurrency);

        // Tally results; handle failures per-file (isolation preserved)
        for (let i = 0; i < levelResults.length; i++) {
          const result = levelResults[i]!;
          const fileSpec = pendingInLevel[i]!;
          passAttempted++;

          if (result.status === 'fulfilled') {
            const val = result.value;
            if (val.status === 'success') passSucceeded++;
            else if (val.status === 'blocked') passBlocked++;
          } else {
            // Rejected -- isolated failure, does NOT affect other files
            const err = result.reason instanceof Error
              ? result.reason
              : new Error(String(result.reason));
            checkpoint.markFailed(fileSpec.path, err.message, pass);
            passFailed++;
            this.emit?.('codegen:file:failed' as any,
              `Failed: ${fileSpec.path}: ${err.message.slice(0, 200)}`);
            this.emit?.('stage:error', `Failed to generate ${fileSpec.path}: ${err.message}`);
          }
        }

        // Delay between levels (wave-to-wave), not within a level
        if (levelIdx < parallelLevels.length - 1 && this.interRequestDelayMs > 0) {
          await this.sleep(this.interRequestDelayMs);
        }
      }

      // Record pass results
      const passResult: PassResult = {
        pass,
        attempted: passAttempted,
        succeeded: passSucceeded,
        failed: passFailed,
        blocked: passBlocked,
        skipped: passSkipped,
        durationMs: Date.now() - passStart,
      };
      checkpoint.recordPassResult(passResult);

      this.emit?.('codegen:pass:complete' as any,
        `Pass ${pass} complete: ${passSucceeded} succeeded, ${passFailed} failed, ${passBlocked} blocked, ${passSkipped} skipped (${((Date.now() - passStart) / 1000).toFixed(1)}s)`);

      // If no failures or blocks, we're done
      if (passFailed === 0 && passBlocked === 0) {
        break;
      }
    }

    // Phase 6: Final summary
    const summaryReport = checkpoint.getSummaryReport();
    this.emit?.('stage:complete', summaryReport);

    // Check if we have enough files to proceed
    const successCount = checkpoint.getSuccessCount();
    const permanentlyFailed = checkpoint.getPermanentlyFailedFiles();

    if (successCount === 0) {
      throw new Error(`Codegen produced zero files after ${this.maxRetryPasses} passes. All ${fileList.length} files failed.`);
    }

    // Build the output -- include all successfully generated files
    const files: Record<string, string> = {};
    for (const [path, content] of generatedFiles) {
      files[path] = content;
    }

    // Build notes including failure information
    let notes = '';
    if (permanentlyFailed.length > 0) {
      notes = `${summaryReport}. Permanently failed files:\n${
        permanentlyFailed.map(f => `  - ${f.path}: ${f.error}`).join('\n')
      }`;
    }

    const output: GeneratedCode = {
      files,
      dependencies: Object.fromEntries(allDependencies),
      notes,
    };

    return {
      output,
      raw: JSON.stringify(output),
      attempts: 1,
      model: 'chunked-generation',
      provider: 'codegen-agent',
    };
  }


  /**
   * Detect cycles in the dependency graph using DFS
   * Returns the cycle path if found, null otherwise
   */
  private detectCycles(fileList: FileSpec[]): string[] | null {
    const graph = new Map<string, string[]>();
    const fileMap = new Map<string, FileSpec>();
    
    for (const fileSpec of fileList) {
      fileMap.set(fileSpec.path, fileSpec);
      graph.set(fileSpec.path, fileSpec.dependencies);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): string[] | null => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!fileMap.has(neighbor)) continue; // Skip external deps
        if (!visited.has(neighbor)) {
          const cycle = dfs(neighbor);
          if (cycle) return cycle;
        } else if (recStack.has(neighbor)) {
          // Found a cycle - return the cycle path
          const cycleStart = path.indexOf(neighbor);
          return path.slice(cycleStart).concat(neighbor);
        }
      }

      recStack.delete(node);
      path.pop();
      return null;
    }

    for (const fileSpec of fileList) {
      if (!visited.has(fileSpec.path)) {
        const cycle = dfs(fileSpec.path);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Topological sort using Kahn's algorithm (BFS)
   * Returns files in dependency order (dependencies first)
   */
  private topologicalSort(fileList: FileSpec[]): FileSpec[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const fileMap = new Map<string, FileSpec>();

    // Build graph and compute in-degrees
    for (const fileSpec of fileList) {
      fileMap.set(fileSpec.path, fileSpec);
      graph.set(fileSpec.path, fileSpec.dependencies.filter(d => fileMap.has(d)));
      inDegree.set(fileSpec.path, 0);
    }

    // Compute in-degrees
    for (const fileSpec of fileList) {
      for (const dep of fileSpec.dependencies) {
        if (inDegree.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      }
    }

    // Queue nodes with in-degree 0
    const queue: string[] = [];
    for (const fileSpec of fileList) {
      if (inDegree.get(fileSpec.path) === 0) {
        queue.push(fileSpec.path);
      }
    }

    const sorted: FileSpec[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      const fileSpec = fileMap.get(node)!;
      sorted.push(fileSpec);

      for (const neighbor of graph.get(node) || []) {
        const newInDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newInDegree);
        if (newInDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If not all nodes sorted, there's a cycle (should have been caught earlier)
    if (sorted.length !== fileList.length) {
      const unsorted = fileList.filter(f => !sorted.includes(f));
      throw new Error(`Cannot resolve dependencies for: ${unsorted.map(f => f.path).join(', ')}`);
    }

    return sorted;
  }
}