import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { transpileModule, ScriptTarget, ModuleKind, ModuleResolutionKind, JsxEmit } from 'typescript';

/**
 * Status of a single file in the checkpoint manifest.
 */
export type FileStatus = 'pending' | 'success' | 'failed' | 'blocked';

/**
 * Per-file entry in the checkpoint manifest.
 */
export interface CheckpointEntry {
  /** Current generation status */
  status: FileStatus;
  /** Number of generation attempts made */
  attempts: number;
  /** Last error message if status is 'failed' */
  lastError?: string;
  /** Which dependency is missing/failed (when status is 'blocked') */
  blockedBy?: string;
  /** Which pass number this file was last processed in */
  lastPassAttempted?: number;
  /** Which pass it succeeded on (if status is 'success') */
  passCompleted?: number;
  /** ISO timestamp of successful generation */
  generatedAt?: string;
}

/**
 * Summary of a single retry pass.
 */
export interface PassResult {
  pass: number;
  attempted: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  durationMs: number;
}

/**
 * The full checkpoint manifest persisted to disk.
 */
export interface CheckpointManifest {
  /** Project name for identification */
  projectName: string;
  /** ISO timestamp when generation started */
  startedAt: string;
  /** ISO timestamp of last checkpoint write */
  lastUpdatedAt: string;
  /** Total number of files in the generation plan */
  totalFiles: number;
  /** Per-file status map: filePath → CheckpointEntry */
  fileStatuses: Record<string, CheckpointEntry>;
  /** Results of each pass */
  passResults: PassResult[];
}

/**
   * CodegenCheckpoint — persistent per-file checkpoint manager for the Codegen stage.
   *
   * Tracks the status of every file in the generation plan, persists to
   * `.forge/checkpoint.json` synchronously after every status change for
   * crash safety, and supports resume-from-checkpoint when the process
   * restarts.
   *
   * Key behaviors:
   * - On fresh start: all files initialized as 'pending'
   * - On resume: loads existing manifest, files already marked 'success' are skipped
   * - Dependency-aware: files whose deps are 'failed'/'blocked' are marked 'blocked'
   * - Multi-pass: after first pass, only 'failed' and newly-unblocked files are retried
   */

// Syntax validation configuration
const TS_COMPILER_OPTIONS = {
  target: ScriptTarget.ES2022,
  module: ModuleKind.ESNext,
  moduleResolution: ModuleResolutionKind.Bundler,
  jsx: JsxEmit.ReactJSX,
  allowJs: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  strict: false, // We only care about syntax, not type errors
  skipLibCheck: true,
  noEmit: true,
  moduleDetection: 1, // force: 1
};

function isTypeScriptFile(filePath: string): boolean {
  return filePath.endsWith('.ts') || filePath.endsWith('.tsx');
}

function validateSyntax(filePath: string, content: string): { valid: boolean; error?: string } {
  // Only validate TypeScript/TSX files; skip other file types
  if (!isTypeScriptFile(filePath)) {
    return { valid: true };
  }

  try {
    transpileModule(content, {
      compilerOptions: TS_COMPILER_OPTIONS,
      fileName: filePath,
    });
    return { valid: true };
  } catch (error) {
    const err = error as Error;
    return { valid: false, error: err.message };
  }
}
export class CodegenCheckpoint {
  private manifest: CheckpointManifest;
  private checkpointPath: string;
  /** Map of filePath → list of dependency filePaths (within the generation plan) */
  private dependencyMap: Map<string, string[]>;

  constructor(checkpointPath: string) {
    this.checkpointPath = checkpointPath;
    this.dependencyMap = new Map();
    this.manifest = {
      projectName: '',
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      totalFiles: 0,
      fileStatuses: {},
      passResults: [],
    };
  }

