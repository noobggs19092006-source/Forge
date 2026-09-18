import type { ProjectBrief, DesignTokens, MotionPlan, Sitemap, QAReport, CriticReport } from '../schemas/index.js';
import type { GeneratedCode } from '../agents/codegen/codegen-agent.js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * ProjectMemory — stores all decisions and artifacts from a generation run.
 * 
 * At M0/M1: in-memory only.
 * At M2+: serializes to/from a .forge/ directory in the generated project
 * for repo-editing mode (M4) where the agent extends existing work.
 */
export class ProjectMemory {
  private state: ProjectState = {
    brief: null,
    sitemap: null,
    designTokens: null,
    motionPlan: null,
    generatedCode: null,
    qaReports: [],
    criticReports: [],
    metadata: {
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      pipelineRuns: 0,
      totalAttempts: {},
    },
  };

  private outputDir?: string;

  /** Set the project output directory and initialize the .forge folder */
  setOutputDir(dir: string): void {
    this.outputDir = dir;
    const forgeDir = join(this.outputDir, '.forge');
    if (!existsSync(forgeDir)) {
      mkdirSync(forgeDir, { recursive: true });
    }
  }

  set<K extends keyof Omit<ProjectState, 'metadata'>>(
    key: K,
    value: ProjectState[K],
  ): void {
    (this.state as unknown as Record<string, unknown>)[key] = value;
    this.state.metadata.lastModified = new Date().toISOString();
    this.persistToDisk(key, value);
  }

  private persistToDisk(key: keyof Omit<ProjectState, 'metadata'>, value: unknown): void {
    if (!this.outputDir) return;
    const forgeDir = join(this.outputDir, '.forge');
    const filePath = join(forgeDir, `${String(key)}.json`);
    try {
      // Create a safely serializable copy without circular references
      writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
      
      // Also persist metadata
      writeFileSync(
        join(forgeDir, 'pipeline-metadata.json'), 
        JSON.stringify(this.state.metadata, null, 2), 
        'utf-8'
      );
    } catch (e) {
      console.warn(`[ProjectMemory] Failed to persist ${String(key)} to disk:`, e);
    }
  }

  /** Retrieve a pipeline artifact */
  get<K extends keyof ProjectState>(key: K): ProjectState[K] {
    return this.state[key];
  }

  /** Record a pipeline stage attempt count */
  recordAttempt(stage: string, attempts: number): void {
    this.state.metadata.totalAttempts[stage] = attempts;
  }

  /** Increment pipeline run counter */
  incrementRuns(): void {
    this.state.metadata.pipelineRuns++;
  }

  /** Get the full state snapshot */
  getSnapshot(): ProjectState {
    return structuredClone(this.state);
  }

  /** Get a summary of what's been decided so far */
  getSummary(): string {
    const parts: string[] = [];
    if (this.state.brief) parts.push(`Brief: "${this.state.brief.name}"`);
    if (this.state.designTokens) {
      const dt = this.state.designTokens;
      parts.push(`Fonts: ${dt.typography.displayFont.family} / ${dt.typography.textFont.family}`);
      parts.push(`Motion: ${dt.motionPersonality.description}`);
    }
    if (this.state.generatedCode) {
      parts.push(`Files: ${Object.keys(this.state.generatedCode.files).length}`);
    }
    if (this.state.qaReports.length > 0) {
      const lastQA = this.state.qaReports[this.state.qaReports.length - 1]!;
      parts.push(`QA: ${lastQA.overallPass ? 'PASSED' : 'FAILED'}`);
    }
    if (this.state.criticReports.length > 0) {
      const lastCritic = this.state.criticReports[this.state.criticReports.length - 1]!;
      parts.push(`Critic: ${lastCritic.overallConfidence}/10`);
    }
    return parts.join(' | ');
  }

  /** Load project state from a .forge directory */
  static load(outputDir: string): ProjectMemory {
    const memory = new ProjectMemory();
    memory.setOutputDir(outputDir);
    const forgeDir = join(outputDir, '.forge');

    if (!existsSync(forgeDir)) {
      return memory;
    }

    const keys: Array<keyof Omit<ProjectState, 'metadata'>> = [
      'brief', 'sitemap', 'designTokens', 'motionPlan', 'generatedCode', 'qaReports', 'criticReports'
    ];

    for (const key of keys) {
      const filePath = join(forgeDir, `${String(key)}.json`);
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          (memory.state as unknown as Record<string, unknown>)[key] = JSON.parse(content);
        } catch (e) {
          console.warn(`[ProjectMemory] Failed to load ${String(key)} from disk:`, e);
        }
      }
    }

    const metaPath = join(forgeDir, 'pipeline-metadata.json');
    if (existsSync(metaPath)) {
      try {
        memory.state.metadata = JSON.parse(readFileSync(metaPath, 'utf-8'));
      } catch (e) {
        // ignore
      }
    }

    return memory;
  }
}

export interface ProjectState {
  brief: ProjectBrief | null;
  sitemap: Sitemap | null;
  designTokens: DesignTokens | null;
  motionPlan: MotionPlan | null;
  generatedCode: GeneratedCode | null;
  qaReports: QAReport[];
  criticReports: CriticReport[];
  metadata: {
    createdAt: string;
    lastModified: string;
    pipelineRuns: number;
    totalAttempts: Record<string, number>;
  };
}
