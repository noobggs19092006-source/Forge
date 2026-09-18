const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "- Import globals.css as: import '../app/globals.css'",
  ""
);
content = content.replace(
  "- Import LenisProvider from '../lib/lenis-provider'",
  "- DO NOT import or use LenisProvider here. It is handled in the root layout."
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
