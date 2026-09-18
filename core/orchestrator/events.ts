import type { PipelineStage } from '../providers/types.js';

/**
 * Typed event system for pipeline progress observability.
 * Uses a simple listener pattern (no Node EventEmitter dependency)
 * to keep the core shell-agnostic.
 */

export type PipelineEventType =
  | 'pipeline:start'
  | 'pipeline:complete'
  | 'pipeline:error'
  | 'stage:start'
  | 'stage:complete'
  | 'stage:error'
  | 'stage:retry'
  | 'qa:check'
  | 'critic:score'
  | 'checkpoint:update'
  | 'codegen:file:success'
  | 'codegen:file:failed'
  | 'codegen:file:blocked'
  | 'codegen:file:skipped'
  | 'codegen:pass:complete';

export interface PipelineEvent {
  type: PipelineEventType;
  stage?: PipelineStage | 'qa-gate';
  message: string;
  data?: unknown;
  timestamp: string;
  durationMs?: number;
}

export type PipelineEventListener = (event: PipelineEvent) => void;

export class PipelineEventEmitter {
  private listeners: PipelineEventListener[] = [];

  on(listener: PipelineEventListener): () => void {
    this.listeners.push(listener);
    // Return unsubscribe function
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(
    type: PipelineEventType,
    message: string,
    options?: {
      stage?: PipelineStage | 'qa-gate';
      data?: unknown;
      durationMs?: number;
    },
  ): void {
    const event: PipelineEvent = {
      type,
      message,
      stage: options?.stage,
      data: options?.data,
      timestamp: new Date().toISOString(),
      durationMs: options?.durationMs,
    };

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Don't let listener errors break the pipeline
      }
    }
  }
}
