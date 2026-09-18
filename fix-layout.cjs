const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "- Wrap children with LenisProvider",
  "- Wrap children with LenisProvider (MUST be inside the <body> tag, do NOT wrap the <html> tag with LenisProvider)"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
