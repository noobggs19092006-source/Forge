const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "- Export LenisContext with createContext<Lenis | null>(null)",
  "- MUST export LenisContext: export const LenisContext = createContext<Lenis | null>(null);"
);

content = content.replace(
  "- Output complete, runnable code -- no placeholders, no TODOs",
  "- Output complete, runnable code -- no placeholders, no TODOs\n  - NEVER import framer-motion. The project uses GSAP exclusively for all animations."
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
