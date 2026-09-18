const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "({ id: s.id, contentType: s.contentType })))",
  "({ id: s.id, contentType: s.contentType, componentName: s.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') })))"
);

content = content.replace(
  "- ONLY import and render section components that EXIST in the sitemap sections array",
  "- ONLY import and render section components that EXIST in the sitemap sections array (use the exact 'componentName' field provided below for the import path and component tag)"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
