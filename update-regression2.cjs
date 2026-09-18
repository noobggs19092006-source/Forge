const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace("config.routing.fallbackOrder = ['ollama'];", "config.routing.fallbackOrder = ['groq'];");

fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed regression-test.mjs to actually use groq');
