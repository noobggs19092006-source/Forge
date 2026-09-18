const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const injection = "             '- IMPORT useLenis CORRECTLY: import { useLenis } from \\'../hooks/useLenis\\'; (It is a NAMED export, do NOT import it from lenis-provider)\\n' +\n";

content = content.replace(
  "             '- IMPORT useReducedMotion CORRECTLY: import useReducedMotion from \\'../hooks/useReducedMotion\\'; (It is a DEFAULT export, do NOT use curly braces)\\n' +",
  "             '- IMPORT useReducedMotion CORRECTLY: import useReducedMotion from \\'../hooks/useReducedMotion\\'; (It is a DEFAULT export, do NOT use curly braces)\\n' +\n" + injection
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Injected useLenis rule successfully!');
