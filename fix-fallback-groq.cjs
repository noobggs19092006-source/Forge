const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "config.routing.fallbackOrder = [];",
  "config.routing.fallbackOrder = ['groq'];"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed fallback order successfully!');
