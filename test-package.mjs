import { ForgePipeline, loadConfig } from '@forge/core';
import { resolve } from 'node:path';

async function main() {
  const config = loadConfig();
  const pipeline = new ForgePipeline(config);
  
  // Load existing artifacts
  const artifactsDir = resolve(config.outputDir, 'minimal-portfolio', '.forge');
  
  // Just regenerate package.json by running codegen for that file
  const provider = config.env.nvidiaApiKey 
    ? (await import('@forge/core')).ProviderRouter
    : null;
  
  // We'll directly test the codegen agent
  const { CodegenAgent } = await import('@forge/core/agents/codegen/codegen-agent.js');
  
  // Load the existing artifacts
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  
  const sitemap = JSON.parse(await fs.readFile(path.join(artifactsDir, 'sitemap.json'), 'utf-8'));
  const designTokens = JSON.parse(await fs.readFile(path.join(artifactsDir, 'design-tokens.json'), 'utf-8'));
  const motionPlan = JSON.parse(await fs.readFile(path.join(artifactsDir, 'motion-plan.json'), 'utf-8'));
  const brief = JSON.parse(await fs.readFile(path.join(artifactsDir, 'brief.json'), 'utf-8'));
  
  console.log('Loaded artifacts');
  
  // Create a mock provider for testing
  class MockProvider {
    name = 'mock';
    tier = 'cloud' as const;
    async complete(params: any) {
      console.log('Prompt length:', params.systemPrompt.length + JSON.stringify(params.messages).length);
      return { content: '', structured: null };
    }
  }
  
  // We need a real provider - let's use the actual NIM/Ollama
}

main().catch(console.error);