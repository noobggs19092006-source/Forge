const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf-8');

// Count backticks
let backtickCount = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '`') backtickCount++;
}
console.log('Total backticks in file:', backtickCount);
console.log('Backtick count even:', backtickCount % 2 === 0);