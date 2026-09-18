const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "- MUST explicitly type the event parameter in the change listener: (event: MediaQueryListEvent) => void",
  "- DO NOT type the event parameter. Instead, use 'const handleChange = () => setReducedMotion(mediaQuery.matches);' to completely avoid TypeScript errors."
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
