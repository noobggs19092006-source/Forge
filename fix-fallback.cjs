const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "config.routing.fallbackOrder = ['ollama'];",
  "config.routing.fallbackOrder = [];"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed fallback order successfully!');
