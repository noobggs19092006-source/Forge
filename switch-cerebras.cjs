const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "fixture.provider = 'groq';",
  "fixture.provider = 'cerebras';"
);

content = content.replace(
  "config.routing.fallbackOrder = ['groq'];",
  "config.routing.fallbackOrder = ['cerebras'];"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Switched provider to Cerebras successfully!');
