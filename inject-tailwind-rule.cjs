const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const additionalRule = "        '- MUST START EXACTLY WITH: import type { Config } from \\'tailwindcss\\';',\n" +
                       "        '- MUST DECLARE: const config: Config = { ... }',\n" +
                       "        '- MUST END WITH: export default config;',\n";

if (content.includes("'- NEVER use a 3-element array for fontSize.',")) {
  content = content.replace(
    "'- NEVER use a 3-element array for fontSize.',",
    "'- NEVER use a 3-element array for fontSize.',\n" + additionalRule
  );
  fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
  console.log('Successfully injected Tailwind config rule.');
} else {
  console.log('Could not find anchor string!');
}
