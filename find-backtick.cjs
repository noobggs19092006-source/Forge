const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf-8');
const lines = content.split('\n');

let backtickCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const backticks = (line.match(/`/g) || []).length;
  if (backticks > 0) {
    console.log('Line', i+1, ':', backticks, 'backticks:', lines[i].trim().slice(0, 100));
  }
}