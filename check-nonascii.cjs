const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// Check for any non-ASCII characters in the entire file
let found = false;
for (let i = 0; i < content.length; i++) {
  const code = content.charCodeAt(i);
  if (code > 127) {
    console.log('Non-ASCII at position', i, 'char:', content[i], 'code:', code.toString(16));
  }
}
console.log('Done checking');