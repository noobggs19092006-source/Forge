const fs = require('fs');
let content = fs.readFileSync('core/providers/adapters/groq.ts', 'utf8');

content = content.replace(
  /const response = await fetch\(this.baseUrl, \{/g,
  "const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(60000),"
);

fs.writeFileSync('core/providers/adapters/groq.ts', content);
console.log('Added timeout to Groq fetch!');
