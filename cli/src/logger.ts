import type { PipelineEvent } from '@forge/core';

/**
 * CLI Logger — pretty console output with color-coded stage indicators and timing.
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',

  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
} as const;

const stageColors: Record<string, string> = {
  'intake': colors.cyan,
  'architect': colors.blue,
  'design-brain': colors.magenta,
  'motion-brain': colors.yellow,
  'codegen': colors.green,
  'qa-gate': colors.red,
  'critic': colors.white,
};

function getStageColor(stage?: string): string {
  if (!stage) return colors.dim;
  return stageColors[stage] ?? colors.dim;
}

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function createPipelineLogger(): (event: PipelineEvent) => void {
  const startTime = Date.now();

  return (event: PipelineEvent) => {
    const elapsed = formatDuration(Date.now() - startTime);
    const stageColor = getStageColor(event.stage);
    const stageTag = event.stage
      ? `${stageColor}${colors.bold}[${event.stage}]${colors.reset}`
      : '';

    switch (event.type) {
      case 'pipeline:start':
        console.log('');
        console.log(`${colors.bold}${colors.cyan}⚒  FORGE${colors.reset} ${colors.dim}— Agentic Frontend Generation${colors.reset}`);
        console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
        console.log(`${colors.dim}${event.message}${colors.reset}`);
        console.log('');
        break;

      case 'pipeline:complete':
        console.log('');
        console.log(`${colors.dim}${'─'.repeat(60)}${colors.reset}`);
        console.log(`${colors.green}${colors.bold}✓ COMPLETE${colors.reset} ${event.message} ${colors.dim}(total: ${elapsed})${colors.reset}`);
        console.log('');
        break;

      case 'pipeline:error':
        console.log('');
        console.log(`${colors.red}${colors.bold}✗ FAILED${colors.reset} ${event.message}`);
        console.log('');
        break;

      case 'stage:start':
        console.log(`  ${colors.dim}▸${colors.reset} ${stageTag} ${event.message}`);
        break;

      case 'stage:complete': {
        const duration = event.durationMs ? ` ${colors.dim}(${formatDuration(event.durationMs)})${colors.reset}` : '';
        console.log(`  ${colors.green}✓${colors.reset} ${stageTag} ${event.message}${duration}`);
        break;
      }

      case 'stage:error':
        console.log(`  ${colors.red}✗${colors.reset} ${stageTag} ${event.message}`);
        break;

      case 'stage:retry':
        console.log(`  ${colors.yellow}↻${colors.reset} ${stageTag} ${event.message}`);
        break;

      case 'qa:check':
        console.log(`  ${colors.bold}  ${event.message}${colors.reset}`);
        break;

      case 'critic:score':
        console.log(`  ${colors.bold}  ${event.message}${colors.reset}`);
        break;
    }
  };
}

export function printBanner(): void {
  console.log('');
  console.log(`${colors.bold}${colors.cyan}`);
  console.log('  ███████╗ ██████╗ ██████╗  ██████╗ ███████╗');
  console.log('  ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝');
  console.log('  █████╗  ██║   ██║██████╔╝██║  ███╗█████╗  ');
  console.log('  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝  ');
  console.log('  ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗');
  console.log('  ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝');
  console.log(`${colors.reset}`);
  console.log(`${colors.dim}  Motion-first frontend generation${colors.reset}`);
  console.log('');
}

export function printError(message: string): void {
  console.error(`${colors.red}${colors.bold}Error:${colors.reset} ${message}`);
}

export function printUsage(): void {
  console.log(`${colors.bold}Usage:${colors.reset}`);
  console.log(`  forge generate "<prompt>"    Generate a section/page from a prompt`);
  console.log(`  forge --help                 Show this help message`);
  console.log('');
  console.log(`${colors.bold}Examples:${colors.reset}`);
  console.log(`  forge generate "dark brutalist portfolio hero section"`);
  console.log(`  forge generate "SaaS landing page for an AI writing tool, playful and modern"`);
  console.log('');
  console.log(`${colors.bold}Environment:${colors.reset}`);
  console.log(`  GEMINI_API_KEY     Google Gemini API key`);
  console.log(`  OPENROUTER_API_KEY OpenRouter API key (used as fallback or primary for cloud models)`);
  console.log(`  OLLAMA_BASE_URL    Ollama server URL (default: http://localhost:11434)`);
}
