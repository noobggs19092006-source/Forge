import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CodegenCheckpoint } from '../../agents/codegen/codegen-checkpoint.js';
import type { CheckpointManifest } from '../../agents/codegen/codegen-checkpoint.js';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * CodegenCheckpoint unit tests.
 *
 * Covers:
 * 1. Fresh initialization with all files 'pending'
 * 2. Status transitions: markSuccess, markFailed, markBlocked
 * 3. Resume from existing checkpoint (skip 'success' files)
 * 4. Dependency-aware blocking detection
 * 5. Multi-pass retry eligibility
 * 6. Kill-and-resume simulation
 * 7. Summary report format
 * 8. Edge cases: corrupted checkpoint, plan changes
 */

const TEST_FILE_LIST = [
  { path: 'app/layout.tsx', dependencies: [] },
  { path: 'app/globals.css', dependencies: [] },
  { path: 'lib/gsap-config.ts', dependencies: [] },
  { path: 'lib/lenis-provider.tsx', dependencies: [] },
  { path: 'hooks/useReducedMotion.ts', dependencies: [] },
  { path: 'hooks/useLenis.ts', dependencies: ['lib/lenis-provider.tsx'] },
  { path: 'components/Navbar.tsx', dependencies: ['hooks/useLenis.ts'] },
  { path: 'components/Footer.tsx', dependencies: [] },
  { path: 'components/Hero.tsx', dependencies: ['app/globals.css', 'hooks/useReducedMotion.ts', 'lib/lenis-provider.tsx', 'lib/gsap-config.ts'] },
  { path: 'app/page.tsx', dependencies: ['app/layout.tsx', 'app/globals.css', 'components/Navbar.tsx', 'components/Footer.tsx'] },
  { path: 'package.json', dependencies: [] },
  { path: 'tailwind.config.ts', dependencies: [] },
  { path: 'postcss.config.js', dependencies: [] },
];

