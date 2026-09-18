const fs = require('fs');
let content = fs.readFileSync('core/orchestrator/pipeline.ts', 'utf8');

const t = `private async checkOllamaConnectivity(): Promise<void> {`;
const r = `private async checkOllamaConnectivity(): Promise<void> {
    if (this.config.routing.activeProvider !== 'ollama') {
      return;
    }`;

content = content.replace(t, r);

fs.writeFileSync('core/orchestrator/pipeline.ts', content);
console.log('Fixed pipeline.ts checkOllamaConnectivity logic');
