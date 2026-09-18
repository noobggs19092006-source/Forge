const fs = require('fs');
let content = fs.readFileSync('core/dist/agents/codegen/codegen-agent.js', 'utf8');

const target = "if (missing.length > 0) {";
const replacement = "console.log('MISSING IMPORTS TRIGGERED:', missing); if (missing.length > 0) {";

content = content.replace(target, replacement);

fs.writeFileSync('core/dist/agents/codegen/codegen-agent.js', content);
console.log('Injected console.log into codegen-agent.js');
