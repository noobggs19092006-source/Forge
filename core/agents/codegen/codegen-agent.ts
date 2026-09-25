import { z } from 'zod';
import { BaseAgent } from '../base-agent.js';
import type { AgentResult } from '../base-agent.js';
import { DesignTokensSchema, MotionPlanSchema, SitemapSchema } from '../../schemas/index.js';
import type { DesignTokens, MotionPlan, Sitemap } from '../../schemas/index.js';
import { formatA11yRulesForPrompt } from '../../knowledge/a11y-rules.js';
import { CodegenCheckpoint } from './codegen-checkpoint.js';
import type { PassResult } from './codegen-checkpoint.js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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

7. TYPESCRIPT SYNTAX CONSTRAINTS:
   - NEVER use optional chaining (?.) on the left-hand side of an assignment. This is a syntax error.
     WRONG: lenisRef.current?.style.opacity = '1';
     RIGHT: if (lenisRef.current) { lenisRef.current.style.opacity = '1'; }
   - NEVER use ?. before = in any expression. Use an explicit if-null-guard instead.
   - CSS module .module.css files are plain CSS — NEVER write JavaScript template literals (\${...}) in them.

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
        dependencies: ['hooks/useLenis.ts', 'components/Navbar.module.css'],
      });
      files.push({
        path: 'components/Navbar.module.css',
        type: 'style',
        purpose: 'Navbar CSS module styles',
        dependencies: [],
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

      // Add CSS module for page
      const pageCssModulePath = page.path === '/' ? 'app/page.module.css' : `app${page.path}/page.module.css`;
      pageDeps.push(pageCssModulePath);

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

      // Add CSS module file for the page
      files.push({
        path: pageCssModulePath,
        type: 'style',
        purpose: `${page.path === '/' ? 'Home' : page.path.split('/').pop()} page CSS module styles`,
        dependencies: [],
      });
    }

    // Section components for each unique section type across target pages
    const uniqueSections = new Map<string, { contentType: string; purpose: string }>();

    // Mapping for section IDs that don't follow the standard naming convention
    const sectionIdToComponentName: Record<string, string> = {
      'cta-section': 'Cta',
      // Add more mappings as needed
    };

    for (const page of targetPages) {
      for (const section of page.sections) {
        // Normalize section ID to a component name
        let componentName = section.id
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join('');

        // Apply known mappings for non-standard section IDs
        const sectionIdToComponentName: Record<string, string> = {
          'cta-section': 'Cta',
          // Add more mappings as needed
        };
        if (sectionIdToComponentName[section.id]) {
          componentName = sectionIdToComponentName[section.id]!;
        }

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

    // ── Computed import paths (exact, based on actual file depth) ─────────────────────────────
    // Count directory segments so we can derive the correct relative path regardless of nesting.
    // e.g. 'app/page.tsx' → depth 1 → '../'
    //      'app/about/[slug]/page.tsx' → depth 3 → '../../../'
    const normalizedFilePath = fileSpec.path.replace(/\\/g, '/');
    const fileDirParts = normalizedFilePath.split('/').slice(0, -1);
    const fileDepth = fileDirParts.length;
    const upToRoot = fileDepth === 0 ? './' : Array(fileDepth).fill('..').join('/') + '/';
    const relPathToLib = `${upToRoot}lib`;
    const relPathToComponents = `${upToRoot}components`;
    const relPathToHooks = `${upToRoot}hooks`;

    // ── Real available component names (from what's already been planned/generated) ──────────
    // Eliminates hallucinated names like "CtaSection" when the real file is "Cta.tsx".
    const availableComponentNames: string[] = [];
    for (const [genPath] of alreadyGenerated) {
      if (genPath.startsWith('components/') && genPath.endsWith('.tsx')) {
        const name = genPath.replace('components/', '').replace('.tsx', '');
        availableComponentNames.push(name);
      }
    }
    for (const depPath of fileSpec.dependencies) {
      if (depPath.startsWith('components/') && depPath.endsWith('.tsx')) {
        const name = depPath.replace('components/', '').replace('.tsx', '');
        if (!availableComponentNames.includes(name)) availableComponentNames.push(name);
      }
    }

    // SPECIFIC HERO.MODULE.CSS REQUIREMENTS (defined as constant to avoid template literal nesting issues)
    const HERO_MODULE_CSS_REQUIREMENTS =
      'SPECIFIC HERO.MODULE.CSS REQUIREMENTS:\n' +
      '- This is a CSS Module file for the Hero section component.\n' +
      '- Use ONLY CSS custom properties from globals.css (via var(--token-name)).\n' +
      '- DO NOT use any external image URLs (no url(\'...\'), no data URIs, no external links).\n' +
      '- FORGE DOES NOT GENERATE IMAGES. There are NO real image assets in this pipeline.\n' +
      '- When no real image asset exists (which is ALWAYS the case in this pipeline), use a CSS gradient background with the locked design tokens:\n' +
      '  .hero-background {\n' +
      '    background: linear-gradient(135deg, var(--primary-dark), var(--primary-light));\n' +
      '    position: absolute;\n' +
      '    top: 0; left: 0; width: 100%; height: 100vh;\n' +
      '  }\n' +
      '- DO NOT use url(\'your-background-url.jpg\'), url(\'placeholder\'), url(\'insert-\'), url(\'TODO\'), data URIs, or ANY external image references.\n' +
      '- Use ONLY design tokens from globals.css: var(--primary-light), var(--primary-dark), var(--accent-light), var(--accent-dark), var(--surface-light), var(--surface-dark), var(--on-surface-light), var(--on-surface-dark).\n' +
      '- Use CSS gradients, solid colors, or CSS patterns -- NO external image references.\n' +
      '- Use var(--token-name) for ALL colors, spacing, typography.\n' +
      '- DO NOT use :root selector -- CSS Modules scope styles automatically.\n' +
      '- DO NOT invent variable names not in globals.css.\n' +
      '- The matching .tsx file (Hero.tsx) is already in your file list as a dependency -- write real, complete styles into this file, don\'t leave it as a stub.';

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
- EXACT import for LenisProvider: import LenisProvider from '${relPathToLib}/lenis-provider'
- EXACT import for GSAP config: import { gsapConfig } from '${relPathToLib}/gsap-config'
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
- Do NOT include turbopack config (Next.js 15.0.0 does not support it)
- Output a minimal valid config: module.exports = { outputFileTracingRoot: __dirname }
- Do NOT use path aliases like @/lib -- this is a CommonJS file, aliases only work in TypeScript/ES modules
- Do NOT include any import statements
- The content MUST be valid JavaScript with actual newlines (NOT escaped \\n in the output file)
- This is a plain JavaScript config file (NOT a React component). Do NOT include a 'use client' directive anywhere in this file -- it does not need one and including one will break the build.
` : ''}

${fileSpec.path === 'app/layout.tsx' ? `
SPECIFIC APP/LAYOUT.TSX REQUIREMENTS:
- CRITICAL: DO NOT OUTPUT RAW HTML. YOU MUST OUTPUT A TYPESCRIPT REACT MODULE. YOU MUST INCLUDE IMPORTS. YOU MUST EXPORT THE ROOTLAYOUT COMPONENT.
- YOU MUST INCLUDE: import './globals.css';
- Import global CSS as: import './globals.css' (NOT ../globals.css, NOT ../styles/globals.css - it is in the SAME directory)
- Import LenisProvider from '../lib/lenis-provider' (relative path from app/ to lib/)
- MUST NOT use 'use client' directive (this is a Server Component)
- NEVER use styled-jsx (e.g. <style jsx>). It is strictly forbidden in Server Components. If you need global styles, rely on the import of './globals.css'.
- Wrap children with LenisProvider EXACTLY ONCE (MUST be inside the <body> tag, do NOT wrap the <html> tag with LenisProvider)
- DO NOT import or use gsapConfig in layout.tsx. Only import LenisProvider.
- Set data-theme="dark" on html element for dark mode
- Use font-display: optional for Google Fonts (CLS = 0)
- TYPE the children prop: children: React.ReactNode (NOT implicit any)
  - DO NOT import any non-existent hooks or utilities like 'use-client-effect'. Only import what is strictly required.
  - MUST export default function RootLayout({ children }: { children: React.ReactNode })
  - MUST use default import: import LenisProvider from '${relPathToLib}/lenis-provider' (DO NOT use named import)
- DO NOT use CSS Modules in layout.tsx (there is no layout.module.css). Use plain className="..." strings or global CSS variables via var(--token-name) directly in className.
` : ''}

${fileSpec.path === 'app/page.tsx' ? `
SPECIFIC APP/PAGE.TSX REQUIREMENTS:
- page.tsx must NOT import or render LenisProvider — it is already provided once in app/layout.tsx and must never be duplicated.
- MUST start with 'use client' as a STRING LITERAL at the very top: 'use client' (WITH SINGLE QUOTES, on its own line).
- This file lives at: ${fileSpec.path}
- EXACT import path prefix for components (copy verbatim): import Hero from '${relPathToComponents}/Hero'
- DO NOT use '../lib', '@/lib', or any other path variant — use ONLY the exact path shown above.
${availableComponentNames.length > 0 ? `- AVAILABLE COMPONENTS (only import from this list — never invent a name not on it):
${availableComponentNames.map(n => `  * import ${n} from '${relPathToComponents}/${n}'`).join('\n')}` : ''}
- ONLY import and render section components that EXIST in the sitemap sections array (use the exact 'componentName' field)
- For the current sitemap, the sections are: ${JSON.stringify(input.sitemap.pages.flatMap(p => p.sections.map(s => ({ id: s.id, contentType: s.contentType, componentName: s.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') }))), null, 2)}
- DO NOT import Footer in page.tsx - Footer is rendered via layout.tsx
- Use proper semantic HTML structure: <main> wrapper, sections with IDs
- CRITICAL: page.tsx is a LEAF COMPONENT — it does NOT receive or render a 'children' prop. DO NOT write {children} here.
- CRITICAL: This file does NOT import a CSS module. NEVER reference \`styles\` in any form. Use plain string className values.
- CRITICAL: NEVER write a local implementation (const X = () => ...) of any component you have already imported — duplicate-identifier error.
- CRITICAL: page.tsx is a React component that RETURNS JSX. Output a valid function component:
  - CRITICAL: page.tsx is a React component that RETURNS JSX. Output a valid function component:
  export default function HomePage() {
    return (
      <LenisProvider>
        <main>
          <Hero id="hero" />
          <Cta id="cta-section" />
        </main>
      </LenisProvider>
    );
  }
- DO NOT wrap section components in extra section elements with IDs — the section components themselves accept an id prop and apply it to their root element. Pass the id directly to the component: Hero id="hero" />, NOT section id="hero" Hero id="hero" / section>.
- DO NOT write loose statements (like variable assignments, function calls) outside the component function.
- DO NOT write raw HTML/JSX directly at module scope — everything must be inside the return of the component function.
` : ''}

${fileSpec.path.match(/^app\/.+\/page\.tsx$/) ? `
SPECIFIC PAGE.TSX REQUIREMENTS (for nested pages under app/):
- MUST start with 'use client' as a STRING LITERAL at the very top: 'use client' (WITH SINGLE QUOTES, on its own line)
- This file lives at: ${fileSpec.path}
- EXACT import path prefix for components (copy verbatim): import ComponentName from '${relPathToComponents}/ComponentName'
- DO NOT use '../../lib', '../lib', '@/lib', or any other path — use ONLY the exact paths shown above for this file.
${availableComponentNames.length > 0 ? `- AVAILABLE COMPONENTS (you may ONLY import from this exact list — never invent a name not on it):
${availableComponentNames.map(n => `  * import ${n} from '${relPathToComponents}/${n}'`).join('\n')}` : ''}
- ONLY import and render section components that EXIST in the sitemap sections array for THIS page
- Import styles from './page.module.css' (the CSS module is in the SAME directory as this file)
- Use className={styles['class-name']} for all styled elements (bracket notation for kebab-case)
- Use proper semantic HTML structure: <main> wrapper, sections with IDs
- DO NOT import Footer - Footer is rendered via layout.tsx
- DO NOT include <script> tags in JSX
- CRITICAL: page.tsx is a LEAF COMPONENT — DO NOT write {children} here.
- CRITICAL: NEVER write a local implementation of any imported component — duplicate-identifier error.
- CRITICAL: DO NOT import LenisProvider in this file. LenisProvider is ALREADY applied in app/layout.tsx and wraps all pages globally. Importing or using it again here will cause duplicate context and TypeScript errors.
- CRITICAL: DO NOT import or call useLenis() in this file. Page-level files do not manage scroll — that is handled by section components.
- CRITICAL: DO NOT pass any props to LenisProvider (e.g., lenis={{...}} is WRONG). LenisProvider only accepts 'children'. Any other prop will cause a TypeScript build error.
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
- CRITICAL: Output ONLY the :root { ... } block (and any additional rules). Do NOT append any JavaScript, TypeScript, or module import text after the CSS. Do NOT write 'LenisProvider', 'gsapConfig', 'import', or any JS identifier outside a CSS rule. Any non-CSS text after the closing } will cause a build-breaking PostCSS syntax error.
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

${fileSpec.path.match(/^app\/.*\/page\.module\.css$/) ? `
SPECIFIC PAGE.MODULE.CSS REQUIREMENTS (for all pages under app/):
- CSS Module file for page component
- Use CSS custom properties from design tokens (use ONLY these exact variable names from globals.css):
  * Color: var(--primary-light), var(--primary-dark), var(--accent-light), var(--accent-dark) -- NO other color variables
  * Spacing: var(--base-unit), var(--md), var(--lg), etc. -- use EXACT spacing token names from globals.css
  * Typography: var(--font-text-family), var(--clamp-*), var(--line-height-*)
- Use var() for all design token references
- Clean, accessible styling
- DO NOT use :root selector -- CSS Modules scope styles automatically, use class selectors instead
- DO NOT invent variable names like --surface, --on-surface -- they do not exist in globals.css
` : ''}

${fileSpec.path === 'components/Contact.tsx' ? `
SPECIFIC CONTACT.TSX REQUIREMENTS:
- MUST start with 'use client;' as a STRING LITERAL at the very top
- Import globals.css as: import '${upToRoot}app/globals.css'
- Import LenisProvider from '${relPathToLib}/lenis-provider'
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
import '${upToRoot}app/globals.css';
import { useLenis } from '${relPathToHooks}/useLenis';
import useReducedMotion from '${relPathToHooks}/useReducedMotion';
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

CRITICAL RULES:
- 'use client'; is a STRING on line 1 — NOT a comment (// use client is WRONG)
- import styles from './Hero.module.css' MUST be present (line 2)
- Use className={styles.heroContainer}, className={styles.heroTitle} etc. — NOT className="heroContainer"
- useReducedMotion is a DEFAULT import (no curly braces): import useReducedMotion from '${relPathToHooks}/useReducedMotion'
- useReducedMotion RETURNS A BOOLEAN, NOT AN ARRAY: const prefersReducedMotion = useReducedMotion(); (NOT const [isReducedMotion] = useReducedMotion())
- useLenis is a NAMED import (with curly braces): import { useLenis } from '${relPathToHooks}/useLenis'
- Use gsapConfig.defaultDuration, gsapConfig.defaultEasing, gsapConfig.staggerInterval for animation values (imported via section component requirements below)
- Export default Hero component at the bottom
- ALWAYS declare an interface for props (e.g., interface Props { id?: string }) and accept id in component signature
- Apply the id prop to the root element: <div className={styles.heroContainer} id={id}>
- CRITICAL: Lenis easing must be a FUNCTION, not a string. Use gsap.parseEase(gsapConfig.defaultEasing) or define a custom easing function. NEVER pass gsapConfig.defaultEasing directly to Lenis — it expects a function, not a string.
` : ''}

${fileSpec.path === 'components/Hero.module.css' ? HERO_MODULE_CSS_REQUIREMENTS : ''}

${fileSpec.path.endsWith('postcss.config.js') ? `
SPECIFIC POSTCSS.CONFIG.JS REQUIREMENTS:
- CRITICAL: Next.js 15 requires plugins to be provided as an object string mapping, NOT an array of require() calls!
  - MUST format exactly like this: module.exports = { plugins: { 'postcss-import': {}, 'tailwindcss': {}, 'autoprefixer': {}, 'postcss-nested': {} } };
  - Use CommonJS module.exports format
- Include plugins: postcss-import, tailwindcss, autoprefixer, postcss-nested (for @layer support)
- Configure postcss-nested to enable @layer and nesting
- Output a minimal valid config
- This is a plain JavaScript config file (NOT a React component). Do NOT include a 'use client' directive anywhere in this file -- it does not need one and including one will break the build.
` : ''}

${fileSpec.path === 'lib/gsap-config.ts' ? `
SPECIFIC GSAP-CONFIG.TS REQUIREMENTS:
- Import: import { gsap } from 'gsap'; import { ScrollTrigger } from 'gsap/ScrollTrigger'; (NOT 'gsap/all', NOT '../lenis-provider')
- Register ScrollTrigger plugin: gsap.registerPlugin(ScrollTrigger)
  - DO NOT USE ScrollTrigger.register(). It does not exist. Only use gsap.registerPlugin(ScrollTrigger).
- Export motion constants: defaultEasing, defaultDuration, staggerInterval
- Export a config object: export const gsapConfig = { defaultEasing, defaultDuration, staggerInterval };
- Export setupGSAP() function that configures GSAP and ScrollTrigger. Use ONLY valid GSAP APIs: gsap.defaults({ ease: defaultEasing, duration: defaultDuration }) and gsap.matchMedia().add("(prefers-reduced-motion: reduce)", () => { gsap.ticker.fps(1); })
- This is a plain TypeScript utility/config file (NOT a React component). Do NOT include a 'use client' directive anywhere in this file -- it does not need one and including one (in any form, quoted or not) will break the build.
- DO NOT export any JSX-returning component from this file — this is a .ts file (NOT .tsx) and JSX is illegal here. Only export plain constants and functions.
- DO NOT define GSAPInitializer or any React component in this file.
` : ''}

${fileSpec.type === 'section' ? `
SPECIFIC SECTION COMPONENT REQUIREMENTS (applies to ALL section components in components/):
- Section components are CHILD components rendered by page.tsx — they are NOT page components themselves.
- DO NOT import or use LenisProvider in section components — LenisProvider is ONLY used in app/layout.tsx to wrap the entire app.
- DO NOT create new Lenis instances in section components — use the shared Lenis instance via useLenis() hook if needed.
- Section components should focus on their own animation choreography using GSAP/ScrollTrigger.
- Use the shared Lenis instance from context via useLenis() hook (import { useLenis } from '${relPathToHooks}/useLenis').
- NEVER wrap section content in <LenisProvider> — this causes duplicate Lenis instances and breaks scroll.
- ScrollTrigger callbacks must use this EXACT template structure — copy verbatim and only change the selector/target and animation properties:

  ScrollTrigger.create({
    trigger: '.your-selector',
    start: 'top center',
    end: 'bottom top',
    onEnter: () => gsap.to('.your-target', { opacity: 1, duration: gsapConfig.defaultDuration }),
    onLeaveBack: () => gsap.to('.your-target', { opacity: 0, duration: gsapConfig.defaultDuration }),
  });

  Do NOT add extra closing parentheses or braces beyond this exact structure. The pattern is:
  - onEnter: () => gsap.to('.target', { ... })
  - onLeaveBack: () => gsap.to('.target', { ... })
  - No extra closing parentheses or braces after the gsap.to call.
  - Do NOT write: onEnter: () => { gsap.to(...); }) or onEnter: () => { gsap.to(...); });
- CRITICAL: The trigger value must be a SINGLE STRING without line breaks. NEVER write:
  trigger: '.hero-title,
  .hero-subtitle'
  ALWAYS write: trigger: '.hero-title, .hero-subtitle'
- ALWAYS declare an interface for props (e.g., interface Props { id?: string }) and accept id in component signature.
` : ''}

${fileSpec.path === 'components/Navbar.tsx' ? `
SPECIFIC NAVBAR.TSX REQUIREMENTS:
- MUST start with 'use client' as a STRING LITERAL at the very top: 'use client' (WITH SINGLE QUOTES, on its own line)
- Import usePathname from 'next/navigation': import { usePathname } from 'next/navigation';
- DO NOT import LenisProvider — Navbar is a section component, NOT a page. LenisProvider is only in app/layout.tsx
- DO NOT import gsapConfig — Navbar does not need GSAP animation config
- Use CSS Modules: import styles from './Navbar.module.css' (DO NOT include CSS in this file)
- Use className={styles['navbar']}, className={styles['navbar__logo']} etc. — bracket notation for kebab-case
- Export default Navbar component
` : ''}

${fileSpec.path === 'components/Cta.tsx' ? `
SPECIFIC CTA.TSX REQUIREMENTS:
- MUST start with 'use client' as a STRING LITERAL at the very top: 'use client' (WITH SINGLE QUOTES, on its own line)
- Cta is a SECTION component — it is rendered by page.tsx, NOT a page itself.
- DO NOT import LenisProvider — LenisProvider is ONLY used in app/layout.tsx to wrap the entire app.
- DO NOT wrap Cta content in <LenisProvider> — this causes duplicate Lenis instances and breaks scroll.
- Use the shared Lenis instance from context via useLenis() hook: import { useLenis } from '${relPathToHooks}/useLenis'
- Use CSS Modules: import styles from './Cta.module.css'
- Use className={styles['cta-section']}, className={styles['cta-button']} etc. — bracket notation
- Import gsap from 'gsap' for animations
- Import { ScrollTrigger } from 'gsap/ScrollTrigger' for scroll animations
- Use gsapConfig.defaultDuration, gsapConfig.defaultEasing, gsapConfig.staggerInterval for animation values (imported via section component requirements below)
- In useEffect cleanup, use: return () => ScrollTrigger.killAll(); (NOT ScrollTrigger.kill)
- Export default Cta component
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
- CRITICAL SYNTAX: When attaching scroll event listeners, the call MUST close with \`});\` NOT \`};\`.
  Count your closing braces AND closing parens — \`lenis.on(\` opens a function call that needs a matching \`)\`:
  CORRECT:
    lenis.on('scroll', ({ scroll }) => {
      // handler body
    });   // <-- closing } for the arrow-function body, then ) for lenis.on(, then ;
  WRONG:
    lenis.on('scroll', ({ scroll }) => {
      // handler body
    };    // <-- missing the ) — this is a syntax error
- CRITICAL: The component MUST be a plain function declaration, NOT an arrow function assigned to a variable. DO NOT write: const LenisProvider: React.FC<...> = ({ children }) => { ... });  This is invalid syntax — the trailing  }); is a syntax error.
  CORRECT:
    function LenisProvider({ children }: LenisProviderProps) {
      // ... body ...
      return (
        <LenisContext.Provider value={lenis}>
          <div style={{ height: '100vh', overflowY: 'auto' }}>{children}</div>
        </LenisContext.Provider>
      );
    }
  WRONG:
    const LenisProvider: React.FC<LenisProviderProps> = ({ children }) => {
      // ... body ...
      return (...);
    });  // <-- SYNTAX ERROR - extra ) and ;
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
- This file MUST import LenisContext from the lenis-provider. Without this import, you will get "Cannot find name 'LenisContext'" build errors.
- Output EXACTLY this content (copy verbatim, do not add or remove anything):

import { useContext } from 'react';
import { LenisContext } from '../lib/lenis-provider';

export const useLenis = () => {
  return useContext(LenisContext);
};

- DO NOT omit the import of LenisContext. DO NOT add other imports. DO NOT change the export style.
- IMPORTANT: useLenis() returns the Lenis instance directly (type: Lenis | null). It does NOT return an object.
  Callers must write:  const lenis = useLenis();        ← CORRECT
  NOT:                 const { lenis } = useLenis();    ← WRONG - will cause a TypeScript build error
` : ''}

${fileSpec.path === 'tsconfig.json' ? `
SPECIFIC TSCONFIG.JSON REQUIREMENTS:
  - MUST set lib array EXACTLY as: ["dom", "dom.iterable", "esnext"] (do not include "react" or "jsx")
- Use standard Next.js TypeScript config
- Include path aliases: "@/*": ["./*"]
- strict: true, noEmit: true, esModuleInterop: true
- module: "esnext", moduleResolution: "bundler", jsx: "preserve"
- CRITICAL: DO NOT use "jsxImportSource". You MUST use EXACTLY "jsx": "preserve".
- Include plugins for next
- include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
- exclude: ["node_modules"]
- Do NOT include "extends": "next/tsconfig.json" (may not exist in generated project)
- Output a COMPLETE valid JSON object
- This is a plain JSON config file (NOT a React component). Do NOT include a 'use client' directive anywhere in this file -- it does not need one and including one will break the build.
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
        '- IMPORTANT: For all imports from lib or hooks directories, use the EXACT relative path (do NOT use hardcoded ../ or ../../).\n' +
        '- IMPORT ScrollTrigger CORRECTLY: import { ScrollTrigger } from \'gsap/ScrollTrigger\';\n' +
        `- IMPORT useReducedMotion CORRECTLY: import useReducedMotion from '${relPathToHooks}/useReducedMotion'; (It is a DEFAULT export, do NOT use curly braces)\n` +
        `- IMPORT useLenis CORRECTLY: import { useLenis } from '${relPathToHooks}/useLenis'; (It is a NAMED export, do NOT import it from lenis-provider)\n` +
        `- IMPORT gsapConfig CORRECTLY: import { gsapConfig } from '${relPathToLib}/gsap-config'; (Use gsapConfig.defaultDuration, gsapConfig.defaultEasing, gsapConfig.staggerInterval for animation values)\n` +
        '- ALWAYS include ALL imports used in the file! If you use lenis, you MUST import it!\n' +
        '- For React hooks (useEffect, useRef, useState), ALWAYS import them explicitly: import React, { useEffect, useRef, useState } from \'react\';\n' +
        '- If you use the Lenis type in TypeScript (e.g., useRef<Lenis | null>), you MUST import it: import type Lenis from \'lenis\';\n' +
        '- If you instantiate Lenis (e.g., new Lenis({...})), use a REGULAR import: import Lenis from \'lenis\'; (NOT import type)\n' +

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

    // Compute component styling requirement text (for components with CSS modules like Navbar, Footer)
    const componentStyling = (fileSpec.type === 'component' && (fileSpec.path === 'components/Navbar.tsx' || fileSpec.path === 'components/Footer.tsx'))
      ? ('GENERAL COMPONENT STYLING REQUIREMENT (applies to components with CSS modules):\n' +
        '- CRITICAL: This file MUST start with \'use client\'; on line 1 (as a string literal, NOT a comment). It uses Next.js client-side hooks (e.g. usePathname) which require this directive.\n' +
        '- Use CSS Modules for all component-scoped styling: import styles from \'./' +
        fileSpec.path.replace('components/', '').replace('.tsx', '') + '.module.css\'\n' +
        '- Do NOT use inline styles, styled-jsx, or <style jsx> tags\n' +
        '- IMPORTANT: For all imports from lib or hooks directories, use the EXACT relative path (do NOT use hardcoded ../ or ../../).\n' +
        '- ALWAYS include ALL imports used in the file!\n' +
        '- For React hooks (useEffect, useRef, useState), ALWAYS import them explicitly: import React, { useEffect, useRef, useState } from \'react\';\n' +
        '- DO NOT import lenisInstance or any named export from lenis-provider other than LenisContext. lenis-provider only exports LenisContext (named) and LenisProvider (default).\n' +

        '- PROPS: ALWAYS declare an interface for your props (e.g. interface Props { id?: string }) and accept id in your component signature.\n' +
        '- CRITICAL RULE ABOUT IMPORTS: You MUST NOT write any duplicate imports. If you imported react hooks at the top, DO NOT write \'import { useEffect } from "react";\' again! DO NOT write \'import gsap from "gsap";\' again! ONLY ONE IMPORT PER MODULE IS ALLOWED.\n' +

        '- Use className={styles.yourClassName} for every styled element. CRITICAL: For CSS Modules with dashed class names, you MUST use bracket notation. Dot notation (styles.some-dashed-class) is INVALID TypeScript and will break the build. Example:\n' +
        '  ❌ <div className={styles.nav-link}>\n' +
        '  ✅ <div className={styles[\'nav-link\']}>\n' +
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
      // POST-PROCESS: Fix quoted var() values in CSS modules
      // Model outputs: font-family: 'var(--font-text-family)';  -> should be: font-family: var(--font-text-family);
      // This fix must be applied to the generated content later
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
        '⚠️ CRITICAL: This is a plain CSS file (.module.css). It is NOT styled-components, NOT CSS-in-JS, NOT a template literal. DO NOT write ${...} expressions anywhere in this file. CSS does not support JavaScript template literals. Writing `${props => ...}` or any `${...}` in a .css file is a hard syntax error that will crash the build.\n\n' +
        'VALID: padding: var(--md);\n' +
        'VALID: color: var(--primary-light);\n' +
        'INVALID: padding: ${props => props.theme.spacing.md};  ← THIS WILL BREAK THE BUILD\n' +
        'INVALID: color: ${({ theme }) => theme.colors.primary}; ← THIS WILL BREAK THE BUILD\n\n' +
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
      { role: 'user' as const, content: singleFilePrompt + sectionStyling + componentStyling + cssModuleStyling + outputFormat },
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
      // Remove turbopack config (Next.js 15.0.0 doesn't support it)
      validation.data.content = validation.data.content.replace(/turbopack:\s*\{[^}]+\},\s*/g, '');
      validation.data.content = validation.data.content.replace(/,\s*turbopack:\s*\{[^}]+\}/g, '');
      validation.data.content = validation.data.content.replace(/turbopack:\s*\{[^}]+\}/g, '');
      // The experimental.turbo key is invalid in Next.js 15+; removed forced injection.
    }

    // Fix globals.css - normalize negative OKLCH angles to positive (0-360)
    if (validation.data && validation.data.content && fileSpec.path === 'app/globals.css') {
      validation.data.content = validation.data.content.replace(
        /oklch\(([^)]+)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\)/g,
        (match, lightness, chroma, hue) => {
          const h = parseFloat(hue);
          const normalizedHue = h < 0 ? h + 360 : h;
          return `oklch(${lightness} ${chroma} ${normalizedHue})`;
        }
      );
    }

    // Fix globals.css - strip any non-CSS lines (JS identifier text) that the model appends after the :root block.
    // e.g. the model sometimes appends " LenisProvider, gsapConfig" at the end which is not valid CSS.
    if (validation.data && validation.data.content && fileSpec.path === 'app/globals.css') {
      validation.data.content = validation.data.content
        .split('\n')
        .filter(line => {
          const trimmed = line.trim();
          if (!trimmed) return true; // keep blank lines
          // Valid CSS lines: contain ':' (property), '{', '}', start with '--', '@', '/*', '*', or are empty
          const isValidCss = /[:{}\/\*@]/.test(trimmed) || trimmed.startsWith('--') || trimmed === '';
          // Reject lines that look like bare JS identifiers (letters/commas/spaces only, no CSS chars)
          const looksLikeJs = /^[A-Za-z_$][\w$,\s]*$/.test(trimmed);
          return isValidCss || !looksLikeJs;
        })
        .join('\n');
    }

    // Fix globals.css - strip quotes wrapped around var(...) expressions in custom property
    // values. CSS custom property values must never be quoted -- the model sometimes wraps
    // them anyway (e.g. --clamp-headline: 'var(--clamp-base)';), which breaks every consumer
    // of that variable since the quoted string is treated as a literal, not an expression.
    if (validation.data && validation.data.content && fileSpec.path === 'app/globals.css') {
      validation.data.content = validation.data.content.replace(
        /(--[\w-]+\s*:\s*)["']([^"']*var\([^"']*)["']/g,
        '$1$2'
      );
    }

    // Hard override for hooks/useLenis.ts: the 7B model consistently ignores the verbatim
    // content instruction and omits the LenisContext import. Enforce it deterministically.
    if (validation.data && validation.data.content && fileSpec.path === 'hooks/useLenis.ts') {
      if (!validation.data.content.includes('LenisContext') || !validation.data.content.includes("from '../lib/lenis-provider'")) {
        validation.data.content = `import { useContext } from 'react';\nimport { LenisContext } from '../lib/lenis-provider';\n\nexport const useLenis = () => {\n  return useContext(LenisContext);\n};\n`;
      } else if (!validation.data.content.includes("from '../lib/lenis-provider'")) {
        // Fix wrong import path
        validation.data.content = validation.data.content.replace(
          /import\s+\{?\s*LenisContext\s*\}?\s+from\s+['"][^'"]+['"]/,
          "import { LenisContext } from '../lib/lenis-provider'"
        );
      }
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

    // Generic post-processing safety net: merge duplicate named imports from the same module path
    // e.g., two separate "import { gsapConfig } from '../lib/gsap-config'" and "import { gsapConfig, setupGSAP } from '../lib/gsap-config'"
    // become "import { gsapConfig, setupGSAP } from '../lib/gsap-config'"
    if (validation.data && validation.data.content && (fileSpec.path.endsWith('.tsx') || fileSpec.path.endsWith('.ts'))) {
      const importRegex = /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*$/gm;
      const importsByModule = new Map<string, Set<string>>();
      let match: RegExpExecArray | null;
      while ((match = importRegex.exec(validation.data.content)) !== null) {
        const namedImports = match[1]!.split(',').map(s => s.trim()).filter(Boolean);
        const modulePath = match[2]!;
        if (!importsByModule.has(modulePath)) {
          importsByModule.set(modulePath, new Set());
        }
        for (const ni of namedImports) {
          importsByModule.get(modulePath)!.add(ni);
        }
      }
      if (importsByModule.size > 0) {
        // Remove all named imports from these modules
        let content = validation.data.content;
        for (const modulePath of importsByModule.keys()) {
          content = content.replace(
            new RegExp(`^import\\s+\\{[^}]+\\}\\s+from\\s+['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];\\s*$`, 'gm'),
            ''
          );
        }
        // Re-insert merged imports at the top of the import block
        const mergedImports: string[] = [];
        for (const [modulePath, namedSet] of importsByModule.entries()) {
          const sortedNamed = Array.from(namedSet).sort();
          mergedImports.push(`import { ${sortedNamed.join(', ')} } from '${modulePath}';`);
        }
        // Find where to insert (after 'use client' if present, otherwise at start)
        let insertIdx = 0;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]?.trim().startsWith("'use client'") || lines[i]?.trim().startsWith('"use client"')) {
            insertIdx = i + 1;
            break;
          }
        }
        // If no 'use client', insert at first non-import line or at top
        if (insertIdx === 0) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i]?.trim().startsWith('import ')) {
              insertIdx = i;
            } else if (lines[i]?.trim() && insertIdx > 0) {
              break;
            }
          }
        }
        lines.splice(insertIdx, 0, ...mergedImports, '');
        validation.data.content = lines.join('\n').replace(/\n{3,}/g, '\n\n');
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

      // Fix 3: Auto-inject 'use client' for .tsx component files that use client-side hooks
      // but omit the directive (e.g. Navbar using usePathname without 'use client').
      const isClientComponent = fileSpec.path.endsWith('.tsx') &&
        (validation.data.content.includes('usePathname') ||
          validation.data.content.includes('useRouter') ||
          validation.data.content.includes('useSearchParams') ||
          validation.data.content.includes('useState') ||
          validation.data.content.includes('useEffect') ||
          validation.data.content.includes('useRef'));
      if (isClientComponent && !validation.data.content.includes("'use client'") && !validation.data.content.includes('"use client"')) {
        validation.data.content = "'use client';\n" + validation.data.content.trimStart();
      }

      // Fix styled-jsx hallucinations
      validation.data.content = validation.data.content.replace(/<style\s+jsx[\s\S]*?<\/style>/g, "");
      validation.data.content = validation.data.content.replace(/import\s+.*?\s+from\s+['"]styled-jsx.*?['"];?/g, "");

      // Fix 2: Strip JSX-returning GSAPInitializer from gsap-config.ts
      // A .ts file cannot contain JSX — the model sometimes hallucinates this component despite the prompt.
      if (fileSpec.path === 'lib/gsap-config.ts') {
        validation.data.content = validation.data.content
          // Remove the whole GSAPInitializer function body
          .replace(/const\s+GSAPInitializer[^=]*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\};?\n?/g, '')
          .replace(/function\s+GSAPInitializer[^{]*\{[\s\S]*?^\}/gm, '')
          // Remove any JSX lines that remain (e.g. return <React.Fragment>...)
          .replace(/return\s+<[\s\S]*?>;?\n?/g, '')
          // Remove export default GSAPInitializer
          .replace(/export\s+default\s+GSAPInitializer;?\n?/g, '')
          // Remove React import if it was only there for GSAPInitializer
          .replace(/import\s+React(?:,\s*\{[^}]*\})?\s+from\s+'react';?\n?/g, '')
          // STRIP ANY 'use client' DIRECTIVE IN ANY FORM (quoted, unquoted, commented, anywhere in file)
          // This file is a plain TS utility -- it must NEVER have a 'use client' directive
          .replace(/^\s*['"]?use client['"]?\s*;?\s*\n/gm, '');
      }

      // STRIP ANY 'use client' DIRECTIVE from other non-component config files
      // These are plain config/utility files that must NEVER have a 'use client' directive
      const nonComponentConfigFiles = [
        'tailwind.config.ts',
        'postcss.config.js',
        'next.config.js',
        'tsconfig.json',
        'package.json',
      ];
      if (nonComponentConfigFiles.some(f => fileSpec.path === f || fileSpec.path.endsWith('/' + f))) {
        validation.data.content = validation.data.content.replace(
          /^\s*['"]?use client['"]?\s*;?\s*\n/gm,
          ''
        );
      }
    }


    // Fix layout.tsx: strip CSS module refs and de-duplicate LenisProvider
    // regardless of whether the model wrapped everything in raw HTML or produced
    // an otherwise-valid component -- these issues can occur independently.
    if (validation.data && validation.data.content && fileSpec.path === 'app/layout.tsx') {
      validation.data.content = validation.data.content.replace(
        /<LenisProvider[^>]*>([\s\S]*?)<LenisProvider[^>]*>([\s\S]*?)<\/LenisProvider>([\s\S]*?)<\/LenisProvider>/gi,
        '<LenisProvider>$1$2$3</LenisProvider>'
      );
      validation.data.content = validation.data.content.replace(/className=\{styles\['([^']+)'\]\}/g, "className='$1'");
      validation.data.content = validation.data.content.replace(/className=\{styles\.([^}]+)\}/g, "className='$1'");
      validation.data.content = validation.data.content.replace(/import\s+styles\s+from\s+['"][^'"]+\.module\.css['"];?\n?/g, '');
    }

    // Fix layout.tsx raw HTML hallucination (full rebuild -- only when the model
    // skipped a React wrapper entirely and emitted a literal <html> document)
    if (validation.data && validation.data.content && fileSpec.path === 'app/layout.tsx') {
      const content = validation.data.content.trim();
      if (content.startsWith('<html') || content.includes('\n<html') || /import\s+Lenis\s+from\s+['"]\.\.\/lib\/lenis-provider['"]/.test(content)) {
        // Extract body content if present
        let innerContent = content;
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
          innerContent = bodyMatch[1] || '';
        } else {
          innerContent = content.replace(/<\/?(html|head|body|meta|title|link)[^>]*>/gi, "");
        }

        // Remove any existing LenisProvider wrapper from the model's hallucination
        innerContent = innerContent.replace(/<LenisProvider>([\s\S]*?)<\/LenisProvider>/gi, '$1');

        // Remove any CSS module references (layout.tsx doesn't have a CSS module)
        innerContent = innerContent.replace(/className=\{styles\['([^']+)'\]\}/g, "className='$1'");
        innerContent = innerContent.replace(/className=\{styles\.([^}]+)\}/g, "className='$1'");
        innerContent = innerContent.replace(/import\s+styles\s+from\s+['"][^'"]+\.module\.css['"];?\n?/g, '');

        validation.data.content = `import './globals.css';
import LenisProvider from '../lib/lenis-provider';

export const metadata = {
  title: 'Portfolio',
  description: 'Portfolio',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=optional" rel="stylesheet" />
      </head>
      <body>
        <LenisProvider>
          ${innerContent.trim() || '{children}'}
        </LenisProvider>
      </body>
    </html>
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

    // Fix CSS var() syntax in JS objects - all property values in JS objects
    if (validation.data && validation.data.content) {
      validation.data.content = validation.data.content.replace(/(\w+:\s*)var\((.*?)\)/g, "$1'var($2)'");
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
          innerContent = bodyMatch[1] || '';
        } else {
          innerContent = content.replace(/<\/?(html|head|body|meta|title|link)[^>]*>/gi, "");
        }

        const componentName = fileSpec.path === 'app/page.tsx' ? 'HomePage' : (fileSpec.path.split('/').slice(-2)[0] || 'Unknown') + 'Page';
        const safeName = componentName.charAt(0).toUpperCase() + componentName.slice(1).replace(/[^a-zA-Z0-9]/g, '');
        const isRootPage = fileSpec.path === 'app/page.tsx';
        const libImportPath = isRootPage ? '../lib/lenis-provider' : '../../lib/lenis-provider';
        const componentsImportPath = isRootPage ? '../components' : '../../components';
        const stylesImport = isRootPage ? '' : "\nimport styles from './page.module.css';";

        validation.data.content = `'use client';
import React from 'react';
import LenisProvider from '${libImportPath}';${stylesImport}

export default function ${safeName}() {
  return (
    <LenisProvider>
      <main>
        ${innerContent}
      </main>
    </LenisProvider>
  );
}
`;
      }
    }




    // BULLETPROOF DUPLICATE IMPORTS FIX
    if (validation.data && validation.data.content && (fileSpec.path.endsWith('.tsx') || fileSpec.path.endsWith('.ts'))) {
      // Fix TS arithmetic errors on CSS Modules: replace styles.some-kebab-case with styles['some-kebab-case']
      validation.data.content = validation.data.content.replace(/styles\.([a-zA-Z0-9_]+-[a-zA-Z0-9_-]+)/g, "styles['$1']");

      let lines = validation.data.content.split('\n');

      // Check for combined React imports
      const hasCombinedReact = lines.some(l => l.includes('import React') || l.includes('useRef') || l.includes('useState'));
      if (hasCombinedReact) {
        lines = lines.filter(l => !l.match(/import\s+\{\s*useEffect\s*\}\s+from\s+["']react["']/));
      }

      // Check for duplicate GSAP
      const hasDefaultGsap = lines.some(l => l.match(/import\s+gsap\s+from\s+["']gsap["']/));
      if (hasDefaultGsap) {
        lines = lines.filter(l => !l.match(/import\s+\{\s*gsap\s*\}\s+from\s+["']gsap["']/));
      }

      let content = lines.join('\n');


      // React JSX attribute fixes
      content = content.replace(/<meta charset=/g, '<meta charSet=');

      content = content.replace(/crossorigin/gi, 'crossOrigin');
      content = content.replace(/crossOrigin(?![=a-zA-Z0-9])/g, 'crossOrigin="anonymous"');

      // Fix JSX syntax errors: missing closing brackets on elements
      // e.g., <section className={styles['contact-section']}) -> <section className={styles['contact-section']}>
      content = content.replace(/(\s+)(\w+)=(\{[^}]+\})\)(\s*)>/g, '$1$2=$3$4>');
      // Fix missing > on JSX elements
      content = content.replace(/(\s+)(\w+)=(\{[^}]+\})\)(\s*)/g, '$1$2=$3$4');

      // Remove <script> tags from JSX (not valid in React)
      content = content.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '');
      content = content.replace(/<script[^>]*\/>/g, '');

      // Fix malformed self-closing tags
      content = content.replace(/<(\w+)([^>]*)\/ \/>/g, '<$1$2 />');
      content = content.replace(new RegExp('<(\\\\w+)([^>]*)\\\\/>', 'g'), '<$1$2 />');

      // Fix stray closing parentheses after JSX attributes
      content = content.replace(/className=\{([^}]+)\}\)(\s*)>/g, "className={$1}$2>");
      content = content.replace(/className=\{([^}]+)\}\)(\s*)/g, "className={$1}$2");

      // Strip hallucinated Lenis import from lenis-provider
      // Strip ALL hallucinated named imports of Lenis/useLenis from lenis-provider
      content = content.replace(/import\s*\{[^}]*(?:Lenis|useLenis)[^}]*\}\s*from\s*['"](?:\.\.\/)+lib\/lenis-provider['"];?\n?/g, '');
      content = content.replace(/,\s*\{[^}]*(?:Lenis|useLenis)[^}]*\}\s*(from\s*['"](?:\.\.\/)+lib\/lenis-provider['"])/g, ' $1');

      // Fix lenis.on callback missing closing paren: `};` -> `});`
      // The model sometimes forgets the `)` that closes the lenis.on( call, producing a syntax
      // error. Repair any `  };` line that follows a lenis.on arrow-function body.
      if (fileSpec.path === 'lib/lenis-provider.tsx') {
        content = content.replace(
          /(lenis\.on\([^)]*,\s*\([^)]*\)\s*=>\s*\{[\s\S]*?)\n(\s*)\};/g,
          '$1\n$2});'
        );
      }

      // Fix useEffect return function syntax in lenis-provider.tsx
      // Model generates: return () => { ... });  (extra paren)
      // Should be:       return () => { ... };    (semicolon, no extra paren)
      if (fileSpec.path === 'lib/lenis-provider.tsx') {
        content = content.replace(
          /return\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);/g,
          'return () => {$1};'
        );
      }

      // Fix gsap.to syntax error in lenis-provider.tsx
      // Model sometimes writes: gsap.to(window, { duration: 0.6, scrollTo: scroll };
      // Should be: gsap.to(window, { duration: 0.6, scrollTo: scroll });
      if (fileSpec.path === 'lib/lenis-provider.tsx') {
        content = content.replace(
          /gsap\.to\(([^,]+),\s*\{([^}]+)\}\s*;/g,
          'gsap.to($1, {$2});'
        );
      }

      // Fix window.addEventListener missing closing paren: `...true };` -> `...true });`
      // Model sometimes writes: window.addEventListener('scroll', handler, { passive: true };
      // Should be: window.addEventListener('scroll', handler, { passive: true });
      if (fileSpec.path === 'lib/lenis-provider.tsx') {
        content = content.replace(
          /window\.addEventListener\(([^)]+),\s*\{[^}]+passive\s*:\s*true\s*\};\s*$/gm,
          (match) => match.replace(/;\s*$/, ');')
        );
      }

      // Fix lenis.on('scroll', ...) missing closing paren: `};` -> `});`
      if (fileSpec.path === 'lib/lenis-provider.tsx') {
        let onIndex = content.indexOf("lenis.on('scroll'");
        if (onIndex === -1) onIndex = content.indexOf('lenis.on("scroll"');
        if (onIndex !== -1) {
          let statementEnd = -1;
          let parens = 0;
          let foundArrow = -1;
          for (let i = onIndex; i < content.length; i++) {
            if (foundArrow === -1 && i - onIndex < 150) {
              if (content.substring(i, i + 2) === '=>') foundArrow = i;
            }
            if (content[i] === '(') parens++;
            else if (content[i] === ')') {
              parens--;
              if (parens === 0) { statementEnd = i; break; }
            } else if (content[i] === ';' && parens === 0) {
              statementEnd = i; break;
            }
          }
          if (statementEnd === -1) statementEnd = content.length;

          if (foundArrow !== -1 && foundArrow < statementEnd) {
            const blockStart = content.indexOf('{', foundArrow);
            if (blockStart !== -1 && blockStart - foundArrow < 50 && blockStart < statementEnd) {
              let braces = 0;
              let blockEnd = -1;
              for (let i = blockStart; i < content.length; i++) {
                if (content[i] === '{') braces++;
                else if (content[i] === '}') {
                  braces--;
                  if (braces === 0) { blockEnd = i; break; }
                }
              }
              if (blockEnd !== -1) {
                const afterBlock = content.substring(blockEnd + 1, blockEnd + 10);
                if (afterBlock.match(/^\s*;/)) {
                  content = content.substring(0, blockEnd + 1) + ')' + content.substring(blockEnd + 1);
                }
              }
            }
          }
        }
      }

      // Fix GSAP numeric values with CSS units - they must be strings in object syntax
      // e.g., x: -2rem -> x: '-2rem', y: 100px -> y: '100px'
      if (fileSpec.path.endsWith('.tsx')) {
        content = content.replace(
          /\b(x|y|rotation|scaleX|scaleY|xPercent|yPercent)\s*:\s*(-?\d+(?:\.\d+)?)(rem|px|%|em|vh|vw)\b/g,
          "$1: '$2$3'"
        );
      }

      // Strip hallucinated module-scope useRef in lib/lenis-provider.tsx (caused by previous missingRef regex)
      if (fileSpec.path === 'lib/lenis-provider.tsx') {
        const componentMatch = content.match(/function\s+LenisProvider|const\s+LenisProvider\s*=/);
        if (componentMatch && componentMatch.index !== undefined) {
          const before = content.substring(0, componentMatch.index);
          const after = content.substring(componentMatch.index);
          content = before.replace(/^\s*const\s+\w+Ref\s*=\s*useRef.*?(?:;|\n)/gm, '') + after;
        } else {
          content = content.replace(/^\s*const\s+\w+Ref\s*=\s*useRef.*?(?:;|\n)/gm, '');
        }
      }

      // Remove redundant LenisProvider wrapper from app/page.tsx
      if (fileSpec.path === 'app/page.tsx') {
        content = content.replace(/import\s+LenisProvider\s+from[^;]+;?\n?/g, '');
        content = content.replace(/<\/?LenisProvider[^>]*>/g, '');
      }

      // Fix bare type annotations leaking out as statements (e.g. staggerInterval: number;)
      if (fileSpec.path.endsWith('.ts') || fileSpec.path.endsWith('.tsx')) {
        content = content.replace(/^(\s*)staggerInterval\s*:\s*number\s*;/gm, '$1const staggerInterval = 0.08;');
        // Generic fallback for any other bare identifier: type;
        content = content.replace(/^(\s*)[a-zA-Z_$][\w$]*\s*:\s*(?:string|number|boolean)\s*;/gm, '');
      }

      // Convert hallucinatory default imports to named imports
      content = content.replace(/import\s+useLenis\s+from\s+['"](?:\.\.\/)+hooks\/useLenis['"];?\n?/g, "import { useLenis } from '../hooks/useLenis';\n");
      content = content.replace(/import\s+ScrollTrigger\s+from\s+['"]gsap\/ScrollTrigger['"];?\n?/g, "import { ScrollTrigger } from 'gsap/ScrollTrigger';\n");
      content = content.replace(/import\s+gsapConfig\s+from\s+['"](?:\.\.\/)+lib\/gsap-config['"];?\n?/g, "import { gsapConfig } from '../lib/gsap-config';\n");

      // Fix 1: strip wrong-path useLenis imports (e.g. '../../hooks/useLenis' from a component)
      // and any merged import that combines useLenis with other hooks from the wrong path.
      // The correct path from components/ is '../hooks/useLenis'.
      content = content.replace(
        /import\s*\{[^}]*useLenis[^}]*\}\s*from\s*['"](?!\.\.\/hooks\/useLenis)[^'"]+['"];?\n?/g,
        ''
      );
      // Deduplicate: if 'import { useLenis } from' appears more than once, keep only the first.
      const useLenisDupRe = /(import\s*\{[^}]*useLenis[^}]*\}\s*from\s*['"]\.\.\/hooks\/useLenis['"];?\n?)/g;
      const useLenisMatches = content.match(useLenisDupRe);
      if (useLenisMatches && useLenisMatches.length > 1) {
        let replaced = false;
        content = content.replace(useLenisDupRe, (m) => {
          if (!replaced) { replaced = true; return m; }
          return '';
        });
      }

      // Fix: Strip wrong-path useReducedMotion imports (e.g., from gsap-config)
      // useReducedMotion must come from hooks/useReducedMotion
      content = content.replace(
        /import\s*\{[^}]*useReducedMotion[^}]*\}\s*from\s*['"](?!\.\.\/hooks\/useReducedMotion)[^'"]+['"];?\n?/g,
        ''
      );

      // Fix 3: Strip hallucinated lenisInstance named import from lenis-provider
      // (lenis-provider only exports LenisContext and a default LenisProvider — no lenisInstance)
      content = content.replace(/,\s*\{?\s*lenisInstance\s*\}?/g, '');
      content = content.replace(/\{?\s*lenisInstance\s*,?\s*\}?\s*from\s*['"][^'"]*lenis-provider['"];?\n?/g, '');
      content = content.replace(/import\s+\{?\s*lenisInstance\s*\}?\s*from\s*['"][^'"]*['"];?\n?/g, '');

      // Fix 4: optional chaining (?.) on the LHS of an assignment is a syntax error in TypeScript.
      // e.g.: lenisRef.current?.style.opacity = '1'  =>  if (lenisRef.current) { lenisRef.current.style.opacity = '1'; }
      // Pattern: <expr>?.<prop> = <value>;
      content = content.replace(
        /^(\s*)([\w.[\]]+)\?\.([\w.[\]]+)\s*=\s*(.+?);/gm,
        (_, indent, obj, prop, value) =>
          `${indent}if (${obj}) { ${obj}.${prop} = ${value}; }`
      );

      // Fix 4b: lenisRef.current?.raf() without arguments - Lenis raf() requires a callback
      // Replace lenisRef.current?.raf() with lenisRef.current?.raf(() => {})
      content = content.replace(
        /(\w+Ref\.current)\?\.\s*raf\(\s*\)/g,
        '$1?.raf(() => {})'
      );

      // Fix 4c: Fix malformed ScrollTrigger trigger strings that span multiple lines
      // e.g., trigger: '.hero-title,\n  .hero-subtitle' -> trigger: '.hero-title, .hero-subtitle'
      // Also handles cases where the trigger string is split across lines without proper quotes
      content = content.replace(
        /trigger:\s*'([^']*?)'\s*\n\s*'([^']*?)'/g,
        "trigger: '$1$2'"
      );
      content = content.replace(
        /trigger:\s*"([^"]*?)"\s*\n\s*"([^"]*?)"/g,
        'trigger: "$1$2"'
      );
      // Fix: multiline trigger without proper quotes on each line
      // trigger: '.hero-title,\n  hero-subtitle,\n  hero-button' -> trigger: '.hero-title, hero-subtitle, hero-button'
      content = content.replace(
        /trigger:\s*'([^']*?(?:\n\s*[^']*?)+)'/g,
        (match) => match.replace(/\n\s*/g, ' ')
      );
      content = content.replace(
        /trigger:\s*"([^"]*?(?:\n\s*[^"]*?)+)"/g,
        (match) => match.replace(/\n\s*/g, ' ')
      );

      // Fix: Model sometimes uses React.useContext(LenisProvider) instead of useLenis() hook
      // LenisProvider is a React component, not a Context. The correct way is useLenis()
      content = content.replace(
        /React\.useContext\s*\(\s*LenisProvider\s*\)/g,
        'useLenis()'
      );
      content = content.replace(
        /useContext\s*\(\s*LenisProvider\s*\)/g,
        'useLenis()'
      );

      // Fix 5: ScrollTrigger.kill() does not exist as a static method — the correct API is ScrollTrigger.killAll()
      content = content.replace(/ScrollTrigger\.kill\(\)/g, 'ScrollTrigger.killAll()');

      // Fix 6: useLenis() returns the Lenis instance directly (Lenis | null), NOT an object { lenis }.
      // Model sometimes writes: const { lenis } = useLenis()  =>  const lenis = useLenis()
      content = content.replace(/const\s*\{\s*lenis\s*\}\s*=\s*useLenis\(\)/g, 'const lenis = useLenis()');

      // Fix 7: Model sometimes writes JSX placeholder text instead of real JSX:
      // e.g. <Gallery component implementation> causes 'Expression expected' syntax error.
      // Strip all lines containing angle-bracket placeholder text patterns.
      content = content.replace(/<[A-Z][\w]* component implementation>/gi, '');
      content = content.replace(/<[A-Z][\w]* content goes here>/gi, '');
      content = content.replace(/<[A-Z][\w]* placeholder>/gi, '');

      // Fix 8: Model uses ref={xyzRef} in JSX but forgets to declare const xyzRef = useRef(null).
      // Scan for all ref={varName} usages and inject missing useRef declarations.
      {
        const refUsages = [...content.matchAll(/\bref=\{(\w+Ref)\}/g)].map(m => m[1]);
        const uniqueRefs = [...new Set(refUsages)];
        const missingRefs = uniqueRefs.filter(refName => !new RegExp(`\\bconst\\s+${refName}\\b`).test(content));
        if (missingRefs.length > 0) {
          const declarations = missingRefs.map(r => `  const ${r} = useRef<HTMLDivElement | null>(null);`).join('\n');
          content = content.replace(/((?:function\s+\w+|const\s+\w+\s*=\s*(?:React\.FC[^=]*=\s*)?\([^)]*\)\s*(?::\s*[^=>{]+)?\s*=>)\s*\{)(\n)/, `$1$2${declarations}\n`);
          if (!content.includes('useRef')) {
            content = content.replace(/import\s+React(?:,\s*\{([^}]*)\})?\s+from\s+'react'/, (_m, named) => {
              const parts = named ? named.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
              if (!parts.includes('useRef')) parts.push('useRef');
              return `import React, { ${parts.join(', ')} } from 'react'`;
            });
            if (!content.includes('useRef')) {
              content = content.replace(/import\s+\{([^}]*)\}\s+from\s+'react'/, (_m, named) => {
                const parts = named.split(',').map((s: string) => s.trim()).filter(Boolean);
                if (!parts.includes('useRef')) parts.push('useRef');
                return `import { ${parts.join(', ')} } from 'react'`;
              });
            }
          }
        }
      }

      let missingImports = '';
      if (fileSpec.path !== 'hooks/useLenis.ts' && content.includes('useLenis') && !content.includes("import { useLenis } from")) {
        missingImports += `import { useLenis } from '${relPathToHooks}/useLenis';\n`;
      }
      if (content.includes('ScrollTrigger') && !content.includes("import { ScrollTrigger } from")) {
        missingImports += "import { ScrollTrigger } from 'gsap/ScrollTrigger';\n";
      }
      // Fix Lenis import: use regular import (not 'import type') when Lenis is used as a value (constructor)
      // Check if Lenis is used as a value (e.g., 'new Lenis(') - if so, use regular import
      const usesLenisAsValue = /\bnew\s+Lenis\s*\(/.test(content);
      if (fileSpec.path !== 'lib/lenis-provider.tsx' && /\bLenis\b/.test(content) && !content.includes("import type Lenis") && !content.includes("import Lenis from")) {
        if (usesLenisAsValue) {
          missingImports += "import Lenis from 'lenis';\n";
        } else {
          missingImports += "import type Lenis from 'lenis';\n";
        }
      }

      if (missingImports) {
        if (content.trim().startsWith("'use client'") || content.trim().startsWith('"use client"')) {
          content = content.replace(/['"]use client['"];?\s*/g, '');
          content = "'use client';\n" + missingImports + content;
        } else {
          content = missingImports + content;
        }
      }

      // ── Import-depth normalizer backstop (ALL FILES) ──────────────────────────────────────
      // The model sometimes uses the wrong number of '../' segments.
      // relPathToLib/Components/Hooks are computed from actual file depth at prompt time.
      // Here we post-process to fix any surviving wrong-depth imports in any file.
      // Replace any variant of '../(1-9 times)lib/' with the correct relPath
      content = content.replace(
        /from\s+['"](?:\.\.\/)+lib\/(lenis-provider|gsap-config)['"]/g,
        (_, mod) => `from '${relPathToLib}/${mod}'`
      );
      content = content.replace(
        /from\s+['"](?:\.\.\/)+components\/([A-Za-z0-9_-]+)['"]/g,
        (_, comp) => `from '${relPathToComponents}/${comp}'`
      );
      content = content.replace(
        /from\s+['"](?:\.\.\/)+hooks\/([A-Za-z0-9_-]+)['"]/g,
        (_, hook) => `from '${relPathToHooks}/${hook}'`
      );

      if (fileSpec.path === 'app/page.tsx' || fileSpec.path.match(/^app\/.+\/page\.tsx$/)) {

        // Remove hallucinated styles object usage since page.tsx has no CSS module.
        // Use fragment-level replacement (not whole-expression) so it catches styles['x'] inside
        // concatenations like {styles['x'] + ' foo'} or template literals too.
        content = content.replace(/styles\['([^']+)'\]/g, "'$1'");
        content = content.replace(/styles\["([^"]+)"\]/g, "'$1'");
        content = content.replace(/styles\.([\w-]+)/g, "'$1'");
        // Clean up any now-trivial expressions like {'x' + ' y'} -> just use the first part
        // (leave them as-is; they're valid JS even if redundant)
        // Also strip any remaining `import styles from ...` that snuck in
        content = content.replace(/import\s+styles\s+from\s+['"]\.\.\/[^'"]+\.module\.css['"];?\n?/g, '');
        content = content.replace(/import\s+styles\s+from\s+['"][^'"]+\.module\.css['"];?\n?/g, '');

        // Backstop: strip {children} references from page.tsx.
        // page.tsx is a leaf component — it receives no children prop.
        // Only layout.tsx receives {children}. Any {children} in page.tsx is always wrong.
        content = content.replace(/\{children\}/g, '');

        // Auto-fix missing component imports for page.tsx
        const componentRegex = /<([A-Z][a-zA-Z0-9]+)/g;
        let match;
        const usedComponents = new Set();
        while ((match = componentRegex.exec(content)) !== null) {
          usedComponents.add(match[1]);
        }

        // Determine the correct import path for components — use pre-computed relPath
        // (relPathToComponents is computed from fileSpec.path depth, correct for any nesting level)
        const componentsImportPath = relPathToComponents;

        for (const comp of usedComponents) {
          if (comp === 'LenisProvider' || comp === 'React') continue;
          // Only add import if the component file was actually generated
          const componentFilePath = `components/${comp}.tsx`;
          if (!alreadyGenerated.has(componentFilePath)) {
            continue; // Skip non-existent components
          }
          if (!content.includes(`import ${comp} from`)) {

            // Ensure we don't put imports above 'use client'
            if (content.trim().startsWith("'use client'") || content.trim().startsWith('"use client"')) {
              content = content.replace(/['"]use client['"];?\s*/g, '');
              content = "'use client';\n" + `import ${comp} from '${componentsImportPath}/${comp}';\n` + content;
            } else {
              content = `import ${comp} from '${componentsImportPath}/${comp}';\n` + content;
            }

          }
        }

        // Convert raw HTML sections to section components for page.tsx
        // This handles cases where the LLM generates raw <section> elements instead of using section components
        const sectionComponentMap: Record<string, string> = {
          'hero-section': 'Hero',
          'bio-section': 'Bio',
          'about-section': 'About',
          'form-section': 'Form',
          'contact-section': 'Contact',
          'skills-section': 'Skills',
          'footer-section': 'Footer',
        };

        for (const [sectionClass, componentName] of Object.entries(sectionComponentMap)) {
          const componentFilePath = `components/${componentName}.tsx`;
          // Only replace if the component was actually generated
          if (alreadyGenerated.has(componentFilePath)) {
            // Replace <section className='xxx-section'>...</section> with <ComponentName />
            const sectionRegex = new RegExp(
              `<section\\s+className=['\"]${sectionClass}['\"][^>]*>[\\s\\S]*?<\\/section>`,
              'g'
            );
            content = content.replace(sectionRegex, `<${componentName} />`);

            // Also handle self-closing sections
            const selfClosingRegex = new RegExp(
              `<section\\s+className=['\"]${sectionClass}['\"][^>]*/>`,
              'g'
            );
            content = content.replace(selfClosingRegex, `<${componentName} />`);

            // Add import if not present
            if (!content.includes(`import ${componentName} from`)) {
              const componentsImportPath = relPathToComponents;
              if (content.trim().startsWith("'use client'") || content.trim().startsWith('"use client"')) {
                content = content.replace(/['"]use client['"];?\s*/g, '');
                content = "'use client';\n" + `import ${componentName} from '${componentsImportPath}/${componentName}';\n` + content;
              } else {
                content = `import ${componentName} from '${componentsImportPath}/${componentName}';\n` + content;
              }
            }
          }
        }

        // Remove local component definitions that conflict with imports.
        // Uses brace-counting (not regex) to correctly handle nested JSX.
        // Covers ANY imported component name, not just a hardcoded list.
        {
          // 1. Collect all imported component names (PascalCase identifiers after 'import')
          const importedNames: string[] = [];
          const importLineRe = /^import\s+([A-Z][\w]*)\s+from\s+/gm;
          let imp: RegExpExecArray | null;
          while ((imp = importLineRe.exec(content)) !== null) {
            if (imp[1]) importedNames.push(imp[1]);
          }

          // 2. For each imported name, find and remove any local re-definition
          for (const name of importedNames) {
            // Match `const Name = ` or `function Name(` that is NOT the import line
            const declPattern = new RegExp(
              `(const\\s+${name}\\s*=\\s*|function\\s+${name}\\s*\\()`,
              'g'
            );
            let declMatch: RegExpExecArray | null;
            while ((declMatch = declPattern.exec(content)) !== null) {
              const declStart = declMatch.index;
              // Find the opening brace of this declaration
              const braceStart = content.indexOf('{', declStart);
              if (braceStart === -1) continue;
              // Brace-count forward to find the matching closing brace
              let depth = 0;
              let pos = braceStart;
              while (pos < content.length) {
                if (content[pos] === '{') depth++;
                else if (content[pos] === '}') {
                  depth--;
                  if (depth === 0) break;
                }
                pos++;
              }
              // pos now points to the matching closing '}'
              // Include optional trailing semicolon and newline
              let endPos = pos + 1;
              if (content[endPos] === ';') endPos++;
              if (content[endPos] === '\n') endPos++;
              // Remove the entire local definition
              content = content.slice(0, declStart) + content.slice(endPos);
              // Reset the regex since content changed
              declPattern.lastIndex = 0;
              break; // Only remove the first conflicting definition per name
            }
          }
        }

      }



      // If Qwen generated line continuations inside JSX (backslash at end of line), strip them!
      content = content.replace(/\\\s*\n/g, "\n");

      // RAW HTML HALLUCINATION FIX
      const trimmedContent = content.trim();
      if (trimmedContent.startsWith('<') && !trimmedContent.includes('import')) {
        const componentName = (fileSpec.path.split('/').pop() || 'Component').replace('.tsx', '').replace('.ts', '');
        const isPage = fileSpec.path.endsWith('/page.tsx');
        const isRootPage = fileSpec.path === 'app/page.tsx';
        const libImportPath = isPage ? (isRootPage ? '../lib/lenis-provider' : '../../lib/lenis-provider') : '../lib/lenis-provider';
        const componentsImportPath = isPage ? (isRootPage ? '../components' : '../../components') : '../components';
        const stylesImport = (isPage || trimmedContent.includes('styles')) ? `\nimport styles from './${componentName}.module.css';` : '';
        const useClientDirective = isPage ? "'use client';\n" : '';
        const lenisProviderWrap = isPage ? '<LenisProvider>\n      ' : '';
        const lenisProviderClose = isPage ? '\n    </LenisProvider>' : '';
        const mainWrap = isPage ? '<main>\n      ' : '';
        const mainClose = isPage ? '\n    </main>' : '';

        content = `${useClientDirective}import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';${stylesImport}
import LenisProvider from '${libImportPath}';

const ${componentName}: React.FC<{ id?: string }> = ({ id }) => {
  return (
    ${lenisProviderWrap}${mainWrap}<>
        ${trimmedContent}
      </>${mainClose}${lenisProviderClose}
  );
};

export default ${componentName};
`;
      }

      validation.data.content = content;
    }

    // Fix hallucinated imports in page.tsx - remove imports for components that don't exist
    if (validation.data && validation.data.content && fileSpec.path.match(/^app\/.*\/page\.tsx$/)) {
      const importRegex = /import\s+(\w+)\s+from\s+['"](?:\.\.\/)+components\/(\w+)['"];?/g;
      let match;
      while ((match = importRegex.exec(validation.data.content)) !== null) {
        const importName = match[1];
        const componentPath = match[2];
        const componentFilePath = `components/${componentPath}.tsx`;
        if (!alreadyGenerated.has(componentFilePath)) {
          // Remove this import
          validation.data.content = validation.data.content.replace(match[0], '');
        }
      }

      // Fix: Replace Hero with ProjectHero when project-specific props are passed
      // Hero only accepts { id?: string }, but pages sometimes pass title/subtitle/imageSrc
      // which are meant for ProjectHero. Fix the JSX usage.
      validation.data.content = validation.data.content.replace(
        /<Hero\s+([^>]*\btitle\s*=\s*\{[^}]+\}[^>]*)\s*>/g,
        (match, props) => {
          // Remove title, subtitle, imageSrc props and keep only id if present
          let cleanProps = props
            .replace(/\s*title\s*=\s*\{[^}]+\}/g, '')
            .replace(/\s*subtitle\s*=\s*\{[^}]+\}/g, '')
            .replace(/\s*imageSrc\s*=\s*\{[^}]+\}/g, '');
          // If only whitespace remains, remove self-closing space
          cleanProps = cleanProps.trim();
          if (cleanProps) {
            return `<ProjectHero ${cleanProps} />`;
          }
          return `<ProjectHero />`;
        }
      );

      // Fix: Also catch Hero with subtitle/imageSrc without title
      validation.data.content = validation.data.content.replace(
        /<Hero\s+([^>]*\bsubtitle\s*=\s*\{[^}]+\}[^>]*)\s*>/g,
        (match, props) => {
          let cleanProps = props
            .replace(/\s*title\s*=\s*\{[^}]+\}/g, '')
            .replace(/\s*subtitle\s*=\s*\{[^}]+\}/g, '')
            .replace(/\s*imageSrc\s*=\s*\{[^}]+\}/g, '');
          cleanProps = cleanProps.trim();
          if (cleanProps) {
            return `<ProjectHero ${cleanProps} />`;
          }
          return `<ProjectHero />`;
        }
      );

      // Fix: Also catch Hero with imageSrc without title/subtitle
      validation.data.content = validation.data.content.replace(
        /<Hero\s+([^>]*\bimageSrc\s*=\s*\{[^}]+\}[^>]*)\s*>/g,
        (match, props) => {
          let cleanProps = props
            .replace(/\s*title\s*=\s*\{[^}]+\}/g, '')
            .replace(/\s*subtitle\s*=\s*\{[^}]+\}/g, '')
            .replace(/\s*imageSrc\s*=\s*\{[^}]+\}/g, '');
          cleanProps = cleanProps.trim();
          if (cleanProps) {
            return `<ProjectHero ${cleanProps} />`;
          }
          return `<ProjectHero />`;
        }
      );

      // Fix: Model sometimes uses CtaSection in JSX but the actual component is Cta
      // Replace CtaSection JSX usage with Cta
      validation.data.content = validation.data.content.replace(
        /<CtaSection\s*(\/)?>/g,
        (match, selfClosing) => `<Cta${selfClosing ? ' /' : ''}>`
      );
      validation.data.content = validation.data.content.replace(
        /<\/CtaSection>/g,
        '</Cta>'
      );

      // Fix: Also fix import if it imported CtaSection
      validation.data.content = validation.data.content.replace(
        /import\s+CtaSection\s+from\s+['"]([^'"]+)['"]/,
        "import Cta from '$1'"
      );

      // Fix invalid className string concatenation (e.g., className='bio + ' ' + styles['skills-container']')
      validation.data.content = validation.data.content.replace(
        /className='([^']+)\s*\+\s*'\s+'\s*\+\s*([^']+)'/g,
        "className={\$1 + ' ' + \$2}"
      );
    }

    // Fix useReducedMotion incorrect destructuring (it returns boolean, not array)
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
      validation.data.content = validation.data.content.replace(
        new RegExp('const\\s+\\[\\w+\\]\\s*=\\s*useReducedMotion\\(\\)', 'g'),
        'const prefersReducedMotion = useReducedMotion()'
      );
      validation.data.content = validation.data.content.replace(
        new RegExp('const\\s+\\{\\s*(\\w+)\\s*\\}\\s*=\\s*useReducedMotion\\(\\)', 'g'),
        'const $1 = useReducedMotion()'
      );
      // Fix invalid GSAP ScrollTrigger callbacks (onLeaveBackward doesn't exist)
      validation.data.content = validation.data.content.replace(
        /onLeaveBackward\s*:\s*\(\)\s*=>\s*\{[\s\S]*?\}/g,
        ''
      );
      validation.data.content = validation.data.content.replace(
        /onLeaveBackward\s*:\s*\(\)\s*=>\s*[^,\n]+/g,
        ''
      );
      // Fix invalid scrollTrigger: false (should be omitted or an object)
      validation.data.content = validation.data.content.replace(
        /scrollTrigger\s*:\s*false/g,
        'scrollTrigger: undefined'
      );
      // Fix missing gsapConfig import when gsapConfig is used.
      // NOTE: this MUST be a regex check for gsapConfig as a named import, not an exact
      // substring match. An earlier merge-duplicate-imports pass can combine it with other
      // names on the same line (e.g. "import { gsapConfig, setupGSAP } from '../lib/gsap-config';"),
      // which content.includes("import { gsapConfig }") would fail to recognize -- wrongly
      // concluding gsapConfig isn't imported and re-inserting a duplicate. (Root-caused via
      // isolated reproduction: the old check reintroduced exactly this duplicate after the
      // merge fixer had already correctly combined the two imports.)
      const hasGsapConfigImport = /import\s*\{[^}]*\bgsapConfig\b[^}]*\}\s*from\s*['"](?:\.\.\/)*lib\/gsap-config['"]/.test(validation.data.content);
      if (validation.data.content.includes('gsapConfig.') && !hasGsapConfigImport) {
        const importLine = "import { gsapConfig } from '../lib/gsap-config';\n";
        if (validation.data.content.includes("import { gsap } from 'gsap';")) {
          validation.data.content = validation.data.content.replace(
            "import { gsap } from 'gsap';",
            "import { gsap } from 'gsap';\n" + importLine
          );
        } else if (validation.data.content.includes("import gsap from 'gsap';")) {
          validation.data.content = validation.data.content.replace(
            "import gsap from 'gsap';",
            "import gsap from 'gsap';\n" + importLine
          );
        } else {
          // Add after first import
          const lines = validation.data.content.split('\n');
          let insertIdx = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i]?.startsWith('import ')) {
              insertIdx = i + 1;
              break;
            }
          }
          lines.splice(insertIdx, 0, importLine.trim());
          validation.data.content = lines.join('\n');
        }
      }

      // Merge duplicate gsapConfig imports from same module (AGGRESSIVE - runs before final safety net)
      // Model often generates: "import { gsapConfig } from '../lib/gsap-config';" AND "import { gsapConfig, setupGSAP } from '../lib/gsap-config';"
      // Merge into single import with union of named exports
      if (validation.data.content && fileSpec.path.endsWith('.tsx')) {
        const gsapConfigImportRegex = /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]*gsap-config[^'"]*)['"];\s*$/gm;
        const gsapImports: Array<{ named: string; module: string; full: string }> = [];
        let gsapMatch: RegExpExecArray | null;
        while ((gsapMatch = gsapConfigImportRegex.exec(validation.data.content)) !== null) {
          gsapImports.push({ named: gsapMatch[1]!, module: gsapMatch[2]!, full: gsapMatch[0]! });
        }
        if (gsapImports.length > 1) {
          // Multiple imports from gsap-config modules - merge them
          const allNamed = new Set<string>();
          const modulePaths = new Set<string>();
          for (const imp of gsapImports) {
            imp.named.split(',').map(s => s.trim()).filter(Boolean).forEach(n => allNamed.add(n));
            modulePaths.add(imp.module);
          }
          // Remove all gsap-config imports
          let content = validation.data.content;
          for (const imp of gsapImports) {
            content = content.replace(imp.full, '');
          }
          // Add single merged import per unique module path
          for (const modulePath of modulePaths) {
            const merged = `import { ${Array.from(allNamed).sort().join(', ')} } from '${modulePath}';`;
            // Insert after first import or use client
            const lines = content.split('\n');
            let insertIdx = 0;
            for (let i = 0; i < lines.length; i++) {
              if (lines[i]?.trim().startsWith("'use client'") || lines[i]?.trim().startsWith('"use client"')) {
                insertIdx = i + 1;
                break;
              }
              if (lines[i]?.startsWith('import ')) {
                insertIdx = i + 1;
              }
            }
            lines.splice(insertIdx, 0, merged);
            content = lines.join('\n');
          }
          validation.data.content = content;
        }
      }

      // Fix useLenis called with arguments (it doesn't accept any - just returns context value)
      validation.data.content = validation.data.content.replace(
        /useLenis\(\s*\{[^}]+\}\s*\)/g,
        'useLenis()'
      );

      // Fix JSX syntax error: missing closing > on opening tag when style is on next line
      validation.data.content = validation.data.content.replace(
        /(<div\s+className=\{styles\['[^']+'\]\})\s*\n\s*style=/g,
        '$1 style='
      );
      // Fix JSX syntax error: missing closing > on opening tag (generic)
      // Match tags that are missing the closing > before a newline or end of file
      validation.data.content = validation.data.content.replace(
        /(<(?:section|div|header|footer|nav|main|article|aside|ul|ol|li|h[1-6]|p|span|button|a|img|form|input|label|textarea|select|option)\s+[^>]*?)(?=\s*\n\s*(?:[^<\s>]|$))/g,
        '$1>'
      );
      // Fix JSX syntax error: missing < before div in Context.Provider return
      validation.data.content = validation.data.content.replace(
        /return\s*\(\s*<([A-Z][a-zA-Z0-9]*\.Provider[^>]*>)(\s*\n\s*)div\s+/g,
        'return ($1$2<div '
      );
    }

    // Fix invalid Lenis options in section components
    // Invalid: direction: 'vertical' - use orientation: 'vertical' and gestureOrientation: 'vertical'
    // Invalid: spreading gsapConfig into Lenis constructor - gsapConfig has GSAP properties, not Lenis options
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/') && fileSpec.path.endsWith('.tsx')) {
      // Fix direction -> orientation + gestureOrientation
      validation.data.content = validation.data.content.replace(
        /direction\s*:\s*['"]vertical['"]/g,
        "orientation: 'vertical', gestureOrientation: 'vertical'"
      );
      // Remove spread of gsapConfig in Lenis constructor
      validation.data.content = validation.data.content.replace(
        /new\s+Lenis\(\s*\{[^}]*\.\.\.gsapConfig[^}]*\}\s*\)/g,
        "new Lenis({ duration: gsapConfig.defaultDuration, easing: gsapConfig.defaultEasing, staggerInterval: gsapConfig.staggerInterval, orientation: 'vertical', gestureOrientation: 'vertical', smoothWheel: true })"
      );
      // Fix any remaining direction in Lenis constructor
      validation.data.content = validation.data.content.replace(
        /new\s+Lenis\(\s*\{([^}]*)direction\s*:\s*['"]vertical['"]([^}]*)\}\s*\)/g,
        "new Lenis({$1orientation: 'vertical', gestureOrientation: 'vertical'$2})"
      );
    }

    // Fix package.json - ensure valid JSON
    if (validation.data && validation.data.content && fileSpec.path === 'package.json') {
      try {
        JSON.parse(validation.data.content);
      } catch {
        // Try to fix common issues
        validation.data.content = validation.data.content
          .replace(/,\s*}/g, '}')  // Remove trailing commas before }
          .replace(/,\s*]/g, ']')  // Remove trailing commas before ]
          .replace(/([^\\])"/g, '$1"')  // Ensure proper escaping
          .replace(/\\n/g, '\n');
        // If still invalid, try to fix by adding missing closing brace
        if (!validation.data.content.trim().endsWith('}')) {
          validation.data.content = validation.data.content.trim() + '\n}';
        }
      }
    }

    // BULLETPROOF POSTCSS.CONFIG.JS FIX
    if (validation.data && validation.data.content && fileSpec.path.endsWith('postcss.config.js')) {
      validation.data.content = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};`;
    }

    // Fix quoted var() values in CSS module files (all property types, not just --custom)
    // Model outputs: padding: 'var(--base-unit)' 0; or font-family: 'var(--font-text-family)';
    if (validation.data && validation.data.content && fileSpec.type === 'style' && fileSpec.path.endsWith('.module.css')) {
      // Simple single-value: property: 'var(--x)';
      validation.data.content = validation.data.content.replace(
        /:\s*['"]var\((--[\w-]+)\)['"]\s*;/g,
        ': var($1);'
      );
      // Multi-value: property: 'var(--x)' other-value;
      validation.data.content = validation.data.content.replace(
        /([\.\w-]+\s*:\s*[^;]*)['"]( var\([^'"]+)['"]([\s\w%.,()-]*;)/g,
        '$1$2$3'
      );
    }

    // Strip JS template literal expressions from CSS module files
    // Model sometimes emits styled-components syntax like: padding: ${props => props.theme.spacing.md};
    // This is illegal in plain CSS and causes a hard PostCSS build crash.
    if (validation.data && validation.data.content && fileSpec.type === 'style' && fileSpec.path.endsWith('.module.css')) {
      // Replace entire property lines containing ${...} expressions with a safe fallback or remove them
      validation.data.content = validation.data.content.replace(
        /^(\s*[\w-]+\s*:\s*)\$\{[^}]+\}.*$/gm,
        (match, prefix) => {
          // Replace the template literal value with 'inherit' as a safe CSS fallback
          return prefix + 'inherit;';
        }
      );
      // Also strip any remaining ${...} that appear mid-value (e.g. "padding: 1rem ${props => ...}")
      validation.data.content = validation.data.content.replace(/\$\{[^}]+\}/g, '');
    }

    // Fix invalid keyframe syntax in CSS module files
    // Model outputs: .bio from { ... } .bio to { ... } -> should be: from { ... } to { ... }
    // Also handles multi-class selectors like .features .features from {
    if (validation.data && validation.data.content && fileSpec.type === 'style' && fileSpec.path.endsWith('.module.css')) {
      // Match any number of class selectors before from/to
      validation.data.content = validation.data.content.replace(
        /(?:\.\w+\s*)+\s+from\s*\{/g,
        'from {'
      );
      validation.data.content = validation.data.content.replace(
        /(?:\.\w+\s*)+\s+to\s*\{/g,
        'to {'
      );
    }

    // Fix missing closing braces in CSS module files
    // Model often generates incomplete CSS rules without closing }
    if (validation.data && validation.data.content && fileSpec.type === 'style' && fileSpec.path.endsWith('.module.css')) {
      // Count opening and closing braces
      const openBraces = (validation.data.content.match(/\{/g) || []).length;
      const closeBraces = (validation.data.content.match(/\}/g) || []).length;
      if (openBraces > closeBraces) {
        // Add missing closing braces at the end
        validation.data.content += '\n'.repeat(openBraces - closeBraces) + '}'.repeat(openBraces - closeBraces);
      }
    }

    // Fix missing semicolons in event handler callbacks
    // Pattern: lenisRef.current.on('scroll', ScrollTrigger.update); -> add missing semicolon
    if (validation.data && validation.data.content) {
      validation.data.content = validation.data.content.replace(
        /(lenisRef\.current\.on\([^)]+\))\s*;?\s*$/gm,
        '$1;'
      );
    }

    // Fix Navbar.tsx: missing navigationItems array definition
    if (validation.data && validation.data.content && fileSpec.path === 'components/Navbar.tsx') {
      const c = validation.data.content;
      if (c.includes('navigationItems.map') && !c.includes('const navigationItems') && !c.includes('navigationItems =')) {
        // Insert navigationItems array before the return statement
        const navItems = `  const navigationItems = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/work', label: 'Work' },
    { href: '/contact', label: 'Contact' },
  ];
