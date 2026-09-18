const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "fixture.provider = 'ollama';",
  "fixture.provider = 'groq';"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Switched provider to Groq successfully!');