  /**
   * Initialize the checkpoint for a generation run.
   * If a checkpoint file already exists at the configured path, it is loaded
   * and used for resume (files already marked 'success' will be skipped).
   * Otherwise, all files start as 'pending'.
   *
   * @param fileList - The full list of files to generate, with dependencies
   * @param projectName - Project name for identification
   */
  initialize(
    fileList: Array<{ path: string; dependencies: string[] }>,
    projectName: string,
  ): void {
    // Build dependency map
    const allPaths = new Set(fileList.map(f => f.path));
    for (const file of fileList) {
      // Only track dependencies that are within the generation plan
      const internalDeps = file.dependencies.filter(d => allPaths.has(d));
      this.dependencyMap.set(file.path, internalDeps);
    }

    // Try to load existing checkpoint for resume
    if (existsSync(this.checkpointPath)) {
      try {
        const raw = readFileSync(this.checkpointPath, 'utf-8');
        const existing = JSON.parse(raw) as CheckpointManifest;

        // Validate that the existing checkpoint is for the same project
        // and has a compatible file list
        if (existing.projectName === projectName && existing.fileStatuses) {
          this.manifest = existing;

          // Add any new files not in the existing checkpoint (plan changed)
          for (const file of fileList) {
            if (!this.manifest.fileStatuses[file.path]) {
              this.manifest.fileStatuses[file.path] = {
                status: 'pending',
                attempts: 0,
              };
            }
          }

          // Reset failed/blocked files to pending for a fresh retry
          // (they'll be retried in the upcoming passes)
          for (const [filePath, entry] of Object.entries(this.manifest.fileStatuses)) {
            if (entry.status === 'failed' || entry.status === 'blocked') {
              entry.status = 'pending';
              // Keep attempt count so we have historical context
            }
          }

          this.manifest.totalFiles = fileList.length;
          this.manifest.lastUpdatedAt = new Date().toISOString();
          this.flush();
          return;
        }
      } catch {
        // Corrupted checkpoint — start fresh
      }
    }

    // Fresh start: initialize all files as pending
    this.manifest = {
      projectName,
      startedAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      totalFiles: fileList.length,
      fileStatuses: {},
      passResults: [],
    };

    for (const file of fileList) {
      this.manifest.fileStatuses[file.path] = {
        status: 'pending',
        attempts: 0,
      };
    }

    this.flush();
  }

  /**
   * Check if a file was already successfully generated (for resume).
   */
  isAlreadySuccessful(filePath: string): boolean {
    return this.manifest.fileStatuses[filePath]?.status === 'success';
  }

  /**
   * Get the current status of a file.
   */
  getStatus(filePath: string): CheckpointEntry | undefined {
    return this.manifest.fileStatuses[filePath];
  }

  /**
   * Check whether a file's dependencies have any that explicitly failed or are blocked.
   * Returns the path of the first failed/blocked dependency, or null if none have failed.
   * 
   * Note: A dependency with status 'pending' does NOT block — it simply hasn't been
   * attempted yet and may succeed when reached. Only explicitly failed/blocked deps
   * are treated as blockers. This is important because the topological sort may not
   * perfectly order all deps before dependents.
   */
    forceReset(filePaths: string[]): void {
    for (const filePath of filePaths) {
      const entry = this.manifest.fileStatuses[filePath];
      if (entry) {
        entry.status = 'pending';
        delete entry.passCompleted;
      }
    }
    this.manifest.lastUpdatedAt = new Date().toISOString();
    this.flush();
  }

  getBlockingDependency(filePath: string): string | null {
    const deps = this.dependencyMap.get(filePath) || [];
    for (const dep of deps) {
      const depStatus = this.manifest.fileStatuses[dep];
      if (depStatus && (depStatus.status === 'failed' || depStatus.status === 'blocked')) {
        return dep;
      }
    }
    return null;
  }

  /**
   * Get the list of files to attempt in a given pass.
   *
   * Pass 1: All files with status 'pending'
   * Pass 2+: Files with status 'failed' or 'blocked' (if deps now satisfied)
   */
  getFilesForPass(pass: number): string[] {
    const eligible: string[] = [];

    for (const [filePath, entry] of Object.entries(this.manifest.fileStatuses)) {
      if (pass === 1) {
        // First pass: attempt all pending files
        if (entry.status === 'pending') {
          eligible.push(filePath);
        }
      } else {
        // Subsequent passes: retry failed and blocked files
        if (entry.status === 'failed' || entry.status === 'blocked') {
          eligible.push(filePath);
        }
      }
    }

    return eligible;
  }

