import type { QAReport, QACheck, FixTicket } from '../../schemas/index.js';
import type { GeneratedCode } from '../codegen/codegen-agent.js';
import type { DesignTokens } from '../../schemas/index.js';
import type { MotionPlan } from '../../schemas/index.js';

/**
 * Dynamic import helper that TypeScript can't analyze statically.
 * This allows optional dependencies to be loaded at runtime without
 * causing compile-time errors if they're not installed.
 */
async function safeImport<T>(moduleName: string): Promise<T | null> {
  try {
    // Use Function constructor to avoid TypeScript static analysis
    const dynamicImport = new Function('name', 'return import(name)');
    return await dynamicImport(moduleName) as T;
  } catch {
    return null;
  }
}

/**
 * QAGateAgent — automated quality gate (tool-driven, NOT LLM-based).
 * 
 * At M0/M1: structural code analysis checks.
 * At M2+: runs Lighthouse CI, axe-core, Playwright against built Next.js app.
 * 
 * This agent does NOT extend BaseAgent because it's not LLM-driven.
 * It runs deterministic checks against the generated code.
 */

export interface QAGateInput {
  generatedCode: GeneratedCode;
  designTokens: DesignTokens;
  motionPlan: MotionPlan;
  /** Path to built Next.js app for browser-based checks (optional at M2, required at M3+) */
  buildOutputPath?: string;
}

/**
 * QA check mode:
 * - 'fast': lightweight structural/a11y checks only (heading hierarchy, LenisProvider,
 *   nav active-route, reduced-motion, semantic HTML). No Lighthouse/browser/CLS/token checks.
 *   Used during intermediate retry passes where structural issues are what's being fixed.
 *   Target: ~50ms per page (pure string matching, no browser launch).
 * - 'full': complete suite — all static checks + Playwright + Lighthouse + axe-core.
 *   Run once per page after it passes fast-mode, or as the final validation.
 */
export type QAMode = 'fast' | 'full';

export class QAGateAgent {
  readonly agentName = 'QA-Gate';

