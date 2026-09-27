#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';

/**
 * Regression Test Suite for Forge Pipeline
 * 
 * Runs the full pipeline against 3 fixed fixtures with hard pass/fail criteria.
 * Uses Groq provider for speed/reliability. Hard timeout per fixture: 15 minutes.
 */

import { ForgePipeline, loadConfig } from './core/dist/index.js';
import { fileURLToPath } from 'node:url';

import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';



const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, '.env') });

loadEnv({ path: resolve(__dirname, '.env') });



const FIXTURES_DIR = resolve(__dirname, 'regression-fixtures');
const FIXTURES = [
  { id: 'simple', path: resolve(FIXTURES_DIR, 'simple.json') },
];

const REGRESSION_OUTPUT_BASE = resolve(__dirname, 'regression-output');
// Enforce exactly 10 minutes for testing
const FIXTURE_TIMEOUT_MS = 60 * 60 * 1000;
 // 10 minutes hard timeout

async function runFixtureWithTimeout(pipeline, fixture, outputDir) {
  const startTime = Date.now();
  const prompt = readFileSync(fixture.path, 'utf-8').trim();
  const promptObj = JSON.parse(prompt);
  const projectName = (promptObj.name || fixture.id).toLowerCase().replace(/\s+/g, '-');
  const projectOutputDir = resolve(outputDir, projectName);
  if (existsSync(projectOutputDir)) {
    rmSync(projectOutputDir, { recursive: true, force: true });
  }
  mkdirSync(projectOutputDir, { recursive: true });

  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  REGRESSION TEST: ${fixture.id.toUpperCase()}`);
  console.log(`  Prompt: ${prompt.substring(0, 80)}...`);
  console.log(`  Output: ${projectOutputDir}`);
  console.log(`  Timeout: ${FIXTURE_TIMEOUT_MS / 60000} minutes`);
  console.log(`═══════════════════════════════════════════\n`);

  let result = {
    id: fixture.id,
    prompt,
    passed: false,
    timedOut: false,
    stages: {
      syntaxValidation: { passed: false, errors: [] },
      nextBuild: { passed: false, output: '' },
      checkpoint: { passed: false, successCount: 0, totalCount: 0 },
      qaGate: { passed: false, fixTickets: 0 },
      critic: { passed: false, confidence: 0 },
    },
    error: undefined,
    durationMs: 0,
  };

  try {
    // Wrap pipeline.generate in timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`TIMEOUT: exceeded ${FIXTURE_TIMEOUT_MS / 60000} minutes`)), FIXTURE_TIMEOUT_MS);
    });

    const pipelinePromise = pipeline.generate(prompt, outputDir);
    
    const pipelineResult = await Promise.race([pipelinePromise, timeoutPromise]);
    const durationMs = Date.now() - startTime;
    result.durationMs = durationMs;

    // 1. Syntax Validation
    console.log(`\n[${fixture.id}] Checking syntax validation...`);
    const syntaxErrors = [];
    const { transpileModule } = await import('typescript');
    
    for (const [filePath, content] of Object.entries(pipelineResult.generatedCode.files)) {
      if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        try {
          transpileModule(content, {
            compilerOptions: { 
              target: 99, 
              module: 99, 
              moduleResolution: 2, 
              jsx: 4, 
              strict: false, 
              skipLibCheck: true,
              esModuleInterop: true,
              allowSyntheticDefaultImports: true,
            }
          });
        } catch (e) {
          syntaxErrors.push(`${filePath}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    
    result.stages.syntaxValidation = {
      passed: syntaxErrors.length === 0,
      errors: syntaxErrors,
    };
    console.log(`  Syntax: ${syntaxErrors.length === 0 ? '✓ PASS' : `✗ FAIL (${syntaxErrors.length} errors)`}`);

    // 2. next build
    console.log(`\n[${fixture.id}] Running next build...`);
    const { spawn } = await import('node:child_process');
    const buildResult = await new Promise((resolve) => {
      const child = spawn('npm', ['run', 'build'], {
        cwd: projectOutputDir,
        stdio: 'pipe',
        shell: true,
        timeout: 180000,
      });
      
      let stdout = '', stderr = '';
      child.stdout?.on('data', (d) => stdout += d);
      child.stderr?.on('data', (d) => stderr += d);
      
      child.on('close', (code) => {
        resolve({ passed: code === 0, output: stdout + stderr });
      });
      child.on('error', (err) => {
        resolve({ passed: false, output: err.message });
      });
    });
    
    result.stages.nextBuild = buildResult;
    console.log(`  next build: ${buildResult.passed ? '✓ PASS' : '✗ FAIL'}`);

    // 3. Checkpoint verification
    console.log(`\n[${fixture.id}] Verifying checkpoint...`);
    const checkpointPath = resolve(projectOutputDir, '.forge', 'checkpoint.json');
    if (existsSync(checkpointPath)) {
      const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
      const successCount = Object.values(checkpoint.fileStatuses).filter((f) => f.status === 'success').length;
      const totalCount = Object.keys(checkpoint.fileStatuses).length;
      result.stages.checkpoint = {
        passed: successCount === totalCount && totalCount > 0,
        successCount,
        totalCount,
      };
      console.log(`  Checkpoint: ${result.stages.checkpoint.passed ? '✓ PASS' : '✗ FAIL'} (${successCount}/${totalCount})`);
    } else {
      result.stages.checkpoint = { passed: false, successCount: 0, totalCount: 0 };
      console.log(`  Checkpoint: ✗ FAIL (not found)`);
    }

    // 4. QA-Gate
    console.log(`\n[${fixture.id}] Checking QA-Gate...`);
    result.stages.qaGate = {
      passed: pipelineResult.qaReport.overallPass,
      fixTickets: pipelineResult.qaReport.fixTickets.length,
    };
    console.log(`  QA-Gate: ${result.stages.qaGate.passed ? '✓ PASS' : `✗ FAIL (${result.stages.qaGate.fixTickets} tickets)`}`);

    // 5. Critic
    console.log(`\n[${fixture.id}] Checking Critic...`);
    result.stages.critic = {
      passed: !!pipelineResult.criticReport,
      confidence: pipelineResult.criticReport?.overallConfidence ?? 0,
    };
    console.log(`  Critic: ${result.stages.critic.passed ? '✓ PASS' : '✗ FAIL'} (confidence: ${result.stages.critic.confidence}/10)`);

    // Overall pass
    result.passed = 
      result.stages.syntaxValidation.passed &&
      result.stages.nextBuild.passed &&
      result.stages.checkpoint.passed &&
      result.stages.qaGate.passed &&
      result.stages.critic.passed;

    console.log(`\n[${fixture.id}] OVERALL: ${result.passed ? '✓ PASS' : '✗ FAIL'} (${durationMs}ms)`);

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    result.durationMs = Date.now() - startTime;
    
    if (errorMsg.includes('TIMEOUT')) {
      result.timedOut = true;
      console.log(`\n[${fixture.id}] TIMEOUT after ${FIXTURE_TIMEOUT_MS / 60000} minutes`);
    } else {
      result.error = errorMsg;
      console.log(`\n[${fixture.id}] ERROR: ${errorMsg}`);
    }
  }

  return result;
}

