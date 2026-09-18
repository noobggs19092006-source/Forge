const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf-8');
const lines = content.split('\n');

console.log('Line 348:', lines[347]);

// Check line 813 (0-indexed: 812)
console.log('Line 813:', lines[812]);
console.log('Line 813 backticks:', (lines[812].match(/`/g) || []).length);