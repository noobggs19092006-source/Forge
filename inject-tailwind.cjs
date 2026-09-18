const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const injection = "        'SPECIFIC TAILWIND.CONFIG.TS REQUIREMENTS:',\n" +
"        '- MUST use a SINGLE string for font sizes, do NOT use arrays with min/max/clamp. (e.g. \\'xs\\': \\'var(--clamp-xs)\\')',\n" +
"        '- NEVER use a 3-element array for fontSize.',\n" +
"        '',\n";

content = content.replace(
  "'SPECIFIC PACKAGE.JSON REQUIREMENTS:',",
  injection + "        'SPECIFIC PACKAGE.JSON REQUIREMENTS:',"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Injected tailwind rules successfully!');
