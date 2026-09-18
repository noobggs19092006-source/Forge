const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const injection = "             '- ALWAYS include ALL imports used in the file! If you use lenis, you MUST import it!\\n' +\n";

content = content.replace(
  "             '- IMPORT useLenis CORRECTLY: import { useLenis } from \\'../hooks/useLenis\\'; (It is a NAMED export, do NOT import it from lenis-provider)\\n' +",
  "             '- IMPORT useLenis CORRECTLY: import { useLenis } from \\'../hooks/useLenis\\'; (It is a NAMED export, do NOT import it from lenis-provider)\\n' +\n" + injection
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Injected always-import rule successfully!');
