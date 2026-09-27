import { z } from 'zod';
import { BaseAgent } from '../base-agent.js';
import type { AgentResult } from '../base-agent.js';
import { AgentValidationError } from '../base-agent.js';
import { CriticReportSchema, SitemapSchema } from '../../schemas/index.js';
import type { CriticReport, DesignTokens, MotionPlan, Sitemap } from '../../schemas/index.js';
import type { CompletionResult } from '../../providers/types.js';
import type { GeneratedCode } from '../codegen/codegen-agent.js';
import { formatAntiPatternsForPrompt } from '../../knowledge/anti-patterns.js';

/**
 * CriticAgent — adversarial design director.
 * Reviews generated output for originality, purpose, and token compliance.
 * Anything below confidence 7 triggers codegen revision.
 *
 * Fix (2026-09-27): Added normalizeCriticOutput() to handle the model's
 * tendency to use a flat criteria-list schema (criteria/score/notes) instead
 * of the required per-page schema (pageOrSection/distinguishability/etc).
 * Also fills in missing top-level fields (summary, revisionNotes, antiPatternsDetected)
 * with safe defaults rather than failing validation.
 */

const CriticInputSchema = z.object({
  brief: z.object({
    name: z.string(),
    description: z.string(),
    mood: z.array(z.string()),
    industry: z.string(),
  }),
  designTokens: z.unknown(),
  motionPlan: z.unknown(),
  sitemap: SitemapSchema,
  generatedCode: z.object({
    files: z.record(z.string(), z.string()),
    dependencies: z.record(z.string(), z.string()).default({}),
    notes: z.string().default(''),
  }),
});

type CriticInput = {
  brief: {
    name: string;
    description: string;
    mood: string[];
    industry: string;
  };
  designTokens: DesignTokens;
  motionPlan: MotionPlan;
  sitemap: Sitemap;
  generatedCode: GeneratedCode;
};

export class CriticAgent extends BaseAgent<CriticInput, CriticReport> {
  readonly agentName = 'Critic';

  readonly inputSchema = CriticInputSchema as z.ZodType<CriticInput>;
  readonly outputSchema = CriticReportSchema;

  readonly systemPrompt = `You are a strict, adversarial design director and technical architect.
You evaluate the generated codebase against the project brief, design tokens, motion plan, and the architecture sitemap.

Your job is NOT to be nice. Your job is to prevent generic, "AI-looking", or broken multi-page implementations from reaching the user.
You evaluate the entire codebase as a holistic system.

EVALUATION CRITERIA:
1. Sitemap Compliance: Are all pages and routes from the sitemap present and correctly structured? Do they share the requested layout (navType, footerType)?
2. Distinguishability: Does it look like a generic Bootstrap/Tailwind template? (If yes, score heavily down). Does it capture the requested mood?
3. Animation Audit: Did they implement the exact motion choreography? Is it janky? Did they use will-change properly?
4. Token Compliance: Did they strictly use the provided typography, colors, and scaling formulas, or did they invent their own?

ANTI-PATTERNS (Fail immediately if found):
${formatAntiPatternsForPrompt()}

OUTPUT FORMAT — respond with ONLY a JSON object with EXACTLY these fields, no markdown fences, no prose outside JSON:

{
  "assessments": [
    {
      "pageOrSection": "/",
      "distinguishability": {
        "score": 5,
        "notes": "Explanation of what makes it distinctive or generic",
        "specificChanges": ["Concrete change suggestion"]
      },
      "animationAudit": {
        "allJustified": true,
        "unjustifiedAnimations": []
      },
      "tokenCompliance": {
        "compliant": true,
        "drifts": []
      }
    }
  ],
  "overallConfidence": 5,
  "revisionNotes": [],
  "antiPatternsDetected": [],
  "summary": "One paragraph summary of the entire review."
}

CRITICAL RULES — do not deviate:
- "assessments" is an array. Each entry MUST use the PAGE PATH (e.g. "/") for the "pageOrSection" field.
- Each assessment entry MUST have: "pageOrSection" (string), "distinguishability" (object), "animationAudit" (object), "tokenCompliance" (object).
- Do NOT use field names like "criteria", "category", "page", or "section" anywhere in the output.
- Do NOT use a flat list of criteria objects at the top level of "assessments".
- "overallConfidence" is a number 1-10. Required.
- "summary" is a string paragraph. Required.
- "revisionNotes" and "antiPatternsDetected" are arrays of strings. Required (can be empty []).`;

