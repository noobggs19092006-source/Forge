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
  console.log('Match hex:', Buffer.from(match, 'utf8').toString('hex'));
} else {
  console.log('No template string found');
}