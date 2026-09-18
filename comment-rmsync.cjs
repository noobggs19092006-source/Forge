const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "rmSync(projectOutputDir, { recursive: true, force: true });",
  "// rmSync(projectOutputDir, { recursive: true, force: true });"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Commented out rmSync in regression-test.mjs');
