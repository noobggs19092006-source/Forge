/**
 * Schema barrel export — all Zod schemas and inferred TypeScript types
 * used as the structured JSON contracts between pipeline stages.
 */

export {
  ProjectBriefSchema,
  type ProjectBrief,
} from './brief.js';

export {
  SharedLayoutSchema,
  PageSectionSchema,
  PageSchema,
  SitemapSchema,
  type SharedLayout,
  type PageSection,
  type Page,
  type Sitemap,
} from './sitemap.js';

export {
  FluidTypeStepSchema,
  TypographySystemSchema,
  ColorTokenSchema,
  ColorSystemSchema,
  SpacingSystemSchema,
  MotionPersonalitySchema,
  DesignTokensSchema,
  type FluidTypeStep,
  type TypographySystem,
  type ColorToken,
  type ColorSystem,
  type SpacingSystem,
  type MotionPersonality,
  type DesignTokens,
} from './design-tokens.js';

export {
  MotionSectionEntrySchema,
  MotionPlanSchema,
  type MotionSectionEntry,
  type MotionPlan,
} from './motion-plan.js';

export {
  QACheckSchema,
  FixTicketSchema,
  QAReportSchema,
  type QACheck,
  type FixTicket,
  type QAReport,
} from './qa-report.js';

export {
  PageAssessmentSchema,
  CriticReportSchema,
  type PageAssessment,
  type CriticReport,
} from './critic-report.js';
