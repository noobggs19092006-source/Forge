#!/usr/bin/env node

/**
 * Quick regression test for simple fixture only
 */

import { ForgePipeline, loadConfig } from './core/dist/index.js';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

loadEnv({ path: resolve(__dirname, '.env') });

const FIXTURE_PATH = resolve(__dirname, 'regression-fixtures', 'simple.json');
const OUTPUT_DIR = resolve(__dirname, 'regression-output', 'simple-test');

async function main() {
  console.log('Running quick regression test on simple fixture...');
  
  if (existsSync(OUTPUT_DIR)) {
    rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const config = loadConfig();
  config.skipBuildVerification = false;
  const pipeline = new ForgePipeline(config);

  const prompt = readFileSync(FIXTURE_PATH, 'utf-8').trim();
  
  try {
    const result = await pipeline.generate(prompt, OUTPUT_DIR);
    console.log('Pipeline completed');
    
    // Check syntax
    const { transpileModule } = await import('typescript');
    let syntaxErrors = 0;
    for (const [filePath, content] of Object.entries(result.generatedCode.files)) {
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
            }
          });
        } catch (e) {
          console.log(`SYNTAX ERROR: ${filePath}: ${e.message}`);
          syntaxErrors++;
        }
    }
    console.log(`Syntax errors: ${syntaxErrors}`);
    
    // Check QA
    console.log(`QA overall pass: ${result.qaReport.overallPass}`);
    console.log(`QA fix tickets: ${result.qaReport.fixTickets.length}`);
    
    // Check Critic
    console.log(`Critic confidence: ${result.criticReport?.overallConfidence ?? 'N/A'}`);
    
    // Check checkpoint
    const checkpointPath = resolve(OUTPUT_DIR, '.forge', 'checkpoint.json');
    if (existsSync(checkpointPath)) {
      const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'));
      const successCount = Object.values(checkpoint.fileStatuses).filter((f) => f.status === 'success').length;
      const totalCount = Object.keys(checkpoint.fileStatuses).length;
      console.log(`Checkpoint: ${successCount}/${totalCount} success`);
    }
    
  } catch (error) {
    console.error('ERROR:', error.message);
    console.error(error.stack);
  }
}

main();