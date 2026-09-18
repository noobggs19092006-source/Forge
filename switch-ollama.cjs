const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "fixture.provider = 'cerebras';",
  "fixture.provider = 'ollama';"
);

content = content.replace(
  "config.routing.fallbackOrder = ['cerebras'];",
  "config.routing.fallbackOrder = ['ollama'];"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Switched provider to Ollama successfully!');
