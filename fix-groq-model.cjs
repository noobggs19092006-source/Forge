const fs = require('fs');
let content = fs.readFileSync('core/providers/adapters/groq.ts', 'utf8');

content = content.replace(
  /llama-3\.3-70b-versatile/g,
  "qwen/qwen3.8-27b"
);

fs.writeFileSync('core/providers/adapters/groq.ts', content);
console.log('Fixed Groq default model successfully!');
