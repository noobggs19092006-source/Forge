const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

content = content.replace(
  "- Register ScrollTrigger plugin: gsap.registerPlugin(ScrollTrigger)",
  "- Register ScrollTrigger plugin: gsap.registerPlugin(ScrollTrigger)\n  - DO NOT USE ScrollTrigger.register(). It does not exist. Only use gsap.registerPlugin(ScrollTrigger)."
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