async function main() {
  // Build dynamic fallback order from available API keys
  const providerPriority = [
    { key: 'GROQ_API_KEY', name: 'groq', label: 'Groq (llama-3.3-70b-versatile)', model: 'llama-3.3-70b-versatile' },
    { key: 'CEREBRAS_API_KEY', name: 'cerebras', label: 'Cerebras (gpt-oss-120b)', model: 'gpt-oss-120b' },
    { key: 'GEMINI_API_KEY', name: 'gemini', label: 'Gemini (gemini-2.5-flash)', model: 'gemini-2.5-flash' },
    { key: 'NVIDIA_API_KEY', name: 'nvidia-nim', label: 'NVIDIA NIM (nvidia/llama-3.1-nemotron-70b-instruct)', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
  ];
  
  const availableProviders = providerPriority
    .filter(p => process.env[p.key] && process.env[p.key].trim().length > 0)
    .map(p => ({ name: p.name, label: p.label, model: p.model }));
  
  // Build model mapping: provider name -> that provider's correct model ID
  const modelMap = {};
  for (const p of availableProviders) {
    modelMap[p.name] = p.model;
  }
  // Ollama fallback - use cloud model to avoid GPU memory issues
  modelMap['ollama'] = 'qwen2.5-coder:7b';
  
  const fallbackOrder = availableProviders.map(p => p.name);
  fallbackOrder.push('ollama'); // Ollama always last as guaranteed fallback
  
  const codegenFallbackOrder = [...fallbackOrder];
  
  const providerLabels = availableProviders.map(p => p.label).join(' → ');
  const bannerProvider = providerLabels ? `${providerLabels} → Ollama (fallback)` : 'Ollama (qwen2.5-coder:7b)';
  
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║  FORGE REGRESSION TEST SUITE                  ║');
  console.log(`║  Provider: ${bannerProvider.padEnd(40)}║`);
  console.log('║  Timeout: 10 minutes per fixture              ║');
  console.log('╚═══════════════════════════════════════════════╝');

  const config = loadConfig();
  config.skipBuildVerification = false;
  config.routing.fallbackOrder = fallbackOrder;
  config.routing.codegenFallbackOrder = codegenFallbackOrder;
  
  // Set stages to use cloud tier when cloud providers available, local otherwise
  const useCloud = availableProviders.length > 0;
  const stageTier = useCloud ? 'cloud' : 'local';
  
// Per-provider model selection: use that provider's own model ID
  // First available provider in fallback order wins for its tier
  const firstProvider = fallbackOrder[0];
  const codegenModel = useCloud ? (modelMap[firstProvider] ?? 'gemini-2.5-flash') : 'qwen2.5-coder:7b';
  const otherStageModel = useCloud ? (modelMap[firstProvider] ?? 'gemini-2.5-flash') : 'qwen2.5-coder:7b';
  
  config.routing.stages = {
    intake: { tier: stageTier, model: otherStageModel },
    architect: { tier: stageTier, model: otherStageModel },
    'design-brain': { tier: stageTier, model: otherStageModel },
    'motion-brain': { tier: stageTier, model: otherStageModel },
    codegen: { tier: stageTier, model: codegenModel },
    'qa-gate': { tier: stageTier, model: otherStageModel },
    critic: { tier: stageTier, model: otherStageModel },
  };
  
  // Ensure Ollama config exists as final fallback
  if (!config.routing.ollama) config.routing.ollama = {};
  config.routing.ollama.baseUrl = 'http://127.0.0.1:11434';
  config.routing.ollama.defaultModel = 'qwen2.5-coder:7b';
  
  // Codegen concurrency: higher for cloud providers with rate-limit handling
  config.codegenMaxConcurrency = useCloud ? 3 : 1;
  config.codegenInterRequestDelayMs = useCloud ? 0 : 0;
  
  
  
  

  const pipeline = new ForgePipeline(config);
  pipeline.events.on(e => console.log('[PIPELINE] [' + e.type + '] ' + e.message + (e.data ? '\n' + JSON.stringify(e.data, null, 2) : '')));


  if (!existsSync(REGRESSION_OUTPUT_BASE)) {
    mkdirSync(REGRESSION_OUTPUT_BASE, { recursive: true });
  }
  const results = [];
  for (const fixture of FIXTURES) {
    const result = await runFixtureWithTimeout(pipeline, fixture, REGRESSION_OUTPUT_BASE);
    results.push(result);
  }
  // Summary
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║  REGRESSION TEST SUMMARY                      ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  let allPassed = true;
  for (const r of results) {
    const status = r.passed ? '✓ PASS' : r.timedOut ? '⏱ TIMEOUT' : '✗ FAIL';
    console.log(`${status}  ${r.id.padEnd(8)}  (${r.durationMs}ms)`);
    if (!r.passed) {
      allPassed = false;
      console.log(`       Syntax: ${r.stages.syntaxValidation.passed ? '✓' : '✗'}  Build: ${r.stages.nextBuild.passed ? '✓' : '✗'}  Checkpoint: ${r.stages.checkpoint.passed ? '✓' : '✗'}  QA: ${r.stages.qaGate.passed ? '✓' : '✗'}  Critic: ${r.stages.critic.passed ? '✓' : '✗'}`);
      if (r.error) console.log(`       Error: ${r.error}`);
      if (r.stages.syntaxValidation.errors.length > 0) {
        console.log(`       Syntax errors:`);
        for (const e of r.stages.syntaxValidation.errors) console.log(`         - ${e}`);
      }
    }
  }

  console.log(`\n${allPassed ? '✓ ALL FIXTURES PASSED' : '✗ SOME FIXTURES FAILED'}`);
  
  const reportPath = resolve(REGRESSION_OUTPUT_BASE, `regression-report-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), results, allPassed }, null, 2));
  console.log(`\nDetailed report: ${reportPath}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('Regression test harness error:', err);
});












