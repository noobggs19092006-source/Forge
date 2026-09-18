const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf-8');
const lines = content.split('\n');

let backtickCount = 0;
for (let i = 0; i < 584; i++) {
  const line = lines[i];
  const backticks = (line.match(/`/g) || []).length;
  backtickCount += backticks;
  if (backticks > 0) {
    console.log('Line', i+1, ':', backticks, 'backticks, total:', backtickCount);
  }
}
console.log('Total backticks up to line 584:', backtickCount);
console.log('Even:', backtickCount % 2 === 0);