const fs = require('fs');
const content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');
const lines = content.split('\n');
const line584 = lines[583];

// Check the exact bytes at line 584
console.log('Line 584:', line584);

// Check if there's any issue with the template string by looking at the exact bytes
const buffer = Buffer.from(line584, 'utf8');
console.log('Line 584 hex:', buffer.toString('hex'));

// Check the exact bytes around the template string
const templateStart = line584.indexOf('`');
const templateEnd = line584.lastIndexOf('`');
console.log('Template start:', templateStart);
console.log('Template end:', templateEnd);

if (templateStart >= 0 && templateEnd >= 0) {
  const templateContent = line584.slice(templateStart + 1, templateEnd);
  console.log('Template content:', templateContent);
  console.log('Template content length:', templateContent.length);
  
  // Check each character
  for (let i = 0; i < templateContent.length; i++) {
    const code = templateContent.charCodeAt(i);
    console.log('Pos', i, ':', templateContent[i], 'code:', code.toString(16));
  }
}