  /**
   * Mark a file as successfully generated.
   * Runs syntax validation for .ts/.tsx files before marking success.
   */
  markSuccess(filePath: string, pass: number, content?: string): void {
    const entry = this.manifest.fileStatuses[filePath];
    if (!entry) return;

    // Run syntax validation if content is provided
    if (content !== undefined) {
      const validation = validateSyntax(filePath, content);
      if (!validation.valid) {
        // Syntax error — mark as failed instead of success
        this.markFailed(filePath, `Syntax validation failed: ${validation.error}`, entry.lastPassAttempted || 0);
        return;
      }
    }

    entry.status = 'success';
    entry.passCompleted = pass;
    entry.generatedAt = new Date().toISOString();
    entry.lastPassAttempted = pass;
    entry.attempts += 1;
    // Clear any previous error
    delete entry.lastError;
    delete entry.blockedBy;

    this.flush();
  }

  /**
   * Mark a file as failed.
   */
  markFailed(filePath: string, error: string, pass: number): void {
    const entry = this.manifest.fileStatuses[filePath];
    if (!entry) return;

    entry.status = 'failed';
    entry.lastError = error.slice(0, 500); // Cap error length for readability
    entry.lastPassAttempted = pass;
    entry.attempts += 1;
    delete entry.blockedBy;

    this.flush();
  }

  /**
   * Mark a file as blocked due to a failed/missing dependency.
   */
  markBlocked(filePath: string, blockedByDep: string, pass: number): void {
    const entry = this.manifest.fileStatuses[filePath];
    if (!entry) return;

    entry.status = 'blocked';
    entry.blockedBy = blockedByDep;
    entry.lastPassAttempted = pass;
    // Don't increment attempts — we didn't actually try to generate it

    this.flush();
  }

  /**
   * Record the aggregate result of a completed pass.
   */
  recordPassResult(passResult: PassResult): void {
    this.manifest.passResults.push(passResult);
    this.flush();
  }

  /**
   * Get a human-readable summary report of the generation.
   * e.g. "Codegen complete: 11/13 files succeeded on pass 1, 2/13 succeeded on pass 2, 0/13 permanently failed"
   */
  getSummaryReport(): string {
    const total = this.manifest.totalFiles;
    const byPass = new Map<number, number>();
    let permanentlyFailed = 0;
    let blocked = 0;

    for (const entry of Object.values(this.manifest.fileStatuses)) {
      if (entry.status === 'success' && entry.passCompleted !== undefined) {
        byPass.set(entry.passCompleted, (byPass.get(entry.passCompleted) || 0) + 1);
      } else if (entry.status === 'failed') {
        permanentlyFailed++;
      } else if (entry.status === 'blocked') {
        blocked++;
      }
    }

    const parts: string[] = [];
    const sortedPasses = Array.from(byPass.keys()).sort((a, b) => a - b);
    for (const pass of sortedPasses) {
      const count = byPass.get(pass)!;
      parts.push(`${count}/${total} succeeded on pass ${pass}`);
    }

    if (permanentlyFailed > 0) {
      parts.push(`${permanentlyFailed}/${total} permanently failed`);
    }

    if (blocked > 0) {
      parts.push(`${blocked}/${total} blocked by dependencies`);
    }

    return `Codegen complete: ${parts.join(', ')}`;
  }

  /**
   * Get the list of permanently failed files (for error reporting).
   */
  getPermanentlyFailedFiles(): Array<{ path: string; error: string }> {
    const failed: Array<{ path: string; error: string }> = [];
    for (const [filePath, entry] of Object.entries(this.manifest.fileStatuses)) {
      if (entry.status === 'failed' || entry.status === 'blocked') {
        failed.push({
          path: filePath,
          error: entry.lastError || entry.blockedBy || 'Unknown error',
        });
      }
    }
    return failed;
  }

  /**
   * Get count of successfully generated files.
   */
  getSuccessCount(): number {
    return Object.values(this.manifest.fileStatuses)
      .filter(e => e.status === 'success').length;
  }

  /**
   * Get the full manifest (for inspection/testing).
   */
  getManifest(): CheckpointManifest {
    return structuredClone(this.manifest);
  }

  /**
   * Synchronously write the checkpoint manifest to disk.
   * Uses writeFileSync for crash safety — the manifest always reflects
   * the last completed operation even if the process is killed.
   */
  flush(): void {
    this.manifest.lastUpdatedAt = new Date().toISOString();
    const dir = dirname(this.checkpointPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(this.checkpointPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }
}
