const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// Replace special characters with ASCII equivalents
content = content.replace(/—/g, '--');  // em dash
content = content.replace(/→/g, '->');  // right arrow
content = content.replace(/×/g, 'x');   // multiplication sign
content = content.replace(/≈/g, '~=');  // approximately equal
content = content.replace(/"/g, '"');   // smart double quotes
content = content.replace(/"/g, '"');
content = content.replace(/'/g, "'");   // smart single quotes
content = content.replace(/'/g, "'");   // smart single quotes

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content, 'utf8');
console.log('Replaced special characters');