  async execute(input: QAGateInput, mode: QAMode = 'full'): Promise<QAReport> {
    const checks: QACheck[] = [];
    const fixTickets: FixTicket[] = [];

    const allCode = Object.entries(input.generatedCode.files);

    // Early exit: if codegen produced zero files, don't run string-matching checks
    // (they'll all produce misleading false positives)
    if (allCode.length === 0) {
      return {
        checks: [{
          name: 'zero-files-guard',
          category: 'code-quality',
          passed: false,
          severity: 'critical',
          details: 'Codegen produced zero files. All other checks skipped.',
        }],
        overallPass: false,
        fixTickets: [{
          file: 'unknown',
          issue: 'Codegen produced zero files — no code to evaluate.',
          requiredChange: 'Generate at least the core files: app/layout.tsx, app/page.tsx, app/globals.css.',
          severity: 'critical',
          relatedCheck: 'zero-files-guard',
        }],
        summary: 'QA Gate: BLOCKED — codegen produced no files.',
        timestamp: new Date().toISOString(),
      };
    }

    if (mode === 'fast') {
      // FAST mode: lightweight structural checks only (no browser, no Lighthouse)
      checks.push(...this.checkReducedMotion(allCode));
      checks.push(...this.checkSemanticHTML(allCode));
      checks.push(...this.checkHeadingHierarchy(allCode, input.generatedCode.files));
      checks.push(...this.checkLenisProvider(allCode));
      checks.push(...this.checkNavActiveRoute(allCode));
    } else {
      // FULL mode: complete suite
      checks.push(...this.checkReducedMotion(allCode));
      checks.push(...this.checkSemanticHTML(allCode));
      checks.push(...this.checkHeadingHierarchy(allCode, input.generatedCode.files));
      checks.push(...this.checkCLSPrevention(allCode));
      checks.push(...this.checkDesignTokenCompliance(allCode, input.designTokens));
      checks.push(...this.checkAccessibility(allCode));
      checks.push(...this.checkLenisProvider(allCode));
      checks.push(...this.checkNavActiveRoute(allCode));
      checks.push(...this.checkPerformance(allCode));
      checks.push(...this.checkTypeScriptQuality(allCode));

      // Run build-based bundle and code-splitting analysis if build output path provided
      if (input.buildOutputPath) {
        try {
          const bundleChecks = await this.checkBundleAndCodeSplitting(input.buildOutputPath);
          checks.push(...bundleChecks);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          checks.push({
            name: 'bundle-analysis',
            category: 'performance',
            passed: false,
            severity: 'moderate',
            details: `Bundle analysis failed: ${err.message}`,
          });
        }
      }

      // Run browser-based checks if build output path provided (M2+)
      if (input.buildOutputPath) {
        try {
          const browserChecks = await this.runBrowserChecks(input.buildOutputPath);
          checks.push(...browserChecks);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          checks.push({
            name: 'browser-checks',
            category: 'browser',
            passed: false,
            severity: 'serious',
            details: `Browser-based checks failed to run: ${err.message}`,
          });
        }
      }
    }

    // Generate fix tickets for failures
    for (const check of checks) {
      if (!check.passed && (check.severity === 'critical' || check.severity === 'serious')) {
        fixTickets.push({
          file: check.file ?? 'unknown',
          issue: check.details,
          requiredChange: this.suggestFix(check),
          severity: check.severity,
          relatedCheck: check.name,
        });
      }
    }

    const overallPass = !checks.some(
      c => !c.passed && (c.severity === 'critical' || c.severity === 'serious')
    );

    const passCount = checks.filter(c => c.passed).length;
    const failCount = checks.filter(c => !c.passed).length;

    return {
      checks,
      overallPass,
      fixTickets,
      summary: `QA Gate [${mode}]: ${passCount} passed, ${failCount} failed. ${overallPass ? 'PASSED' : 'BLOCKED — fix tickets generated.'}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run QA checks for a specific page (layout + page file + its section components).
   * Returns checks specific to that page, with overallPass indicating if the page passes.
   *
   * @param mode 'fast' runs only structural checks (~50ms); 'full' runs everything.
   */
  async checkPage(
    pagePath: string,
    pageFiles: [string, string][],
    allFiles: Record<string, string>,
    designTokens: DesignTokens,
    motionPlan: MotionPlan,
    mode: QAMode = 'full',
  ): Promise<QAReport> {
    const checks: QACheck[] = [];
    const fixTickets: FixTicket[] = [];

    if (mode === 'fast') {
      // FAST mode: only the checks that catch structural regressions introduced during codegen fixes
      // — heading hierarchy, LenisProvider wiring, nav active-route, reduced-motion, semantic HTML.
      // Skips CLS/token/performance/TypeScript/browser which are slow or don't change between passes.
      checks.push(...this.checkReducedMotion(pageFiles));
      checks.push(...this.checkSemanticHTML(pageFiles));
      checks.push(...this.checkHeadingHierarchy(pageFiles, allFiles));
      checks.push(...this.checkLenisProvider(pageFiles));
      checks.push(...this.checkNavActiveRoute(pageFiles));
    } else {
      // FULL mode: complete static analysis suite
      checks.push(...this.checkReducedMotion(pageFiles));
      checks.push(...this.checkSemanticHTML(pageFiles));
      checks.push(...this.checkHeadingHierarchy(pageFiles, allFiles));
      checks.push(...this.checkCLSPrevention(pageFiles));
      checks.push(...this.checkDesignTokenCompliance(pageFiles, designTokens));
      checks.push(...this.checkAccessibility(pageFiles));
      checks.push(...this.checkLenisProvider(pageFiles));
      checks.push(...this.checkNavActiveRoute(pageFiles));
      checks.push(...this.checkPerformance(pageFiles));
      checks.push(...this.checkTypeScriptQuality(pageFiles));
    }

    // Generate fix tickets for failures
    for (const check of checks) {
      if (!check.passed && (check.severity === 'critical' || check.severity === 'serious')) {
        fixTickets.push({
          file: check.file ?? 'unknown',
          issue: check.details,
          requiredChange: this.suggestFix(check),
          severity: check.severity,
          relatedCheck: check.name,
        });
      }
    }

    const overallPass = !checks.some(
      c => !c.passed && (c.severity === 'critical' || c.severity === 'serious')
    );

    const passCount = checks.filter(c => c.passed).length;
    const failCount = checks.filter(c => !c.passed).length;

    return {
      checks,
      overallPass,
      fixTickets,
      summary: `QA Gate [${mode}] for ${pagePath}: ${passCount} passed, ${failCount} failed. ${overallPass ? 'PASSED' : 'BLOCKED — fix tickets generated.'}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Run per-page QA checks in parallel (pages are independent of each other).
   * Returns a Map of pagePath → QAReport.
   *
   * @param pageGroups  Map of page path to [filePath, content][] pairs
   * @param allFiles    All generated files (for heading hierarchy cross-file checks)
   * @param designTokens
   * @param motionPlan
   * @param mode        'fast' during intermediate passes, 'full' for final validation
   */
  async runChecksForPages(
    pageGroups: Map<string, [string, string][]>,
    allFiles: Record<string, string>,
    designTokens: DesignTokens,
    motionPlan: MotionPlan,
    mode: QAMode = 'full',
  ): Promise<Map<string, QAReport>> {
    const entries = Array.from(pageGroups.entries());

    // Run all pages concurrently — page checks are fully independent
    const reports = await Promise.all(
      entries.map(([pagePath, pageFiles]) =>
        this.checkPage(pagePath, pageFiles, allFiles, designTokens, motionPlan, mode)
      )
    );

    const result = new Map<string, QAReport>();
    for (let i = 0; i < entries.length; i++) {
      result.set(entries[i]![0], reports[i]!);
    }
    return result;
  }

  private checkReducedMotion(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const animationFiles = files.filter(([name]) =>
      name.includes('animation') || name.includes('motion') || name.endsWith('.tsx')
    );

    for (const [fileName, content] of animationFiles) {
      const hasAnimation = content.includes('gsap') || content.includes('ScrollTrigger') ||
        content.includes('animate') || content.includes('transition') ||
        content.includes('keyframes');

      if (hasAnimation) {
        const hasReducedMotion = content.includes('prefers-reduced-motion') ||
          content.includes('reducedMotion') || content.includes('reduced-motion');

        checks.push({
          name: 'reduced-motion-handling',
          category: 'accessibility',
          passed: hasReducedMotion,
          severity: 'critical',
          details: hasReducedMotion
            ? `${fileName}: Animation code properly references reduced-motion preference.`
            : `${fileName}: Contains animation code but no prefers-reduced-motion handling.`,
          file: fileName,
        });
      }
    }

    if (checks.length === 0) {
      checks.push({
        name: 'reduced-motion-handling',
        category: 'accessibility',
        passed: true,
        severity: 'critical',
        details: 'No animation code found — reduced-motion check not applicable.',
      });
    }

    // Check for global prefers-reduced-motion handler
    const allContent = files.map(([, c]) => c).join('\n');
    const hasGlobalReducedMotion = allContent.includes('@media (prefers-reduced-motion') ||
      allContent.includes('@media (prefers-reduced-motion: reduce)') ||
      allContent.includes('prefers-reduced-motion: reduce');
    
    checks.push({
      name: 'global-reduced-motion-handler',
      category: 'accessibility',
      passed: hasGlobalReducedMotion,
      severity: 'moderate',
      details: hasGlobalReducedMotion
        ? 'Global prefers-reduced-motion media query found in styles.'
        : 'No global prefers-reduced-motion handler found. Add @media (prefers-reduced-motion: reduce) to disable animations globally.',
    });

    return checks;
  }

  private checkSemanticHTML(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const tsxFiles = files.filter(([name]) => name.endsWith('.tsx'));

    for (const [fileName, content] of tsxFiles) {
      const hasSemanticElements =
        content.includes('<section') || content.includes('<article') ||
        content.includes('<header') || content.includes('<nav') ||
        content.includes('<main') || content.includes('<footer');

      checks.push({
        name: 'semantic-html',
        category: 'accessibility',
        passed: hasSemanticElements,
        severity: 'serious',
        details: hasSemanticElements
          ? `${fileName}: Uses semantic HTML elements.`
          : `${fileName}: Missing semantic HTML elements (section, article, header, etc.).`,
        file: fileName,
      });

      if (content.includes('<div') && !hasSemanticElements) {
        checks.push({
          name: 'div-soup',
          category: 'accessibility',
          passed: false,
          severity: 'moderate',
          details: `${fileName}: Uses <div> without semantic alternatives. Consider <section>, <article>, etc.`,
          file: fileName,
        });
      }
    }

    return checks;
  }

  /**
   * Check heading hierarchy PER PAGE.
   * Groups files by page (layout.tsx + page.tsx + section components) and verifies
   * page-wide hierarchy: exactly one h1 per page, no skipped heading levels.
   */
  private checkHeadingHierarchy(
    files: Array<[string, string]>,
    allFiles: Record<string, string>
  ): QACheck[] {
    const checks: QACheck[] = [];
    const tsxFiles = files.filter(([name]) => name.endsWith('.tsx'));

    // Build a map of which components are imported by which page
    // For each page file (app/page.tsx, app/*/page.tsx), find its imported components
    const pageFileEntries = tsxFiles.filter(([name]) => 
      name === 'app/page.tsx' || (name.startsWith('app/') && name.endsWith('/page.tsx'))
    );

    const layoutFile = tsxFiles.find(([name]) => name === 'app/layout.tsx');
    const sectionFiles = tsxFiles.filter(([name]) => name.startsWith('components/') && name.endsWith('.tsx'));

    // If no page files found, check single page (M1 mode)
    if (pageFileEntries.length === 0) {
      return this.checkSinglePageHierarchy(tsxFiles, layoutFile ? layoutFile[0] : undefined);
    }

    // For each page, check its heading hierarchy
    for (const [pageFileName, pageContent] of pageFileEntries) {
      // Find section components imported by this page
      const importedSections = this.findImportedSections(pageContent, sectionFiles);
      
      // Collect files for this page: layout + page + its imported sections
      const pageFiles: [string, string][] = [];
      if (layoutFile) pageFiles.push(layoutFile);
      pageFiles.push([pageFileName, pageContent]);
      pageFiles.push(...importedSections);

      const pageChecks = this.checkSinglePageHierarchy(pageFiles, layoutFile ? layoutFile[0] : undefined);
      // Prefix check names with page for clarity
      for (const check of pageChecks) {
        check.name = `heading-hierarchy-${pageFileName.replace('app/', '').replace('/page.tsx', '') || 'home'}`;
        if (check.details) {
          check.details = `${pageFileName}: ${check.details}`;
        }
        if (check.file) {
          check.file = pageFileName;
        }
      }
      checks.push(...pageChecks);
    }

    return checks;
  }

  /**
   * Check heading hierarchy for a single page (layout + page + its sections)
   */
  private checkSinglePageHierarchy(
    pageFiles: [string, string][],
    layoutFileName?: string
  ): QACheck[] {
    const checks: QACheck[] = [];

    // Collect all headings across the page files
    const allHeadings: Array<{ level: number; file: string; text: string }> = [];

    for (const [fileName, content] of pageFiles) {
      const headingMatches = content.match(/<h([1-6])[^>]*>([^<]*)<\/h[1-6]>/gi);
      if (headingMatches) {
        for (const match of headingMatches) {
          const levelMatch = match.match(/<h([1-6])/i);
          const textMatch = match.match(/<h[1-6][^>]*>([^<]*)<\/h[1-6]>/i);
          const level = levelMatch ? parseInt(levelMatch[1]!, 10) : 0;
          const text = textMatch ? textMatch[1]!.trim() : '';
          if (level > 0) {
            allHeadings.push({ level, file: fileName, text });
          }
        }
      }
    }

    // Check page-wide hierarchy
    if (allHeadings.length === 0) {
      checks.push({
        name: 'heading-hierarchy',
        category: 'accessibility',
        passed: true,
        severity: 'moderate',
        details: 'No headings found across page files — hierarchy check not applicable.',
      });
      return checks;
    }

    // Check: exactly one h1 across the page
    const h1Count = allHeadings.filter(h => h.level === 1).length;
    if (h1Count !== 1) {
      checks.push({
        name: 'heading-hierarchy',
        category: 'accessibility',
        passed: false,
        severity: 'serious',
        details: `Page has ${h1Count} <h1> elements (expected exactly 1). Found in: ${allHeadings.filter(h => h.level === 1).map(h => `${h.file}: "${h.text}"`).join(', ')}`,
      });
    } else {
      checks.push({
        name: 'heading-hierarchy',
        category: 'accessibility',
        passed: true,
        severity: 'moderate',
        details: `Page has exactly one <h1> as required.`,
      });
    }

    // Check: no skipped heading levels across the page
    let prevLevel = 0;
    let hierarchyValid = true;
    let hierarchyDetails = 'Heading hierarchy is valid across page.';
    
    // Sort by file order: layout first, then page, then sections
    const fileOrder = ['app/layout.tsx', 'app/page.tsx'];
    const sortedHeadings = [...allHeadings].sort((a, b) => {
      const aIdx = fileOrder.indexOf(a.file);
      const bIdx = fileOrder.indexOf(b.file);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.file.localeCompare(b.file);
    });

    for (const heading of sortedHeadings) {
      if (prevLevel === 0) {
        if (heading.level !== 1) {
          hierarchyValid = false;
          hierarchyDetails = `First heading should be <h1>, found <h${heading.level}> in ${heading.file}: "${heading.text}"`;
          break;
        }
      } else {
        if (heading.level > prevLevel + 1) {
          hierarchyValid = false;
          hierarchyDetails = `Heading level skips from <h${prevLevel}> to <h${heading.level}> in ${heading.file}: "${heading.text}"`;
          break;
        }
      }
      prevLevel = heading.level;
    }

    if (!hierarchyValid) {
      checks.push({
        name: 'heading-hierarchy',
        category: 'accessibility',
        passed: false,
        severity: 'serious',
        details: hierarchyDetails,
      });
    } else if (h1Count === 1) {
      checks.push({
        name: 'heading-hierarchy',
        category: 'accessibility',
        passed: true,
        severity: 'moderate',
        details: 'Page-wide heading hierarchy is valid (exactly one h1, no skipped levels).',
      });
    }

    return checks;
  }

  /**
   * Find section components imported by a page file
   */
  private findImportedSections(pageContent: string, sectionFiles: [string, string][]): [string, string][] {
    const imported: [string, string][] = [];
    
    // Look for import statements that reference section components
    const importMatches = pageContent.match(/import\s+\{?\s*(\w+)\s*\}?\s+from\s+['"]([^'"]+)['"]/g);
    if (!importMatches) return [];
    
    const importedNames = new Set<string>();
    for (const match of importMatches) {
      const matchResult = match.match(/import\s+\{?\s*(\w+)\s*\}?\s+from\s+['"]([^'"]+)['"]/);
      if (matchResult && matchResult[1] && matchResult[2]) {
        const importedName = matchResult[1];
        const importPath = matchResult[2];
        if (importPath.startsWith('../components/') || importPath.startsWith('./components/') || importPath.startsWith('@/components/')) {
          importedNames.add(importedName);
        }
      }
      
      // Find matching section files
      for (const [fileName, content] of sectionFiles) {
        const componentName = fileName.replace('components/', '').replace('.tsx', '');
        if (importedNames.has(componentName)) {
          imported.push([fileName, content]);
        }
      }
    }
    
return imported;
  }

  private checkCLSPrevention(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const tsxFiles = files.filter(([name]) => name.endsWith('.tsx'));

    for (const [fileName, content] of tsxFiles) {
      if (content.includes('<img') || content.includes('<Image')) {
        const hasImageDimensions =
          (content.includes('width') && content.includes('height')) ||
          content.includes('aspect-ratio') ||
          content.includes('fill');

        checks.push({
          name: 'cls-image-dimensions',
          category: 'performance',
          passed: hasImageDimensions,
          severity: 'serious',
          details: hasImageDimensions
            ? `${fileName}: Images have explicit dimensions or aspect-ratio.`
            : `${fileName}: Images missing width/height or aspect-ratio — will cause CLS.`,
          file: fileName,
        });
      }

      const animatesLayout =
        /animate.*(?:width|height|top|left|right|bottom|margin|padding)/i.test(content) &&
        !content.includes('transform');

      if (animatesLayout) {
        checks.push({
          name: 'cls-animation-properties',
          category: 'performance',
          passed: false,
          severity: 'serious',
          details: `${fileName}: Animates layout-triggering properties (width/height/top/left). Use transform instead.`,
          file: fileName,
        });
      }
    }

    return checks;
  }

  private checkDesignTokenCompliance(
    files: Array<[string, string]>,
    tokens: DesignTokens,
  ): QACheck[] {
    const checks: QACheck[] = [];
    const styleFiles = files.filter(([name]) =>
      name.endsWith('.css') || name.endsWith('.tsx') || name.endsWith('.ts')
    );

    for (const [fileName, content] of styleFiles) {
      if (!fileName.endsWith('.css')) continue;

      const hasCustomProperties = content.includes('var(--');
      const hasHardcodedColors = /(?:color|background|border)(?![^(]*\)):\s*#[0-9a-fA-F]{3,8}/g.test(content);

      checks.push({
        name: 'design-token-usage',
        category: 'design-token-compliance',
        passed: hasCustomProperties && !hasHardcodedColors,
        severity: 'moderate',
        details: hasCustomProperties && !hasHardcodedColors
          ? `${fileName}: Uses CSS custom properties, no hardcoded colors.`
          : `${fileName}: ${!hasCustomProperties ? 'Not using CSS custom properties. ' : ''}${hasHardcodedColors ? 'Contains hardcoded color values — use design tokens instead.' : ''}`,
        file: fileName,
      });
    }

    const allContent = files.map(([, c]) => c).join('\n');
    const usesTokenFonts =
      allContent.includes(tokens.typography.displayFont.family) ||
      allContent.includes(tokens.typography.textFont.family);

    checks.push({
      name: 'typography-token-compliance',
      category: 'design-token-compliance',
      passed: usesTokenFonts,
      severity: 'serious',
      details: usesTokenFonts
        ? `Code references design token typefaces (${tokens.typography.displayFont.family}, ${tokens.typography.textFont.family}).`
        : `Code does not reference the design token typefaces. Expected: ${tokens.typography.displayFont.family}, ${tokens.typography.textFont.family}.`,
    });

    return checks;
  }

  private checkAccessibility(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const tsxFiles = files.filter(([name]) => name.endsWith('.tsx'));

    for (const [fileName, content] of tsxFiles) {
      if (content.includes('outline: none') || content.includes('outline:none')) {
        const hasFocusVisible = content.includes(':focus-visible') || content.includes('focusVisible');
        checks.push({
          name: 'focus-visible',
          category: 'accessibility',
          passed: hasFocusVisible,
          severity: 'serious',
          details: hasFocusVisible
            ? `${fileName}: Removes default outline but provides :focus-visible replacement.`
            : `${fileName}: Removes outline without :focus-visible replacement — keyboard users lose focus visibility.`,
          file: fileName,
        });
      }

      if (content.includes('<Canvas') || content.includes('<canvas')) {
        const hasAriaLabel = content.includes('aria-label') || content.includes('aria-describedby');
        checks.push({
          name: 'canvas-accessibility',
          category: 'accessibility',
          passed: hasAriaLabel,
          severity: 'serious',
          details: hasAriaLabel
            ? `${fileName}: Canvas/3D element has ARIA description.`
            : `${fileName}: Canvas/3D element missing aria-label or aria-describedby.`,
          file: fileName,
        });

        const hasFocusVisible = content.includes(':focus-visible') || content.includes('focusVisible');
        checks.push({
          name: 'canvas-focus-visible',
          category: 'accessibility',
          passed: hasFocusVisible,
          severity: 'serious',
          details: hasFocusVisible
            ? `${fileName}: Canvas/3D element has :focus-visible styles.`
            : `${fileName}: Canvas/3D element missing :focus-visible styles — keyboard users cannot see focus.`,
          file: fileName,
        });
      }

      const imgMatches = content.match(/<(?:img|Image)\s[^>]*>/g) ?? [];
      for (const imgTag of imgMatches) {
        const hasAlt = /alt=/.test(imgTag);
        checks.push({
          name: 'image-alt-text',
          category: 'accessibility',
          passed: hasAlt,
          severity: 'critical',
          details: hasAlt
            ? `${fileName}: Image has alt attribute.`
            : `${fileName}: Image missing alt attribute.`,
          file: fileName,
        });
      }
    }

    return checks;
  }

  /**
   * Check that a single LenisProvider wraps the root layout
   * and no duplicate `new Lenis()` instantiations exist
   */
  private checkLenisProvider(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const allContent = files.map(([, c]) => c).join('\n');
    
    // Check for LenisProvider in layout.tsx
    const layoutFiles = files.filter(([name]) => name === 'app/layout.tsx');
    let hasLenisProvider = false;
    
    for (const [fileName, content] of layoutFiles) {
      if (content.includes('LenisProvider') || content.includes('lenis-provider')) {
        hasLenisProvider = true;
        checks.push({
          name: 'lenis-provider-exists',
          category: 'accessibility',
          passed: true,
          severity: 'critical',
          details: `${fileName}: LenisProvider found in root layout.`,
          file: fileName,
        });
        break;
      }
    }
    
    if (!hasLenisProvider) {
      checks.push({
        name: 'lenis-provider-exists',
        category: 'accessibility',
        passed: false,
        severity: 'critical',
        details: 'No LenisProvider found in app/layout.tsx. All scroll animations require a single shared LenisProvider in the root layout.',
      });
    }
    
    // Check for duplicate `new Lenis()` instantiations
    const lenisInstantiations = (allContent.match(/new\s+Lenis\(/g) || []).length;
    if (lenisInstantiations > 1) {
      checks.push({
        name: 'lenis-single-instance',
        category: 'accessibility',
        passed: false,
        severity: 'critical',
        details: `Found ${lenisInstantiations} 'new Lenis()' instantiations. Only one Lenis instance should be created (in LenisProvider).`,
      });
    } else if (lenisInstantiations === 1) {
      checks.push({
        name: 'lenis-single-instance',
        category: 'accessibility',
        passed: true,
        severity: 'critical',
        details: 'Exactly one Lenis instance instantiated.',
      });
    }
    
    // Check for multiple LenisProvider components
    const lenisProviderCount = (allContent.match(/<\s*LenisProvider\b/g) || []).length;
    if (lenisProviderCount > 1) {
      checks.push({
        name: 'lenis-provider-single',
        category: 'accessibility',
        passed: false,
        severity: 'critical',
        details: `Found ${lenisProviderCount} LenisProvider components. Only one should exist in app/layout.tsx.`,
      });
    }
    
    return checks;
  }

  /**
   * Check for nav active-route logic: confirm Navbar.tsx uses usePathname()/
   * useRouter() and sets aria-current="page" on the active link
   */
  private checkNavActiveRoute(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const navFiles = files.filter(([name]) => name === 'components/Navbar.tsx' || name.includes('/Navbar.tsx'));
    
    for (const [fileName, content] of navFiles) {
      // Check for usePathname or useRouter import
      const hasNavigationHook = content.includes('usePathname') || content.includes('useRouter');
      checks.push({
        name: 'nav-active-route-hook',
        category: 'accessibility',
        passed: hasNavigationHook,
        severity: 'serious',
        details: hasNavigationHook
          ? `${fileName}: Uses navigation hook (usePathname/useRouter) for active route detection.`
          : `${fileName}: Missing usePathname/useRouter hook for active route highlighting.`,
        file: fileName,
      });
      
      // Check for aria-current="page" on active links
      const hasAriaCurrent = content.includes('aria-current="page"') || content.includes("aria-current='page'");
      checks.push({
        name: 'nav-aria-current',
        category: 'accessibility',
        passed: hasAriaCurrent,
        severity: 'serious',
        details: hasAriaCurrent
          ? `${fileName}: Active link has aria-current="page".`
          : `${fileName}: Active link missing aria-current="page".`,
        file: fileName,
      });
      
      // Check for active class/style logic
      const hasActiveLogic = content.includes('pathname') && (content.includes('className') || content.includes('style')) && 
        (content.includes('===') || content.includes('==') || content.includes('includes'));
      checks.push({
        name: 'nav-active-styling',
        category: 'accessibility',
        passed: hasActiveLogic,
        severity: 'moderate',
        details: hasActiveLogic
          ? `${fileName}: Active link styling logic detected.`
          : `${fileName}: No active link styling logic detected based on pathname.`,
        file: fileName,
      });
    }
    
    if (navFiles.length === 0) {
      checks.push({
        name: 'nav-active-route-hook',
        category: 'accessibility',
        passed: false,
        severity: 'serious',
        details: 'No Navbar.tsx component found. Active route logic cannot be verified.',
      });
    }
    
    return checks;
  }

  private checkPerformance(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];

    for (const [fileName, content] of files) {
      if (content.includes('@font-face') || content.includes('font-display')) {
        const hasFontDisplay = content.includes('font-display');
        checks.push({
          name: 'font-display-strategy',
          category: 'performance',
          passed: hasFontDisplay,
          severity: 'moderate',
          details: hasFontDisplay
            ? `${fileName}: Has font-display strategy.`
            : `${fileName}: @font-face without font-display — may cause FOIT/FOUT.`,
          file: fileName,
        });
      }
    }

    return checks;
  }

  private checkTypeScriptQuality(files: Array<[string, string]>): QACheck[] {
    const checks: QACheck[] = [];
    const tsFiles = files.filter(([name]) => name.endsWith('.ts') || name.endsWith('.tsx'));

    for (const [fileName, content] of tsFiles) {
      const hasAny = /:\s*any\b/.test(content) || /as\s+any\b/.test(content);
      checks.push({
        name: 'no-any-type',
        category: 'code-quality',
        passed: !hasAny,
        severity: 'moderate',
        details: hasAny
          ? `${fileName}: Uses 'any' type — use specific types instead.`
          : `${fileName}: No 'any' type usage.`,
        file: fileName,
      });
    }

    return checks;
  }

  /**
   * Check bundle size and code splitting by analyzing the actual Next.js build output
   * This replaces the string-based source analysis with real build artifact analysis
   */
  private async checkBundleAndCodeSplitting(buildOutputPath: string): Promise<QACheck[]> {
    const checks: QACheck[] = [];
    
    try {
      const path = await safeImport<{ join: any; resolve: any }>('path');
      const fs = await safeImport<{ existsSync: any; readFileSync: any; readdirSync: any; statSync: any }>('fs');
      
      if (!path || !fs) {
        checks.push({
          name: 'bundle-analysis',
          category: 'performance',
          passed: false,
          severity: 'moderate',
          details: 'Required modules (path, fs) not available for bundle analysis.',
        });
        return checks;
      }
      
      const nextBuildPath = path.join(buildOutputPath, '.next');
      if (!fs.existsSync(nextBuildPath)) {
        checks.push({
          name: 'bundle-analysis',
          category: 'performance',
          passed: false,
          severity: 'serious',
          details: `Next.js build output not found at ${nextBuildPath}. Run \`next build\` first.`,
        });
        return checks;
      }
      
      // Analyze bundle sizes from .next/build-manifest.json and page chunks
      const buildManifestPath = path.join(nextBuildPath, 'build-manifest.json');
      if (!fs.existsSync(buildManifestPath)) {
        checks.push({
          name: 'bundle-manifest',
          category: 'performance',
          passed: false,
          severity: 'serious',
          details: 'build-manifest.json not found in .next directory.',
        });
        return checks;
      }
      
      const buildManifest = JSON.parse(fs.readFileSync(buildManifestPath, 'utf-8'));
      const pages = buildManifest.pages || {};
      
      // Check for duplicate heavy library chunks across pages
      const heavyLibs = ['gsap', 'scrolltrigger', 'three', '@react-three/fiber', 'lenis'];
      const libPageCounts = new Map<string, number>();
      
      for (const [pagePath, chunks] of Object.entries(pages)) {
        if (typeof chunks === 'object' && chunks !== null) {
          for (const chunk of Object.values(chunks)) {
            if (typeof chunk === 'string') {
              for (const lib of heavyLibs) {
                if (chunk.includes(lib)) {
                  libPageCounts.set(lib, (libPageCounts.get(lib) || 0) + 1);
                }
              }
            }
          }
        }
      }
      
      // Check for code splitting - pages with heavy libs should have separate chunks
      for (const [lib, count] of libPageCounts.entries()) {
        const threshold = ['three', '@react-three/fiber'].includes(lib) ? 1 : 2;
        if (count > threshold) {
          checks.push({
            name: 'bundle-size',
            category: 'performance',
            passed: false,
            severity: 'moderate',
            details: `${lib} appears in ${count} page chunks (threshold: ${threshold}). Consider code-splitting or shared chunk in layout.`,
          });
        } else if (count > 0) {
          checks.push({
            name: 'bundle-size',
            category: 'performance',
            passed: true,
            severity: 'moderate',
            details: `${lib} appears in ${count} page chunks (within threshold).`,
          });
        }
      }
      
      // Check for code splitting - heavy libs should be in separate chunks per page
      const pageChunkDir = path.join(nextBuildPath, 'server', 'app');
      if (fs.existsSync(pageChunkDir)) {
        const pageDirs = fs.readdirSync(pageChunkDir);
        let hasDynamicImports = false;
        
        for (const pageDir of pageDirs) {
          const pagePath = path.join(pageChunkDir, pageDir);
          if (fs.statSync(pagePath).isDirectory()) {
            const chunkFiles = fs.readdirSync(pagePath);
            const dynamicChunks = chunkFiles.filter((f: string) => f.includes('.js') && !f.match(/^page-\w+\.js$/));
            if (dynamicChunks.length > 0) {
              hasDynamicImports = true;
            }
          }
        }
        
if (!hasDynamicImports) {
          // Check if any heavy libs are used
          const hasHeavyLibs = ['gsap', 'three', '@react-three/fiber'].some(lib => 
            Array.from(libPageCounts.keys()).includes(lib)
          );
          if (hasHeavyLibs) {
            checks.push({
              name: 'code-splitting-3d',
              category: 'performance',
              passed: false,
              severity: 'serious',
              details: 'Heavy animation/3D libraries detected but no dynamic import chunks found. Use next/dynamic for lazy loading heavy components.',
            });
          } else {
            checks.push({
              name: 'code-splitting-3d',
              category: 'performance',
              passed: true,
              severity: 'moderate',
              details: 'No heavy 3D libraries detected - code splitting not required.',
            });
          }
        }
      }
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        checks.push({
          name: 'bundle-analysis',
          category: 'performance',
          passed: false,
          severity: 'moderate',
          details: `Bundle analysis failed: ${err.message}`,
        });
      }
      
      return checks;
    }

  /**
   * Run browser-based checks using Lighthouse CI, axe-core, and Playwright
   * Requires buildOutputPath to point to a built Next.js application
   */
  private async runBrowserChecks(buildOutputPath: string): Promise<QACheck[]> {
    const checks: QACheck[] = [];

    // Start a local server for the built Next.js app
    const serverInfo = await this.startTestServer(buildOutputPath);
    if (!serverInfo) {
      checks.push({
        name: 'browser-checks',
        category: 'browser',
        passed: false,
        severity: 'serious',
        details: 'Failed to start test server for browser-based checks.',
      });
      return checks;
    }

    const baseUrl = `http://localhost:${serverInfo.port}`;

    try {
      // Run Lighthouse CI for performance metrics
      const lighthouseChecks = await this.runLighthouseChecks(baseUrl);
      checks.push(...lighthouseChecks);

      // Run axe-core accessibility audit via Playwright
      const axeChecks = await this.runAxeAccessibilityChecks(baseUrl);
      checks.push(...axeChecks);

      // Run Playwright smoke tests
      const playwrightChecks = await this.runPlaywrightSmokeTests(baseUrl);
      checks.push(...playwrightChecks);
    } finally {
      // Always stop the test server
      serverInfo.server.close();
    }

    return checks;
  }

  /**
   * Start a local HTTP server serving the built Next.js app
   * Uses a minimal static file server approach
   */
  private async startTestServer(buildOutputPath: string): Promise<{ server: any; port: number } | null> {
    try {
      // Use a simple approach: serve the .next/server directory with a basic HTTP server
      const httpModule = await safeImport<{ createServer: any }>('http');
      const pathModule = await safeImport<{ join: any; extname: any }>('path');
      const fsModule = await safeImport<{ existsSync: any; readFileSync: any }>('fs');
      
      if (!httpModule?.createServer || !pathModule?.join || !fsModule?.existsSync) {
        console.warn('Required modules not available for test server');
        return null;
      }
      
      const { createServer } = httpModule;
      const { join, extname } = pathModule;
      const { existsSync, readFileSync } = fsModule;
      
      // Check if the build output exists
      const nextServerPath = pathModule.join(buildOutputPath, '.next', 'server');
      if (!existsSync(nextServerPath)) {
        console.warn(`Build output not found at ${nextServerPath}`);
        return null;
      }
      
      // Find an available port
      const port = await this.findAvailablePort(3000);
      
      // Create a simple static file server
      const server = createServer(async (req: any, res: any) => {
        const url = new URL(req.url || '/', `http://localhost:${port}`);
        let filePath = pathModule.join(nextServerPath, url.pathname);
        
        // Handle directory requests
        if (filePath.endsWith('/')) {
          filePath = pathModule.join(filePath, 'index.html');
        }
        
        // Add .html extension if not present and file doesn't exist
        if (!existsSync(filePath) && !filePath.endsWith('.html')) {
          const htmlPath = filePath + '.html';
          if (existsSync(htmlPath)) {
            filePath = htmlPath;
          }
        }
        
        if (existsSync(filePath)) {
          const content = readFileSync(filePath);
          const ext = extname(filePath);
          const contentType = ext === '.html' ? 'text/html' : 
                             ext === '.js' ? 'application/javascript' :
                             ext === '.css' ? 'text/css' :
                             ext === '.json' ? 'application/json' :
                             'text/plain';
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });
      
      return new Promise((resolve, reject) => {
        server.listen(port, () => {
          resolve({ server, port });
        });
        server.on('error', reject);
        setTimeout(() => reject(new Error('Server start timeout')), 10000);
      });
    } catch (error) {
      console.warn('Failed to start test server:', error);
      return null;
    }
  }

  /**
   * Find an available port starting from the given port
   */
  private async findAvailablePort(startPort: number): Promise<number> {
    const netModule = await safeImport<{ createServer: any }>('net');
    
    if (!netModule) {
      return startPort;
    }
    
    const { createServer } = netModule;
    
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.listen(startPort, () => {
        const port = (server.address() as any).port;
        server.close(() => resolve(port));
      });
      server.on('error', () => resolve(this.findAvailablePort(startPort + 1)));
    });
  }

  /**
   * Run Lighthouse CI against the base URL
   */
  private async runLighthouseChecks(baseUrl: string): Promise<QACheck[]> {
    const checks: QACheck[] = [];
    
    try {
      const lighthouseModule = await safeImport<{ default: any }>('lighthouse');
      const chromeLauncherModule = await safeImport<{ default: any }>('chrome-launcher');
      
      if (!lighthouseModule || !chromeLauncherModule) {
        checks.push({
          name: 'lighthouse-performance',
          category: 'browser',
          passed: false,
          severity: 'moderate',
          details: 'Lighthouse or chrome-launcher not installed. Install with `npm install lighthouse chrome-launcher` to enable performance auditing.',
        });
        return checks;
      }
      
      const lighthouse = lighthouseModule.default;
      const chromeLauncher = chromeLauncherModule.default;
      
      const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu'] });
      const runnerResult = await lighthouse(baseUrl, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: ['performance', 'accessibility', 'best-practices'],
      });
      await chrome.kill();
      
      const lhr = runnerResult.lhr;
      
      // Check CLS = 0
      const clsScore = lhr.categories.performance?.score ?? 0;
      const clsMetric = lhr.audits['cumulative-layout-shift']?.numericValue ?? 0;
      
      checks.push({
        name: 'lighthouse-cls',
        category: 'browser',
        passed: clsMetric === 0,
        severity: 'critical',
        details: `CLS: ${clsMetric} (must be 0)`,
      });
      
      // Check INP < 200ms
      const inpMetric = lhr.audits['interaction-to-next-paint']?.numericValue ?? 0;
      checks.push({
        name: 'lighthouse-inp',
        category: 'browser',
        passed: inpMetric < 200,
        severity: 'critical',
        details: `INP: ${inpMetric}ms (must be < 200ms)`,
      });
      
      // Overall performance score
      checks.push({
        name: 'lighthouse-performance',
        category: 'browser',
        passed: (clsScore ?? 0) >= 0.9,
        severity: 'serious',
        details: `Lighthouse Performance Score: ${Math.round((clsScore ?? 0) * 100)}/100`,
      });
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      checks.push({
        name: 'lighthouse-performance',
        category: 'browser',
        passed: false,
        severity: 'moderate',
        details: `Lighthouse check failed: ${err.message}. Install lighthouse and chrome-launcher.`,
      });
    }
    
    return checks;
  }