  protected override formatInput(input: CriticInput): string {
    const pagePaths = input.sitemap.pages.map(p => p.path);

    let prompt = `## Project Brief
Name: ${input.brief.name}
Description: ${input.brief.description}
Industry: ${input.brief.industry}
Mood: ${input.brief.mood.join(', ')}

## Architect Sitemap
${JSON.stringify(input.sitemap, null, 2)}

## Design Tokens
${JSON.stringify(input.designTokens, null, 2)}

## Motion Plan (what codegen was supposed to implement)
${JSON.stringify(input.motionPlan, null, 2)}

## Generated Code (what you're reviewing)
`;

    for (const [fileName, content] of Object.entries(input.generatedCode.files)) {
      prompt += `\n### File: ${fileName}\n\`\`\`\n${content}\n\`\`\`\n`;
    }

    prompt += `\n\nIMPORTANT: Respond with JSON only. The "assessments" array must have ${pagePaths.length} entry/entries — one for each page path: ${pagePaths.map(p => `"${p}"`).join(', ')}. Use the page PATH as the "pageOrSection" value. Include ALL required top-level fields: assessments, overallConfidence, revisionNotes, antiPatternsDetected, summary.`;

    return prompt;
  }

  /**
   * Normalize the raw model output before schema validation.
   *
   * qwen2.5-coder:7b tends to hallucinate a flat criteria-list structure:
   *   assessments: [{ criteria: "Distinguishability", score: 2, notes: "..." }, ...]
   * instead of the required per-page structure:
   *   assessments: [{ pageOrSection: "/", distinguishability: { score: 2, ... }, ... }]
   *
   * Also fills in missing top-level optional fields with safe defaults.
   */
  private normalizeCriticOutput(raw: unknown, sitemap: Sitemap): unknown {
    if (typeof raw !== 'object' || raw === null) return raw;
    const obj = raw as Record<string, unknown>;
    const pagePaths = sitemap.pages.map(p => p.path);

    let assessments = obj['assessments'];

    if (Array.isArray(assessments) && assessments.length > 0) {
      const firstEntry = assessments[0] as Record<string, unknown>;

      // Detect the wrong schema (criteria-list) by presence of "criteria" key
      if ('criteria' in firstEntry && !('pageOrSection' in firstEntry)) {
        // Model used criteria-list format — extract scores and convert to per-page format
        const criteriaMap: Record<string, { score: number; notes: string }> = {};
        const allNotes: string[] = [];

        for (const entry of assessments as Record<string, unknown>[]) {
          const key = String(entry['criteria'] ?? '').toLowerCase().trim();
          const score = typeof entry['score'] === 'number' ? entry['score'] : 5;
          const notes = String(entry['notes'] ?? '');
          criteriaMap[key] = { score, notes };
          if (notes) allNotes.push(`[${entry['criteria']}] ${notes}`);
        }

        const distData = criteriaMap['distinguishability'];
        const animData = criteriaMap['animation audit'] ?? criteriaMap['animation'];
        const tokenData = criteriaMap['token compliance'] ?? criteriaMap['token'];

        const distScore = distData?.score ?? 5;
        const animScore = animData?.score ?? 5;
        const tokenScore = tokenData?.score ?? 5;
        const distNotes = (distData?.notes ?? allNotes.join(' | ')) || 'See evaluation.';

        obj['assessments'] = pagePaths.map(path => ({
          pageOrSection: path,
          distinguishability: {
            score: Math.min(10, Math.max(1, distScore)),
            notes: distNotes,
            specificChanges: [] as string[],
          },
          animationAudit: {
            allJustified: animScore >= 5,
            unjustifiedAnimations: [] as string[],
          },
          tokenCompliance: {
            compliant: tokenScore >= 5,
            drifts: [] as string[],
          },
        }));
      } else {
        // Schema is correct shape — fill any missing sub-fields entry by entry
        obj['assessments'] = (assessments as Record<string, unknown>[]).map((entry, i) => {
          const e = { ...(entry as Record<string, unknown>) };
          if (!e['pageOrSection']) e['pageOrSection'] = pagePaths[i] ?? '/';

          const dist = (e['distinguishability'] as Record<string, unknown> | undefined) ?? {};
          e['distinguishability'] = {
            score: typeof dist['score'] === 'number' ? dist['score'] : 5,
            notes: typeof dist['notes'] === 'string' ? dist['notes'] : 'Not evaluated.',
            specificChanges: Array.isArray(dist['specificChanges']) ? dist['specificChanges'] : [],
          };

          const anim = (e['animationAudit'] as Record<string, unknown> | undefined) ?? {};
          e['animationAudit'] = {
            allJustified: typeof anim['allJustified'] === 'boolean' ? anim['allJustified'] : true,
            unjustifiedAnimations: Array.isArray(anim['unjustifiedAnimations']) ? anim['unjustifiedAnimations'] : [],
          };

          const token = (e['tokenCompliance'] as Record<string, unknown> | undefined) ?? {};
          e['tokenCompliance'] = {
            compliant: typeof token['compliant'] === 'boolean' ? token['compliant'] : true,
            drifts: Array.isArray(token['drifts']) ? token['drifts'] : [],
          };

          return e;
        });
      }
    } else {
      // assessments missing or empty — synthesize defaults for each page
      obj['assessments'] = pagePaths.map(path => ({
        pageOrSection: path,
        distinguishability: { score: 5, notes: 'Not evaluated.', specificChanges: [] },
        animationAudit: { allJustified: true, unjustifiedAnimations: [] },
        tokenCompliance: { compliant: true, drifts: [] },
      }));
    }

    // Fill missing top-level required fields with defaults
    if (typeof obj['overallConfidence'] !== 'number') {
      obj['overallConfidence'] = 5;
    }
    if (typeof obj['summary'] !== 'string' || !obj['summary']) {
      obj['summary'] = 'Critic review completed. See per-page assessments for details.';
    }
    if (!Array.isArray(obj['revisionNotes'])) obj['revisionNotes'] = [];
    if (!Array.isArray(obj['antiPatternsDetected'])) obj['antiPatternsDetected'] = [];

    return obj;
  }

