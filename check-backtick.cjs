const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');
const lines = content.split('\n');
const line584 = lines[583];

// Find the backtick position
const backtickIndex = line584.indexOf('`');
console.log('Backtick index:', backtickIndex);
console.log('Char at backtick:', line584[backtickIndex], 'code:', line584.charCodeAt(backtickIndex));

// Check the template string content
const templateStart = line584.indexOf('`') + 1;
const templateEnd = line584.lastIndexOf('`');
const templateContent = line584.slice(templateStart, templateEnd);
console.log('Template content:', templateContent);
console.log('Template length:', templateContent.length);

// Check for any unusual characters in the template
for (let i = 0; i < templateContent.length; i++) {
  const code = templateContent.charCodeAt(i);
  if (code > 127 || code < 32) {
    console.log('Non-ASCII at pos', i, ':', templateContent[i], 'code:', templateContent.charCodeAt(i).toString(16));
  }
}