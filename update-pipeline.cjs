const fs = require('fs');
let content = fs.readFileSync('core/orchestrator/pipeline.ts', 'utf8');

content = content.replace("fetch('http://localhost:11434/api/ps')", "fetch('http://127.0.0.1:11434/api/ps')");
content = content.replace("fetch('http://localhost:11434/api/generate'", "fetch('http://127.0.0.1:11434/api/generate'");

fs.writeFileSync('core/orchestrator/pipeline.ts', content);
console.log('Fixed pipeline.ts localhost to 127.0.0.1');