describe('CodegenCheckpoint', () => {
  let testDir: string;
  let checkpointPath: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = resolve(tmpdir(), `forge-checkpoint-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    checkpointPath = resolve(testDir, '.forge', 'checkpoint.json');
  });

  afterEach(() => {
    // Clean up
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ── 1. Fresh initialization ──

  describe('fresh initialization', () => {
    it('initializes all files as pending', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      const manifest = checkpoint.getManifest();
      expect(manifest.projectName).toBe('test-project');
      expect(manifest.totalFiles).toBe(TEST_FILE_LIST.length);

      for (const file of TEST_FILE_LIST) {
        const entry = manifest.fileStatuses[file.path];
        expect(entry).toBeDefined();
        expect(entry!.status).toBe('pending');
        expect(entry!.attempts).toBe(0);
      }
    });

    it('writes checkpoint file to disk on initialization', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      expect(existsSync(checkpointPath)).toBe(true);
      const raw = readFileSync(checkpointPath, 'utf-8');
      const parsed = JSON.parse(raw) as CheckpointManifest;
      expect(parsed.projectName).toBe('test-project');
      expect(Object.keys(parsed.fileStatuses)).toHaveLength(TEST_FILE_LIST.length);
    });

    it('creates parent directories if they do not exist', () => {
      const deepPath = resolve(testDir, 'a', 'b', 'c', '.forge', 'checkpoint.json');
      const checkpoint = new CodegenCheckpoint(deepPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      expect(existsSync(deepPath)).toBe(true);
    });
  });

  // ── 2. Status transitions ──

  describe('status transitions', () => {
    it('markSuccess transitions to success with metadata', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.markSuccess('app/layout.tsx', 1);

      const entry = checkpoint.getStatus('app/layout.tsx');
      expect(entry!.status).toBe('success');
      expect(entry!.attempts).toBe(1);
      expect(entry!.passCompleted).toBe(1);
      expect(entry!.generatedAt).toBeDefined();
      expect(entry!.lastPassAttempted).toBe(1);
      expect(entry!.lastError).toBeUndefined();
    });

    it('markFailed transitions to failed with error', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.markFailed('lib/gsap-config.ts', 'API rate limit exceeded', 1);

      const entry = checkpoint.getStatus('lib/gsap-config.ts');
      expect(entry!.status).toBe('failed');
      expect(entry!.attempts).toBe(1);
      expect(entry!.lastError).toBe('API rate limit exceeded');
      expect(entry!.lastPassAttempted).toBe(1);
    });

    it('markBlocked transitions to blocked with dependency info', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.markBlocked('hooks/useLenis.ts', 'lib/lenis-provider.tsx', 1);

      const entry = checkpoint.getStatus('hooks/useLenis.ts');
      expect(entry!.status).toBe('blocked');
      expect(entry!.blockedBy).toBe('lib/lenis-provider.tsx');
      expect(entry!.attempts).toBe(0); // blocked doesn't increment attempts
    });

    it('markFailed truncates long error messages', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      const longError = 'x'.repeat(1000);
      checkpoint.markFailed('app/layout.tsx', longError, 1);

      const entry = checkpoint.getStatus('app/layout.tsx');
      expect(entry!.lastError!.length).toBeLessThanOrEqual(500);
    });

    it('markSuccess clears previous error and blockedBy', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // First fail, then succeed
      checkpoint.markFailed('app/layout.tsx', 'Some error', 1);
      checkpoint.markSuccess('app/layout.tsx', 2);

      const entry = checkpoint.getStatus('app/layout.tsx');
      expect(entry!.status).toBe('success');
      expect(entry!.lastError).toBeUndefined();
      expect(entry!.blockedBy).toBeUndefined();
      expect(entry!.attempts).toBe(2); // 1 fail + 1 success
    });

    it('each status change writes to disk immediately', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.markSuccess('app/layout.tsx', 1);

      // Read from disk and verify
      const raw = readFileSync(checkpointPath, 'utf-8');
      const parsed = JSON.parse(raw) as CheckpointManifest;
      expect(parsed.fileStatuses['app/layout.tsx']!.status).toBe('success');
    });
  });

  // ── 3. Resume from existing checkpoint ──

  describe('resume from checkpoint', () => {
    it('loads existing checkpoint and skips successful files', () => {
      // First run: generate some files
      const checkpoint1 = new CodegenCheckpoint(checkpointPath);
      checkpoint1.initialize(TEST_FILE_LIST, 'test-project');
      checkpoint1.markSuccess('app/layout.tsx', 1);
      checkpoint1.markSuccess('app/globals.css', 1);
      checkpoint1.markSuccess('lib/gsap-config.ts', 1);
      checkpoint1.markFailed('lib/lenis-provider.tsx', 'Network error', 1);

      // Second run: resume
      const checkpoint2 = new CodegenCheckpoint(checkpointPath);
      checkpoint2.initialize(TEST_FILE_LIST, 'test-project');

      // Successful files should still be success
      expect(checkpoint2.isAlreadySuccessful('app/layout.tsx')).toBe(true);
      expect(checkpoint2.isAlreadySuccessful('app/globals.css')).toBe(true);
      expect(checkpoint2.isAlreadySuccessful('lib/gsap-config.ts')).toBe(true);

      // Failed file should be reset to pending for retry
      expect(checkpoint2.isAlreadySuccessful('lib/lenis-provider.tsx')).toBe(false);
      const lenisEntry = checkpoint2.getStatus('lib/lenis-provider.tsx');
      expect(lenisEntry!.status).toBe('pending');

      // Never-attempted files should be pending
      expect(checkpoint2.isAlreadySuccessful('components/Hero.tsx')).toBe(false);
    });

    it('handles corrupted checkpoint gracefully (starts fresh)', () => {
      // Write garbage to checkpoint file
      mkdirSync(resolve(testDir, '.forge'), { recursive: true });
      writeFileSync(checkpointPath, '{invalid json!!!', 'utf-8');

      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // Should start fresh — all pending
      const manifest = checkpoint.getManifest();
      for (const file of TEST_FILE_LIST) {
        expect(manifest.fileStatuses[file.path]!.status).toBe('pending');
      }
    });

    it('handles checkpoint from different project (starts fresh)', () => {
      // First run with different project
      const checkpoint1 = new CodegenCheckpoint(checkpointPath);
      checkpoint1.initialize(TEST_FILE_LIST, 'different-project');
      checkpoint1.markSuccess('app/layout.tsx', 1);

      // Resume with different project name
      const checkpoint2 = new CodegenCheckpoint(checkpointPath);
      checkpoint2.initialize(TEST_FILE_LIST, 'test-project');

      // Should NOT resume from different project's checkpoint
      expect(checkpoint2.isAlreadySuccessful('app/layout.tsx')).toBe(false);
    });

    it('handles plan changes (new files added)', () => {
      // First run with fewer files
      const shortList = TEST_FILE_LIST.slice(0, 5);
      const checkpoint1 = new CodegenCheckpoint(checkpointPath);
      checkpoint1.initialize(shortList, 'test-project');
      checkpoint1.markSuccess('app/layout.tsx', 1);

      // Resume with full file list
      const checkpoint2 = new CodegenCheckpoint(checkpointPath);
      checkpoint2.initialize(TEST_FILE_LIST, 'test-project');

      // Old successful file is still success
      expect(checkpoint2.isAlreadySuccessful('app/layout.tsx')).toBe(true);

      // New files are pending
      expect(checkpoint2.getStatus('components/Hero.tsx')!.status).toBe('pending');
      expect(checkpoint2.getManifest().totalFiles).toBe(TEST_FILE_LIST.length);
    });
  });

  // ── 4. Dependency-aware blocking ──

  describe('dependency-aware blocking', () => {
    it('returns null when all dependencies are successful', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // Mark all deps of hooks/useLenis.ts as success
      checkpoint.markSuccess('lib/lenis-provider.tsx', 1);

      const blocking = checkpoint.getBlockingDependency('hooks/useLenis.ts');
      expect(blocking).toBeNull();
    });

    it('returns blocking dep when a dependency is failed', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.markFailed('lib/lenis-provider.tsx', 'Error', 1);

      const blocking = checkpoint.getBlockingDependency('hooks/useLenis.ts');
      expect(blocking).toBe('lib/lenis-provider.tsx');
    });

    it('returns null when a dependency is still pending (not yet attempted)', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // lenis-provider.tsx is still pending — not a blocker since it may succeed
      const blocking = checkpoint.getBlockingDependency('hooks/useLenis.ts');
      expect(blocking).toBeNull();
    });

    it('returns null for files with no dependencies', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      const blocking = checkpoint.getBlockingDependency('app/layout.tsx');
      expect(blocking).toBeNull();
    });

    it('handles transitive blocking correctly', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // useLenis depends on lenis-provider. Navbar depends on useLenis.
      // If lenis-provider fails, Navbar should be blocked via useLenis.
      checkpoint.markFailed('lib/lenis-provider.tsx', 'Error', 1);
      checkpoint.markBlocked('hooks/useLenis.ts', 'lib/lenis-provider.tsx', 1);

      const blocking = checkpoint.getBlockingDependency('components/Navbar.tsx');
      expect(blocking).toBe('hooks/useLenis.ts');
    });
  });

  // ── 5. Multi-pass retry eligibility ──

  describe('getFilesForPass', () => {
    it('pass 1 returns all pending files', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      const files = checkpoint.getFilesForPass(1);
      expect(files).toHaveLength(TEST_FILE_LIST.length);
      for (const file of TEST_FILE_LIST) {
        expect(files).toContain(file.path);
      }
    });

    it('pass 1 excludes already-successful files (resume)', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');
      checkpoint.markSuccess('app/layout.tsx', 1);

      // Re-initialize (simulating resume)
      const checkpoint2 = new CodegenCheckpoint(checkpointPath);
      checkpoint2.initialize(TEST_FILE_LIST, 'test-project');

      const files = checkpoint2.getFilesForPass(1);
      // app/layout.tsx is success, so it's not pending → not in pass 1
      expect(files).not.toContain('app/layout.tsx');
    });

    it('pass 2 returns only failed and blocked files', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // Simulate pass 1 results
      checkpoint.markSuccess('app/layout.tsx', 1);
      checkpoint.markSuccess('app/globals.css', 1);
      checkpoint.markSuccess('lib/gsap-config.ts', 1);
      checkpoint.markFailed('lib/lenis-provider.tsx', 'API error', 1);
      checkpoint.markBlocked('hooks/useLenis.ts', 'lib/lenis-provider.tsx', 1);
      checkpoint.markSuccess('hooks/useReducedMotion.ts', 1);
      checkpoint.markSuccess('components/Footer.tsx', 1);
      checkpoint.markSuccess('package.json', 1);
      checkpoint.markSuccess('tailwind.config.ts', 1);
      checkpoint.markSuccess('postcss.config.js', 1);
      // Hero blocked, page blocked, Navbar blocked
      checkpoint.markBlocked('components/Hero.tsx', 'lib/lenis-provider.tsx', 1);
      checkpoint.markBlocked('app/page.tsx', 'components/Navbar.tsx', 1);
      checkpoint.markBlocked('components/Navbar.tsx', 'hooks/useLenis.ts', 1);

      const pass2Files = checkpoint.getFilesForPass(2);

      // Should include the failed file and all blocked files
      expect(pass2Files).toContain('lib/lenis-provider.tsx');
      expect(pass2Files).toContain('hooks/useLenis.ts');
      expect(pass2Files).toContain('components/Navbar.tsx');
      expect(pass2Files).toContain('components/Hero.tsx');
      expect(pass2Files).toContain('app/page.tsx');

      // Should NOT include successful files
      expect(pass2Files).not.toContain('app/layout.tsx');
      expect(pass2Files).not.toContain('app/globals.css');
    });

    it('pass 2 returns empty when all files succeeded', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      for (const file of TEST_FILE_LIST) {
        checkpoint.markSuccess(file.path, 1);
      }

      const pass2Files = checkpoint.getFilesForPass(2);
      expect(pass2Files).toHaveLength(0);
    });
  });

  // ── 6. Kill-and-resume simulation ──

  describe('kill-and-resume simulation', () => {
    it('survives process "kill" mid-pass and resumes correctly', () => {
      // Simulate a run that gets killed after generating 5 of 13 files
      const checkpoint1 = new CodegenCheckpoint(checkpointPath);
      checkpoint1.initialize(TEST_FILE_LIST, 'test-project');

      // Files 1-5 succeed
      checkpoint1.markSuccess('app/layout.tsx', 1);
      checkpoint1.markSuccess('app/globals.css', 1);
      checkpoint1.markSuccess('lib/gsap-config.ts', 1);
      checkpoint1.markSuccess('lib/lenis-provider.tsx', 1);
      checkpoint1.markSuccess('hooks/useReducedMotion.ts', 1);

      // "Process killed" — checkpoint1 goes out of scope

      // "Process restarted" — new checkpoint instance
      const checkpoint2 = new CodegenCheckpoint(checkpointPath);
      checkpoint2.initialize(TEST_FILE_LIST, 'test-project');

      // 5 files should be resumed as success
      expect(checkpoint2.isAlreadySuccessful('app/layout.tsx')).toBe(true);
      expect(checkpoint2.isAlreadySuccessful('app/globals.css')).toBe(true);
      expect(checkpoint2.isAlreadySuccessful('lib/gsap-config.ts')).toBe(true);
      expect(checkpoint2.isAlreadySuccessful('lib/lenis-provider.tsx')).toBe(true);
      expect(checkpoint2.isAlreadySuccessful('hooks/useReducedMotion.ts')).toBe(true);

      // Remaining 8 files should be pending
      expect(checkpoint2.getStatus('hooks/useLenis.ts')!.status).toBe('pending');
      expect(checkpoint2.getStatus('components/Navbar.tsx')!.status).toBe('pending');
      expect(checkpoint2.getStatus('components/Hero.tsx')!.status).toBe('pending');
      expect(checkpoint2.getStatus('app/page.tsx')!.status).toBe('pending');

      // Pass 1 should return only pending files
      const pass1Files = checkpoint2.getFilesForPass(1);
      expect(pass1Files).toHaveLength(8);
      expect(pass1Files).not.toContain('app/layout.tsx');
    });

    it('preserves attempt counts across restarts', () => {
      const checkpoint1 = new CodegenCheckpoint(checkpointPath);
      checkpoint1.initialize(TEST_FILE_LIST, 'test-project');
      checkpoint1.markFailed('app/layout.tsx', 'Error 1', 1);
      checkpoint1.markFailed('app/layout.tsx', 'Error 2', 2);

      // "Restart"
      const checkpoint2 = new CodegenCheckpoint(checkpointPath);
      checkpoint2.initialize(TEST_FILE_LIST, 'test-project');

      // Attempt count preserved (status reset to pending for retry)
      const entry = checkpoint2.getStatus('app/layout.tsx');
      expect(entry!.status).toBe('pending');
      expect(entry!.attempts).toBe(2); // Preserved from previous run
    });
  });

  // ── 7. Summary report ──

  describe('getSummaryReport', () => {
    it('reports all files succeeded on first pass', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      for (const file of TEST_FILE_LIST) {
        checkpoint.markSuccess(file.path, 1);
      }

      const report = checkpoint.getSummaryReport();
      expect(report).toContain('13/13 succeeded on pass 1');
      expect(report).not.toContain('permanently failed');
    });

    it('reports mixed pass results correctly', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      // 11 succeed on pass 1
      const files = TEST_FILE_LIST.map(f => f.path);
      for (let i = 0; i < 11; i++) {
        checkpoint.markSuccess(files[i]!, 1);
      }
      // 2 succeed on pass 2
      checkpoint.markSuccess(files[11]!, 2);
      checkpoint.markSuccess(files[12]!, 2);

      const report = checkpoint.getSummaryReport();
      expect(report).toContain('11/13 succeeded on pass 1');
      expect(report).toContain('2/13 succeeded on pass 2');
      expect(report).not.toContain('permanently failed');
    });

    it('reports permanently failed files', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      for (let i = 0; i < 12; i++) {
        checkpoint.markSuccess(TEST_FILE_LIST[i]!.path, 1);
      }
      checkpoint.markFailed(TEST_FILE_LIST[12]!.path, 'Fatal error', 3);

      const report = checkpoint.getSummaryReport();
      expect(report).toContain('12/13 succeeded on pass 1');
      expect(report).toContain('1/13 permanently failed');
    });

    it('reports blocked files', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      for (let i = 0; i < 11; i++) {
        checkpoint.markSuccess(TEST_FILE_LIST[i]!.path, 1);
      }
      checkpoint.markFailed(TEST_FILE_LIST[11]!.path, 'Error', 3);
      checkpoint.markBlocked(TEST_FILE_LIST[12]!.path, TEST_FILE_LIST[11]!.path, 3);

      const report = checkpoint.getSummaryReport();
      expect(report).toContain('1/13 permanently failed');
      expect(report).toContain('1/13 blocked by dependencies');
    });
  });

  // ── 8. Pass result recording ──

  describe('recordPassResult', () => {
    it('records pass results in the manifest', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.recordPassResult({
        pass: 1,
        attempted: 13,
        succeeded: 11,
        failed: 1,
        blocked: 1,
        skipped: 0,
        durationMs: 5000,
      });

      const manifest = checkpoint.getManifest();
      expect(manifest.passResults).toHaveLength(1);
      expect(manifest.passResults[0]!.pass).toBe(1);
      expect(manifest.passResults[0]!.succeeded).toBe(11);
      expect(manifest.passResults[0]!.failed).toBe(1);
    });

    it('persists pass results to disk', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.recordPassResult({
        pass: 1,
        attempted: 10,
        succeeded: 10,
        failed: 0,
        blocked: 0,
        skipped: 3,
        durationMs: 3000,
      });

      const raw = readFileSync(checkpointPath, 'utf-8');
      const parsed = JSON.parse(raw) as CheckpointManifest;
      expect(parsed.passResults).toHaveLength(1);
    });
  });

  // ── 9. Helper methods ──

  describe('helper methods', () => {
    it('getSuccessCount returns correct count', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      expect(checkpoint.getSuccessCount()).toBe(0);

      checkpoint.markSuccess('app/layout.tsx', 1);
      checkpoint.markSuccess('app/globals.css', 1);
      checkpoint.markFailed('lib/gsap-config.ts', 'Error', 1);

      expect(checkpoint.getSuccessCount()).toBe(2);
    });

    it('getPermanentlyFailedFiles returns failed and blocked files', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      checkpoint.markFailed('app/layout.tsx', 'Parse error', 3);
      checkpoint.markBlocked('hooks/useLenis.ts', 'lib/lenis-provider.tsx', 3);

      const failed = checkpoint.getPermanentlyFailedFiles();
      expect(failed).toHaveLength(2);
      expect(failed.find(f => f.path === 'app/layout.tsx')?.error).toBe('Parse error');
      expect(failed.find(f => f.path === 'hooks/useLenis.ts')?.error).toBe('lib/lenis-provider.tsx');
    });

    it('isAlreadySuccessful returns false for non-existent file', () => {
      const checkpoint = new CodegenCheckpoint(checkpointPath);
      checkpoint.initialize(TEST_FILE_LIST, 'test-project');

      expect(checkpoint.isAlreadySuccessful('nonexistent.ts')).toBe(false);
    });
  });
});
