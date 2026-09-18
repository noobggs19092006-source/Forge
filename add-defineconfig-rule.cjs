const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const additionalRule = "        '- Do NOT use \\'defineConfig\\'. Use exactly: import type { Config } from \\'tailwindcss\\'; const config: Config = { ... }; export default config;',\n";

content = content.replace(
  "'- NEVER use a 3-element array for fontSize.',\\n",
  "'- NEVER use a 3-element array for fontSize.',\n" + additionalRule
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Added defineConfig rule successfully!');
