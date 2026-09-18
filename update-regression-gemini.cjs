const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

const t = `config.routing.fallbackOrder = ['openrouter'];\n  config.routing.codegenFallbackOrder = ['openrouter'];`;
const r = `config.routing.fallbackOrder = ['gemini'];\n  config.routing.codegenFallbackOrder = ['gemini'];`;

content = content.replace(t, r);
fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed regression-test.mjs to use direct Gemini API because OpenRouter is out of credits');
