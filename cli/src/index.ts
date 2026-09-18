#!/usr/bin/env node

import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { ForgePipeline, loadConfig } from '@forge/core';
import { createPipelineLogger, printBanner, printError, printUsage } from './logger.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..', '..', '..');

// Load .env from project root (monorepo root)
loadEnv({ path: resolve(__dirname, '.env') });

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printBanner();
    printUsage();
    process.exit(0);
  }

  // Parse command
  const command = args[0];
  if (command !== 'generate') {
    printError(`Unknown command: "${command}". Use "forge generate" or "forge --help".`);
    process.exit(1);
  }

  // Get prompt
  const prompt = args.slice(1).join(' ');
  if (!prompt) {
    printError('Missing prompt. Usage: forge generate "your prompt here"');
    process.exit(1);
  }

  // Validate environment
  const geminiKey = process.env['GEMINI_API_KEY'];
  const openrouterKey = process.env['OPENROUTER_API_KEY'];
  const nvidiaKey = process.env['NVIDIA_API_KEY'];
  const groqKey = process.env['GROQ_API_KEY'];
  const cerebrasKey = process.env['CEREBRAS_API_KEY'];
  
  // Log masked key confirmation
  const maskKey = (key: string | undefined, label: string) => {
    if (key) {
      const masked = key.slice(0, 8) + '***' + key.slice(-4);
      console.log(`  [env] ${label} loaded: ${masked}`);
    } else {
      console.log(`  [env] ${label} NOT SET`);
    }
  };
  
  maskKey(geminiKey, 'GEMINI_API_KEY');
  maskKey(openrouterKey, 'OPENROUTER_API_KEY');
  maskKey(nvidiaKey, 'NVIDIA_API_KEY');
  maskKey(groqKey, 'GROQ_API_KEY');
  maskKey(cerebrasKey, 'CEREBRAS_API_KEY');
  
  if (!geminiKey && !openrouterKey && !nvidiaKey && !groqKey && !cerebrasKey) {
    printError(
      'No cloud provider API key set. At least one of these must be set:\n' +
      '  GEMINI_API_KEY (Google AI Studio)\n' +
      '  OPENROUTER_API_KEY (OpenRouter)\n' +
      '  NVIDIA_API_KEY (NVIDIA NIM)\n' +
      'Or run Ollama locally: ollama serve'
    );
    process.exit(1);
  }

  printBanner();

  // Load config and create pipeline
  const config = loadConfig();
  const pipeline = new ForgePipeline(config);

  // Attach logger
  pipeline.onEvent(createPipelineLogger());

  try {
    // Run the pipeline and let it handle persistence
    const result = await pipeline.generate(prompt, config.outputDir);

    const projectName = result.brief.name.toLowerCase().replace(/\s+/g, '-');
    const finalOutputDir = resolve(config.outputDir, projectName);
    const artifactsDir = resolve(finalOutputDir, '.forge');

    console.log(`  📁 Output written to: ${finalOutputDir}`);
    console.log(`  📋 Pipeline artifacts in: ${artifactsDir}`);
    console.log('');

    // Print summary
    console.log('  Generated files:');
    if (result.generatedCode && result.generatedCode.files) {
      for (const filePath of Object.keys(result.generatedCode.files)) {
        console.log(`    • ${filePath}`);
      }
    }
    console.log('');

    if (result.generatedCode.dependencies && Object.keys(result.generatedCode.dependencies).length > 0) {
      console.log('  Required dependencies:');
      for (const [pkg, version] of Object.entries(result.generatedCode.dependencies)) {
        console.log(`    • ${pkg}@${version}`);
      }
      console.log('');
    }

    console.log(`  Critic confidence: ${result.criticReport.overallConfidence}/10`);
    console.log(`  QA gate: ${result.qaReport.overallPass ? '✓ PASSED' : '✗ FAILED'}`);
    console.log('');

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    printError(err.message);
    
    const memory = pipeline.getMemory();
    const brief = memory.get('brief');
    if (brief) {
      const projectName = brief.name.toLowerCase().replace(/\s+/g, '-');
      const artifactsDir = resolve(config.outputDir, projectName, '.forge');
      console.log(`\n  Partial artifacts may be available in: ${artifactsDir}\n`);
    }

    if (process.env['FORGE_DEBUG']) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  const err = error instanceof Error ? error : new Error(String(error));
  printError(`Unexpected error: ${err.message}`);
  process.exit(1);
});