`;
        // Find the return statement and insert before it
        const returnIdx = c.lastIndexOf('return (');
        if (returnIdx !== -1) {
          // Find the line start
          const lineStart = c.lastIndexOf('\n', returnIdx) + 1;
          validation.data.content = c.slice(0, lineStart) + navItems + c.slice(lineStart);
        }
      }
    }

    // Fix bare element selectors in CSS module files (CSS Modules require scoped selectors)
    // Pattern: bare element selectors like "p {" -> ".component-name p {"
    if (validation.data && validation.data.content && fileSpec.type === 'style' && fileSpec.path.endsWith('.module.css')) {
      // Extract component name from file path (e.g., Hero.module.css -> hero)
      const componentName = fileSpec.path.split('/').pop()?.replace('.module.css', '').toLowerCase() || 'component';
      const baseClass = `.${componentName}`;

      // Helper: protect @keyframes blocks by replacing them with placeholders
      // Keyframe selectors (from, to, N%) are never bare HTML elements and must not be scoped
      const keyframesBlocks: string[] = [];
      let protectedContent = validation.data.content.replace(
        /@keyframes\s+[^{]+\{[^}]*\}[\s\S]*?(?=\n[^{]*\{|\n@|$)/g,
        (block) => {
          const placeholder = `__KEYFRAMES_BLOCK_${keyframesBlocks.length}__`;
          keyframesBlocks.push(block);
          return placeholder;
        }
      );

      // Convert bare element selectors to scoped class selectors
      // Pattern: ^\s*[a-z][a-z0-9]*\s*\{  (bare element selector at start of line)
      protectedContent = protectedContent.replace(
        /^\s*([a-z][a-z0-9]*)\s*\{/gm,
        (match, element) => {
          // Skip if already has a class/id prefix or is a known CSS at-rule
          if (match.startsWith('.') || match.startsWith('#') || match.startsWith('@') || match.startsWith(':')) {
            return match;
          }
          // Skip keyframe selectors: from, to, or percentage (e.g., 50%)
          if (element === 'from' || element === 'to' || /^\d+%$/.test(element)) {
            return match;
          }
          // Convert bare element to scoped class
          return `${baseClass} ${element} {`;
        }
      );

      // Also handle bare element selectors that are indented (not at start of line)
      protectedContent = protectedContent.replace(
        /([\s{])([a-z][a-z0-9]*)\s*\{/g,
        (match, prefix, element) => {
          // Skip if already has a class/id prefix or is a known CSS at-rule
          if (match.includes('.') || match.includes('#') || match.includes('@') || match.includes(':')) {
            return match;
          }
          // Skip keyframe selectors: from, to, or percentage
          if (element === 'from' || element === 'to' || /^\d+%$/.test(element)) {
            return match;
          }
          // Check if this is a property value (like font-family: ...) not a selector
          // A selector will have the element name followed by { at the end
          if (match.trim().endsWith('{')) {
            return `${prefix}.${componentName} ${element} {`;
          }
          return match;
        }
      );

      // Fix malformed multi-line selectors like "title,\n.hero .hero caption {"
      // Convert to scoped selectors
      protectedContent = protectedContent.replace(
        /^\s*([a-z][a-z0-9]*)\s*,\s*\n\s*([^{]+)\s*\{/gm,
        (match, el1, rest) => {
          // Skip keyframe selectors in multi-line form
          if (el1 === 'from' || el1 === 'to' || /^\d+%$/.test(el1)) {
            return match;
          }
          // Scope both selectors
          const scoped1 = `.${componentName} ${el1.trim()}`;
          const scoped2 = rest.trim().split(',').map((s: string) => `.${componentName} ${s.trim()}`).join(', ');
          return `${scoped1}, ${scoped2} {`;
        }
      );

      // Restore @keyframes blocks
      for (let i = 0; i < keyframesBlocks.length; i++) {
        const block = keyframesBlocks[i];
        if (block) {
          protectedContent = protectedContent.replace(`__KEYFRAMES_BLOCK_${i}__`, block);
        }
      }

      validation.data.content = protectedContent;
    }

    // Post-processing: generic missing imports auto-fixer for 7B models
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
      const missing = [];
      const c = validation.data.content;
      if (c.includes('useEffect(') && !c.match(/import.*\buseEffect\b/)) missing.push('import { useEffect } from "react";');
      if ((c.includes('useRef(') || c.includes('useRef<')) && !c.match(/import.*\buseRef\b/)) missing.push('import { useRef } from "react";');
      if (c.includes('useState(') && !c.match(/import.*\buseState\b/)) missing.push('import { useState } from "react";');
      if (c.includes('useContext(') && !c.match(/import.*\buseContext\b/)) missing.push('import { useContext } from "react";');
      if (c.includes('gsap.') && !c.match(/import.*\bgsap\b/)) missing.push('import gsap from "gsap";');
      if (c.includes('ScrollTrigger') && !c.match(/import.*\bScrollTrigger\b/)) missing.push('import { ScrollTrigger } from "gsap/ScrollTrigger";');
      if (c.includes('styles[') && !c.match(/import styles from/)) missing.push(`import styles from './${fileSpec.path.replace('components/', '').replace('.tsx', '')}.module.css';`);
      if (c.includes('useReducedMotion(') && !c.match(/import.*\buseReducedMotion\b/)) missing.push(`import useReducedMotion from '${relPathToHooks}/useReducedMotion';`);
      if (c.includes('gsapConfig') && !c.match(/import.*\bgsapConfig\b/)) missing.push(`import { gsapConfig } from '${relPathToLib}/gsap-config';`);

      // Add 'use client' directive if component uses hooks but doesn't have it at the top
      const usesClientFeatures = c.includes('useEffect') || c.includes('useState') || c.includes('useRef') || c.includes('useReducedMotion') || c.includes('useLenis');
      const hasUseClientAtTop = c.trim().startsWith("'use client';") || c.trim().startsWith('"use client";');
      if (usesClientFeatures && !hasUseClientAtTop) {
        missing.unshift("'use client';");
      }

      if (missing.length > 0) {
        // Insert missing imports directly after the first import or use client directive
        // But 'use client' must be at the very top
        const lines = validation.data.content!.split('\n');
        let insertIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]?.startsWith('import ')) {
            insertIdx = i + 1;
          }
        }
        lines.splice(insertIdx, 0, ...missing);
        let content = lines.join('\n');

        // Deduplicate imports (keep first occurrence of each unique import line)
        const importLines = new Map<string, number>();
        const dedupedLines = content.split('\n').filter((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('import ')) {
            if (importLines.has(trimmed)) {
              return false; // Skip duplicate
            }
            importLines.set(trimmed, idx);
          }
          return true;
        });
        content = dedupedLines.join('\n');

        // Ensure 'use client' is at the very top
        if (content.includes("'use client';") && !content.trim().startsWith("'use client';")) {
          content = content.replace(/'use client';\s*/g, '');
          content = "'use client';\n" + content;
        }
        if (content.includes('"use client";') && !content.trim().startsWith('"use client";')) {
          content = content.replace(/"use client";\s*/g, '');
          content = '"use client";\n' + content;
        }

        validation.data!.content = content;
      }

      // Fix section element formatting - ensure <section> is on one line
      validation.data.content = validation.data.content.replace(
        /<section\s+className=\{styles\['([^']+)'\]\}\s*>/g,
        "<section className={styles['$1']}>"
      );
      validation.data.content = validation.data.content.replace(
        /<section\s+className=\{styles\.([^}]+)\}\s*>/g,
        "<section className={styles.$1}>"
      );
    }

    // ── Generic missing useRef declarations auto-fixer ───────────────────────────────────────
    // Detect any identifier used as `identifier.current` that lacks a `const identifier = useRef(...)`
    // declaration, and auto-insert one. Handles both single refs and array refs.
    if (validation.data && validation.data.content && (fileSpec.path.endsWith('.tsx') || fileSpec.path.endsWith('.ts'))) {
      const c = validation.data.content;
      // Find all patterns like `linkRefs.current` or `refName.current`
      const refUsageRegex = /(\b[a-zA-Z_$][\w$]*)\.current\b/g;
      const usedRefs = new Set<string>();
      let match: RegExpExecArray | null;
      while ((match = refUsageRegex.exec(c)) !== null) {
        usedRefs.add(match[1]!);
      }
      if (usedRefs.size > 0) {
        const lines = c.split('\n');
        // Check which used refs have declarations
        const declaredRefs = new Set<string>();
        const useRefDeclRegex = /(?:const|let|var)\s+([a-zA-Z_$][\w$]*)\s*=\s*useRef\s*\(/g;
        let declMatch: RegExpExecArray | null;
        while ((declMatch = useRefDeclRegex.exec(c)) !== null) {
          declaredRefs.add(declMatch[1]!);
        }
        const missingRefs = [...usedRefs].filter(r => !declaredRefs.has(r));
        if (missingRefs.length > 0) {
          // Determine if each missing ref is likely an array ref (used with .push, .includes, .map, .forEach, .filter)
          // or a single element ref (used with .style, .focus, .scrollIntoView, etc.)
          const arrayRefMethods = new Set(['push', 'includes', 'map', 'forEach', 'filter', 'find', 'indexOf', 'pop', 'shift', 'unshift', 'splice', 'slice', 'concat']);
          const singleRefMethods = new Set(['style', 'focus', 'blur', 'scrollIntoView', 'click', 'getBoundingClientRect', 'addEventListener', 'removeEventListener']);

          const refTypeMap = new Map<string, 'array' | 'single'>();
          for (const refName of missingRefs) {
            // Check usage patterns around this ref's .current
            const refUsagePattern = new RegExp(`${refName}\\.current\\.(\\w+)`, 'g');
            let isArray = false;
            let isSingle = false;
            let methodMatch: RegExpExecArray | null;
            while ((methodMatch = refUsagePattern.exec(c)) !== null) {
              const method = methodMatch[1]!;
              if (arrayRefMethods.has(method)) isArray = true;
              if (singleRefMethods.has(method)) isSingle = true;
            }
            // Also check for patterns like `refName.current.push(el)` or `refName.current[i] = el`
            if (new RegExp(`${refName}\\.current\\[`).test(c)) isArray = true;
            if (new RegExp(`${refName}\\.current\\s*=\\s*`).test(c)) isSingle = true;

            refTypeMap.set(refName, isArray ? 'array' : (isSingle ? 'single' : 'single'));
          }

          // Insert missing useRef declarations after the last import or after 'use client'
          let insertIdx = 0;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i]?.startsWith('import ')) {
              insertIdx = i + 1;
            }
            if (lines[i]?.trim().startsWith("'use client'") || lines[i]?.trim().startsWith('"use client"')) {
              insertIdx = i + 1;
            }
          }

          const refDeclarations: string[] = [];
          for (const refName of missingRefs) {
            const type = refTypeMap.get(refName) ?? 'single';
            if (type === 'array') {
              refDeclarations.push(`  const ${refName} = useRef<Array<HTMLElement | null>>([]);`);
            } else {
              refDeclarations.push(`  const ${refName} = useRef<HTMLElement | null>(null);`);
            }
          }

          // Ensure useRef is imported
          if (!c.match(/import.*\buseRef\b/)) {
            refDeclarations.unshift('import { useRef } from "react";');
          }

          if (refDeclarations.length > 0) {
            lines.splice(insertIdx, 0, ...refDeclarations);
            validation.data.content = lines.join('\n');
          }
        }
      }
    }

    // ── FINAL SAFETY NET: unconditional depth-correction, run last, on every file ──────────
    // Whatever happened above, guarantee the import depth is correct before returning.
    // This re-applies the same fix as the earlier "ALL FILES" backstop as a last-word
    // pass, so nothing later in this function (or a future edit added after it) can
    // silently reintroduce a wrong-depth import without being caught here too.
    if (validation.data && validation.data.content) {
      const before = validation.data.content;
      validation.data.content = validation.data.content.replace(
        /from\s+['"](?:\.\.\/)+lib\/(lenis-provider|gsap-config)['"]/g,
        (_match, mod) => `from '${relPathToLib}/${mod}'`
      );
      validation.data.content = validation.data.content.replace(
        /from\s+['"](?:\.\.\/)+components\/([A-Za-z0-9_-]+)['"]/g,
        (_match, comp) => `from '${relPathToComponents}/${comp}'`
      );
      validation.data.content = validation.data.content.replace(
        /from\s+['"](?:\.\.\/)+hooks\/([A-Za-z0-9_-]+)['"]/g,
        (_match, hook) => `from '${relPathToHooks}/${hook}'`
      );
      if (before !== validation.data.content) {
        console.log(`[codegen] Final depth-correction pass fixed an import path in ${fileSpec.path}`);
      }
    }

    // ── FINAL SAFETY NET: unconditional duplicate-named-import merge, run last, on every file ──
    // Root cause of the gsapConfig duplicate-import build failure: an earlier fixer merged
    // two gsapConfig imports into one line, but a LATER fixer used a naive exact-substring
    // check to decide whether gsapConfig was already imported, didn't recognize the merged
    // form, and re-inserted a duplicate. That specific check is now fixed too (see above),
    // but the same mistake is easy to reintroduce in any future fixer added to this file.
    // Rather than relying on every individual fixer never regressing, run one real,
    // parse-based merge of duplicate named imports per module as the absolute last step
    // before returning -- this is the same proven pattern the project adopted for the
    // ScrollTrigger callback bug: don't chase every way a duplicate can be reintroduced,
    // make it structurally impossible for one to survive to the output.
    if (validation.data && validation.data.content && (fileSpec.path.endsWith('.tsx') || fileSpec.path.endsWith('.ts'))) {
      const finalImportRegex = /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];\s*$/gm;
      const finalImportsByModule = new Map<string, Set<string>>();
      let finalMatch: RegExpExecArray | null;
      while ((finalMatch = finalImportRegex.exec(validation.data.content)) !== null) {
        const namedImports = finalMatch[1]!.split(',').map(s => s.trim()).filter(Boolean);
        const modulePath = finalMatch[2]!;
        if (!finalImportsByModule.has(modulePath)) {
          finalImportsByModule.set(modulePath, new Set());
        }
        for (const ni of namedImports) {
          finalImportsByModule.get(modulePath)!.add(ni);
        }
      }
      // Only act on modules that actually have more than one import statement (a real duplicate) --
      // leave single, already-clean imports completely untouched.
      const modulesWithDuplicates = new Set<string>();
      for (const modulePath of finalImportsByModule.keys()) {
        const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const occurrences = (validation.data.content.match(
          new RegExp(`^import\\s+\\{[^}]+\\}\\s+from\\s+['"]${escaped}['"];\\s*$`, 'gm')
        ) || []).length;
        if (occurrences > 1) modulesWithDuplicates.add(modulePath);
      }
      if (modulesWithDuplicates.size > 0) {
        let content = validation.data.content;
        for (const modulePath of modulesWithDuplicates) {
          const escaped = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(
            new RegExp(`^import\\s+\\{[^}]+\\}\\s+from\\s+['"]${escaped}['"];\\s*\\n?`, 'gm'),
            ''
          );
        }
        const mergedImports: string[] = [];
        for (const modulePath of modulesWithDuplicates) {
          const sortedNamed = Array.from(finalImportsByModule.get(modulePath)!).sort();
          mergedImports.push(`import { ${sortedNamed.join(', ')} } from '${modulePath}';`);
        }
        let insertIdx = 0;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]?.trim().startsWith("'use client'") || lines[i]?.trim().startsWith('"use client"')) {
            insertIdx = i + 1;
            break;
          }
        }
        if (insertIdx === 0) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i]?.trim().startsWith('import ')) {
              insertIdx = i;
            } else if (lines[i]?.trim() && insertIdx > 0) {
              break;
            }
          }
        }
        lines.splice(insertIdx, 0, ...mergedImports);
        content = lines.join('\n').replace(/\n{3,}/g, '\n\n');
        validation.data.content = content;
        console.log(`[codegen] Final duplicate-import safety net merged repeated import(s) from [${Array.from(modulesWithDuplicates).join(', ')}] in ${fileSpec.path}`);
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
      '- This is a plain TypeScript config file (NOT a React component). Do NOT include a \'use client\' directive anywhere in this file -- it does not need one and including one will break the build.',

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
              let content = readFileSync(diskPath, 'utf-8');
              // Apply critical post-processing fixes to checkpoint-resumed files too
              // Fix: hooks/useLenis.ts missing LenisContext import
              let fixed = false;
              if (file.path === 'hooks/useLenis.ts') {
                // Always ensure correct content for useLenis.ts on checkpoint resume
                if (!content.includes('LenisContext') || !content.includes("from '../lib/lenis-provider'")) {
                  content = `import { useContext } from 'react';\nimport { LenisContext } from '../lib/lenis-provider';\n\nexport const useLenis = () => {\n  return useContext(LenisContext);\n};\n`;
                }
                // Always write back to ensure disk has correct version
                writeFileSync(diskPath, content, 'utf-8');
              }
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
              // Remove turbopack config (Next.js 15.0.0 doesn't support it)
              fileOutput.content = fileOutput.content.replace(/turbopack:\s*\{[^}]+\},\s*/g, '');
              fileOutput.content = fileOutput.content.replace(/,\s*turbopack:\s*\{[^}]+\}/g, '');
              fileOutput.content = fileOutput.content.replace(/turbopack:\s*\{[^}]+\}/g, '');
            }


            if (fileOutput.path.endsWith('tailwind.config.ts')) {
              fileOutput.content = fileOutput.content.replace(/:\s*var\((--[^)]+)\)/g, ": 'var($1)'");
            }
            if (fileOutput.path.endsWith('postcss.config.js')) {
              fileOutput.content = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};`;
            }
            // Fix package.json - ensure valid JSON
            if (fileOutput.path === 'package.json' && fileOutput.content) {
              try {
                JSON.parse(fileOutput.content);
              } catch {
                // Replace with known-valid package.json
                fileOutput.content = `{
  "name": "forge-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "gsap": "^3.12.7",
    "lenis": "^1.1.15"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.7.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.10",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20",
    "postcss-preset-env": "^10.1.0",
    "postcss-import": "^16.1.0",
    "postcss-nested": "^6.0.0",
    "eslint": "^9.10.0",
    "eslint-config-next": "15.0.0"
  }
}`;
              }
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
      notes = `${summaryReport}. Permanently failed files:\n${permanentlyFailed.map(f => `  - ${f.path}: ${f.error}`).join('\n')
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