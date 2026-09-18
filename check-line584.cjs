const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf-8');
const lines = content.split('\n');
const line584 = lines[583];
console.log('Line 584:', line584);

// Check for backticks
const backtickCount = (line584.match(/`/g) || []).length;
console.log('Backtick count:', backtickCount);

// Check for escape sequences
const backslashCount = (line584.match(/\\\\/g) || []).length;
console.log('Backslash count:', backslashCount);