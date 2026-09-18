const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// Check for any unusual characters in the template strings
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // Find template strings
  const templateMatches = line.match(/`[^`]*\${[^}]*}[^`]*`/g);
  if (templateMatches) {
    for (const match of templateMatches) {
      console.log('Line', lines.indexOf(line) + 1, ':', match);
      // Check each character
      for (let j = 0; j < match.length; j++) {
        const code = match.charCodeAt(j);
        if (code > 127) {
          console.log('  Non-ASCII at pos', j, ':', match[j], code.toString(16));
        }
      }
    }
  }
}