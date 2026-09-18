const fs = require('fs');
let content = fs.readFileSync('core/providers/adapters/groq.ts', 'utf8');

content = content.replace("defaultModel = 'qwen/qwen3.8-27b'", "defaultModel = 'llama-3.3-70b-versatile'");

fs.writeFileSync('core/providers/adapters/groq.ts', content);
console.log('Fixed groq.ts to use llama-3.3-70b-versatile');
