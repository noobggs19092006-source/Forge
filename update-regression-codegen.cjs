const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

const t = `config.routing.fallbackOrder = ['groq'];`;
const r = `config.routing.fallbackOrder = ['groq'];\n  config.routing.codegenFallbackOrder = ['groq'];`;

content = content.replace(t, r);
fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed regression-test.mjs to force groq for codegenFallbackOrder too!');