  /**
   * Run axe-core accessibility audit via Playwright
   */
  private async runAxeAccessibilityChecks(baseUrl: string): Promise<QACheck[]> {
    const checks: QACheck[] = [];
    
    try {
      const playwrightModule = await safeImport<{ chromium: any }>('playwright');
      const axeCoreModule = await safeImport<{ default: any }>('axe-core');
      
      if (!playwrightModule || !axeCoreModule) {
        checks.push({
          name: 'axe-accessibility',
          category: 'browser',
          passed: false,
          severity: 'moderate',
          details: 'Playwright or axe-core not installed. Install with `npm install playwright axe-core` to enable accessibility auditing.',
        });
        return checks;
      }
      
      const { chromium } = playwrightModule;
      const axeCore = axeCoreModule.default;
      
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      // Test main page and common routes
      const routes = ['/', '/features', '/pricing'];
      
      for (const route of routes) {
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        
        // Inject axe-core
        await page.addScriptTag({ content: axeCoreModule.default.toString() });
        
        // Run axe
        const results = await page.evaluate(async () => {
          // @ts-ignore
          return await axeCore.run(document, { runOnly: { type: 'tag', values: ['wcag2aa', 'wcag21aa'] } });
        });
        
        const violations = results.violations.filter((v: any) => 
          v.impact === 'critical' || v.impact === 'serious'
        );
        
        if (violations.length > 0) {
          checks.push({
            name: `axe-accessibility-${route.replace('/', '') || 'home'}`,
            category: 'browser',
            passed: false,
            severity: 'critical',
            details: `${route}: ${violations.length} critical/serious accessibility violations found`,
          });
        } else {
          checks.push({
            name: `axe-accessibility-${route.replace('/', '') || 'home'}`,
            category: 'browser',
            passed: true,
            severity: 'critical',
            details: `${route}: No critical/serious accessibility violations`,
          });
        }
        
        // Check landmark regions
        const landmarks = await page.evaluate(() => {
          const elements = document.querySelectorAll('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]');
          return Array.from(elements).map(el => el.getAttribute('role'));
        });
        
        const hasBanner = landmarks.includes('banner');
        const hasNav = landmarks.includes('navigation');
        const hasMain = landmarks.includes('main');
        const hasContentInfo = landmarks.includes('contentinfo');
        
        checks.push({
          name: `landmark-regions-${route.replace('/', '') || 'home'}`,
          category: 'browser',
          passed: hasBanner && hasNav && hasMain && hasContentInfo,
          severity: 'serious',
          details: `${route}: Landmarks - banner: ${hasBanner}, nav: ${hasNav}, main: ${hasMain}, contentinfo: ${hasContentInfo}`,
        });
      }
      
      await browser.close();
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      checks.push({
        name: 'axe-accessibility',
        category: 'browser',
        passed: false,
        severity: 'moderate',
        details: `axe-core/Playwright check failed: ${err.message}. Install playwright and axe-core.`,
      });
    }
    
    return checks;
  }

