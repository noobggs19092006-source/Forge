const fs = require('fs');
let content = fs.readFileSync('core/orchestrator/pipeline.ts', 'utf8');

const t = `if (this.config.routing.activeProvider !== 'ollama') {`;
const r = `if (!this.config.routing.fallbackOrder.includes('ollama')) {`;

content = content.replace(t, r);

fs.writeFileSync('core/orchestrator/pipeline.ts', content);
console.log('Fixed pipeline.ts checkOllamaConnectivity logic part 2');
