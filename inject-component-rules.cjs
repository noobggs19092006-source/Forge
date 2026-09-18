const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const injection = 
  "             '- IMPORT ScrollTrigger CORRECTLY: import { ScrollTrigger } from \\'gsap/ScrollTrigger\\';\\n' +\n" +
  "             '- IMPORT useReducedMotion CORRECTLY: import useReducedMotion from \\'../hooks/useReducedMotion\\'; (It is a DEFAULT export, do NOT use curly braces)\\n' +\n" +
  "             '- PROPS: ALWAYS declare an interface for your props (e.g. interface Props { id?: string }) and accept id in your component signature.\\n' +\n";

content = content.replace(
  "             '- IMPORTANT: For all imports from lib or hooks directories, use ONE level up relative path (e.g. \\'../lib/lenis-provider\\' or \\'../hooks/useReducedMotion\\' or \\'../lib/gsap-config\\'). Do NOT use \\'../../\\'.\\n' +",
  "             '- IMPORTANT: For all imports from lib or hooks directories, use ONE level up relative path (e.g. \\'../lib/lenis-provider\\' or \\'../hooks/useReducedMotion\\' or \\'../lib/gsap-config\\'). Do NOT use \\'../../\\'.\\n' +\n" + injection
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Injected component rules successfully!');
