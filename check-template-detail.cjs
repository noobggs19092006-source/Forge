const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');
const lines = content.split('\n');
const line584 = lines[583];

// Find template strings using a different approach
const templateMatch = line584.match(/`[^`]*`/);
if (templateMatch) {
  const match = templateMatch[0];
  console.log('Template match:', match);
  console.log('Match length:', match.length);
  
  // Check each character
  for (let i = 0; i < match.length; i++) {
    const code = match.charCodeAt(i);
    console.log('Pos', i, ':', match[i], 'code:', code.toString(16));
  }
} else {
  console.log('No template string found');
}