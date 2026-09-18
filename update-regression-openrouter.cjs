const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

const t = `config.routing.fallbackOrder = ['groq'];\n  config.routing.codegenFallbackOrder = ['groq'];`;
const r = `config.routing.fallbackOrder = ['openrouter'];\n  config.routing.codegenFallbackOrder = ['openrouter'];`;

content = content.replace(t, r);
fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed regression-test.mjs to use OpenRouter instead of Groq because of the 7k ITPM rate limit!');
