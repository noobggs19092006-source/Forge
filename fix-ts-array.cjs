const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "if (lines[i].startsWith('import ')) {",
  "if (lines[i]?.startsWith('import ')) {"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixed TS2532 array indexing error!');
