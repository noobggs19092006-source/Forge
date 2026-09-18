const fs = require('fs');
let content = fs.readFileSync('core/providers/adapters/ollama.ts', 'utf8');

content = content.replace(
  "const options: { temperature?: number } = {};",
  "const options: { temperature?: number, num_ctx?: number } = { num_ctx: 8192 };"
);

fs.writeFileSync('core/providers/adapters/ollama.ts', content);
console.log('Added num_ctx to Ollama options!');