  /**
   * Run Playwright smoke tests
   */
  private async runPlaywrightSmokeTests(baseUrl: string): Promise<QACheck[]> {
    const checks: QACheck[] = [];
    
    try {
      const playwrightModule = await safeImport<{ chromium: any }>('playwright');
      
      if (!playwrightModule) {
        checks.push({
          name: 'playwright-smoke',
          category: 'browser',
          passed: false,
          severity: 'moderate',
          details: 'Playwright not installed. Install with `npm install playwright` to enable browser automation tests.',
        });
        return checks;
      }
      
      const { chromium } = playwrightModule;
      
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      
      // Test navigation between pages
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      
      // Check that page loads
      checks.push({
        name: 'playwright-homepage-load',
        category: 'browser',
        passed: true,
        severity: 'serious',
        details: 'Homepage loads successfully',
      });
      
      // Test navigation links
      const navLinks = await page.evaluate(() => {
        const links = document.querySelectorAll('nav a[href]');
        return Array.from(links).map(a => (a as HTMLAnchorElement).href);
      });
      
      for (const href of navLinks.slice(0, 3)) { // Test first 3 nav links
        try {
          await page.goto(href, { waitUntil: 'networkidle', timeout: 10000 });
          checks.push({
            name: `playwright-nav-${new URL(href).pathname.replace('/', '') || 'home'}`,
            category: 'browser',
            passed: true,
            severity: 'serious',
            details: `Navigation to ${href} successful`,
          });
        } catch (error) {
          checks.push({
            name: `playwright-nav-${new URL(href).pathname.replace('/', '') || 'home'}`,
            category: 'browser',
            passed: false,
            severity: 'serious',
            details: `Navigation to ${href} failed: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      }
      
      // Test reduced-motion handling
      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedMotionWorks = await page.evaluate(() => {
        const styles = window.getComputedStyle(document.body);
        return styles.animationDuration === '0.01ms' || styles.transitionDuration === '0.01ms';
      });
      
      checks.push({
        name: 'playwright-reduced-motion',
        category: 'browser',
        passed: reducedMotionWorks,
        severity: 'critical',
        details: reducedMotionWorks ? 'Reduced motion preference respected' : 'Reduced motion not properly handled',
      });
      
      await browser.close();
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      checks.push({
        name: 'playwright-smoke',
        category: 'browser',
        passed: false,
        severity: 'moderate',
        details: `Playwright smoke tests failed: ${err.message}. Install playwright.`,
      });
    }
    
    return checks;
  }

  private suggestFix(check: QACheck): string {
    switch (check.name) {
      case 'reduced-motion-handling':
        return 'Add prefers-reduced-motion media query check. Wrap animation code in a matchMedia("(prefers-reduced-motion: reduce)") guard. Kill or skip animations when reduced motion is preferred.';
      case 'semantic-html':
        return 'Replace generic <div> wrappers with semantic elements: <section> for thematic groupings, <header> for introductory content, <nav> for navigation, <main> for primary content.';
      case 'cls-image-dimensions':
        return 'Add explicit width and height attributes to all <img>/<Image> elements, or use CSS aspect-ratio. For Next.js Image, use the fill prop with a sized container.';
      case 'cls-animation-properties':
        return 'Replace width/height/top/left animations with transform: translateX/Y/scale. These are compositor-only and do not trigger layout.';
      case 'focus-visible':
        return 'Add :focus-visible styles with a visible ring/border (at least 2px, 3:1 contrast) whenever removing default outline.';
      case 'canvas-accessibility':
        return 'Wrap <Canvas> in a <div role="img" aria-label="Description of the 3D content">. Add meaningful description for screen readers.';
      case 'canvas-focus-visible':
        return 'Add :focus-visible styles to canvas/3D elements with a visible ring/border (at least 2px, 3:1 contrast) so keyboard users can see focus.';
      case 'image-alt-text':
        return 'Add alt="descriptive text" to all <img>/<Image> elements. Use alt="" for purely decorative images.';
      case 'design-token-usage':
        return 'Replace hardcoded color values (#hex, rgb()) with CSS custom properties (var(--color-*)). Generate custom properties from design-tokens.json.';
      case 'typography-token-compliance':
        return 'Use the font families specified in design-tokens.json. Import them via next/font or @font-face.';
      case 'heading-hierarchy':
        return 'Ensure heading levels follow a logical hierarchy across the ENTIRE PAGE: exactly one <h1> in layout/page, then <h2> for sections, <h3> for subsections. Never skip levels.';
      case 'global-reduced-motion-handler':
        return 'Add a global @media (prefers-reduced-motion: reduce) block to disable or simplify all animations. Example: @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }';
      case 'bundle-size':
        return 'Reduce duplicate imports of heavy libraries. Move GSAP/Lenis/Three.js imports to shared layout.tsx or use dynamic imports for page-specific heavy components.';
      case 'code-splitting-3d':
        return 'Wrap 3D components (R3F/Three.js) in next/dynamic(() => import("./My3DComponent"), { ssr: false, loading: () => <Placeholder /> }) to lazy-load only when needed.';
      case 'page-code-splitting':
        return 'Use next/dynamic to lazy-load heavy section components on pages that contain animation/3D content.';
      case 'lighthouse-performance':
        return 'Run Lighthouse CI against the built Next.js app. Verify CLS=0, INP<200ms, LCP<2.5s. Fix any failing metrics.';
      case 'axe-accessibility':
        return 'Run axe-core via Playwright against each built page. Fix all serious/critical violations before shipping.';
      case 'playwright-smoke':
        return 'Write Playwright tests for: navigation between pages, anchor scroll behavior, form submissions, reduced-motion toggle, and mobile viewport.';
      default:
        return `Fix the issue described: ${check.details}`;
    }
  }
}