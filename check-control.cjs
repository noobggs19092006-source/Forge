const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// Check for any non-printable characters (except newline, tab, carriage return)
let found = false;
for (let i = 0; i < content.length; i++) {
  const code = content.charCodeAt(i);
  if ((code < 32 && code !== 10 && code !== 13 && code !== 9) || code === 127) {
    console.log('Control char at pos', i, 'code:', content.charCodeAt(i).toString(16), 'char:', JSON.stringify(content[i]));
  }
}
console.log('Done checking for control chars');