  /** Override execute() to inject normalization before schema validation */
  override async execute(input: CriticInput): Promise<AgentResult<CriticReport>> {
    const inputValidation = this.inputSchema.safeParse(input);
    if (!inputValidation.success) {
      throw new AgentValidationError(
        this.agentName,
        'input',
        inputValidation.error.format(),
      );
    }

    const userMessage = this.formatInput(inputValidation.data);
    let lastResult: CompletionResult | undefined;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        { role: 'user', content: userMessage },
      ];

      if (attempt > 0 && lastError) {
        messages.push({
          role: 'user',
          content: `Your previous response failed validation. Error:\n\n${lastError}\n\nRespond again with JSON only. Make sure ALL fields are present: assessments (array with entries having pageOrSection/distinguishability/animationAudit/tokenCompliance), overallConfidence (number 1-10), summary (string), revisionNotes (array), antiPatternsDetected (array).`,
        });
      }

      lastResult = await this.provider.complete({
        model: this.modelOverride,
        systemPrompt: this.systemPrompt,
        messages,
        responseSchema: this.outputSchema,
        temperature: 0.1,
      });

      let parsed: unknown;
      if (lastResult.structured) {
        parsed = lastResult.structured;
      } else {
        try {
          const text = lastResult.content;
          const firstBrace = text.indexOf('{');
          const lastBrace = text.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
          } else {
            parsed = JSON.parse(text);
          }
        } catch {
          lastError = `Could not parse JSON from response. Raw content starts with: "${lastResult.content.substring(0, 200)}"`;
          continue;
        }
      }

      // Normalize before validation to handle schema mismatches
      parsed = this.normalizeCriticOutput(parsed, inputValidation.data.sitemap);

      const outputValidation = this.outputSchema.safeParse(parsed);
      if (outputValidation.success) {
        return {
          output: outputValidation.data,
          raw: lastResult.content,
          usage: lastResult.usage,
          attempts: attempt + 1,
          model: lastResult.model,
          provider: lastResult.provider,
        };
      }

      lastError = outputValidation.error.issues
        .map(issue => {
          const path = issue.path.join('.');
          return `- ${path ? `${path}: ` : ''}${issue.message}`;
        })
        .join('\n');
    }

    throw new AgentValidationError(
      this.agentName,
      'output',
      lastError ?? 'Unknown validation error',
      lastResult?.content,
    );
  }
}
