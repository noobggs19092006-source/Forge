const fs = require('fs');
let content = fs.readFileSync('core/providers/adapters/ollama.ts', 'utf8');
content = content.replace(/num_ctx:\s*8192/g, 'num_ctx: 4096');
fs.writeFileSync('core/providers/adapters/ollama.ts', content);
console.log('Updated num_ctx to 4096');
