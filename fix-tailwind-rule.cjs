const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "'- Do NOT use \\'defineConfig\\'. Use exactly: import type { Config } from \\'tailwindcss\\'; const config: Config = { ... }; export default config;',",
  "'- MUST START EXACTLY WITH: import type { Config } from \\'tailwindcss\\';\\n- MUST DECLARE: const config: Config = { ... }\\n- MUST END WITH: export default config;',"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixed Tailwind rule in codegen-agent.ts');
