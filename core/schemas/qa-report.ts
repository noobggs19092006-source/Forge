import { z } from 'zod';

/**
 * QAReport — the QA-Gate agent's output.
 * Automated quality check results with structured fix tickets for failures.
 * At M0/M1 this uses structural checks; real Lighthouse/axe-core comes at M2+.
 */

export const QACheckSchema = z.object({
  name: z.string().describe('Check name (e.g., "reduced-motion-handling", "semantic-html", "cls-prevention")'),
  category: z.enum([
    'accessibility',
    'performance',
    'best-practices',
    'code-quality',
    'design-token-compliance',
    'browser',
  ]).describe('Check category'),
  passed: z.boolean().describe('Whether this check passed'),
  severity: z.enum(['critical', 'serious', 'moderate', 'minor'])
    .describe('Severity level — critical and serious are build-blocking'),
  details: z.string().describe('Human-readable description of the result'),
  file: z.string().optional().describe('File path where the issue was found'),
  line: z.number().optional().describe('Line number of the issue'),
});

export const FixTicketSchema = z.object({
  file: z.string().describe('File that needs fixing'),
  issue: z.string().describe('What is wrong'),
  requiredChange: z.string().describe('Specific change needed to fix the issue'),
  severity: z.enum(['critical', 'serious', 'moderate', 'minor']),
  relatedCheck: z.string().describe('Name of the QA check that produced this ticket'),
});

export const QAReportSchema = z.object({
  checks: z.array(QACheckSchema).describe('All checks that were run'),
  overallPass: z.boolean().describe('True only if zero critical/serious failures'),
  fixTickets: z.array(FixTicketSchema).default([])
    .describe('Structured fix tickets for any failures — consumed by codegen retry loop'),
  summary: z.string().describe('One-paragraph summary of QA results'),
  timestamp: z.string().describe('ISO 8601 timestamp of the QA run'),
});

export type QACheck = z.infer<typeof QACheckSchema>;
export type FixTicket = z.infer<typeof FixTicketSchema>;
export type QAReport = z.infer<typeof QAReportSchema>;
