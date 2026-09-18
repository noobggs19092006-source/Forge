/**
 * @forge/core — Shell-agnostic frontend generation engine.
 *
 * This is the "brain" — importable by any caller (CLI, web shell, API).
 * Zero dependency on terminal I/O.
 */

// Schemas
export * from './schemas/index.js';

// Providers
export * from './providers/index.js';

// Agents
export { BaseAgent, AgentValidationError } from './agents/base-agent.js';
export type { AgentResult } from './agents/base-agent.js';
export { ArchitectAgent } from './agents/architect/architect-agent.js';
export { DesignBrainAgent } from './agents/design-brain/design-brain-agent.js';
export { MotionBrainAgent } from './agents/motion-brain/motion-brain-agent.js';
export { CodegenAgent } from './agents/codegen/codegen-agent.js';
export type { GeneratedCode } from './agents/codegen/codegen-agent.js';
export { CodegenCheckpoint } from './agents/codegen/codegen-checkpoint.js';
export type { CheckpointEntry, CheckpointManifest, PassResult, FileStatus } from './agents/codegen/codegen-checkpoint.js';
export { QAGateAgent } from './agents/qa-gate/qa-gate-agent.js';
export { CriticAgent } from './agents/critic/critic-agent.js';

// Knowledge
export { ANTI_PATTERNS, formatAntiPatternsForPrompt } from './knowledge/anti-patterns.js';
export { ANIMATION_RECIPES, formatRecipesForPrompt } from './knowledge/animation-recipes.js';
export { A11Y_RULES, formatA11yRulesForPrompt } from './knowledge/a11y-rules.js';

// Memory
export { ProjectMemory } from './memory/project-memory.js';

// Orchestrator
export { ForgePipeline } from './orchestrator/pipeline.js';
export type { PipelineResult } from './orchestrator/pipeline.js';
export { loadConfig } from './orchestrator/config.js';
export type { ForgeConfig } from './orchestrator/config.js';
export { PipelineEventEmitter } from './orchestrator/events.js';
export type { PipelineEvent, PipelineEventType } from './orchestrator/events.js';
