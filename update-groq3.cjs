const fs = require('fs');
let content = fs.readFileSync('core/providers/adapters/groq.ts', 'utf8');
content = content.replace("defaultModel = 'openai/gpt-oss-20b'", "defaultModel = 'openai/gpt-oss-120b'");
fs.writeFileSync('core/providers/adapters/groq.ts', content);
console.log('Fixed groq.ts to use openai/gpt-oss-120b');
