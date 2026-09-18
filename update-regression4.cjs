const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

content = content.replace(
  "pipeline.events.on('stage:start', msg => console.log('[PIPELINE] ' + msg));\n  pipeline.events.on('stage:success', msg => console.log('[PIPELINE OK] ' + msg));\n  pipeline.events.on('stage:error', err => console.log('[PIPELINE ERROR] ' + err.error?.message || err));",
  "pipeline.events.on(e => console.log('[PIPELINE] [' + e.type + '] ' + e.message + (e.data ? '\\n' + JSON.stringify(e.data, null, 2) : '')));"
);

fs.writeFileSync('regression-test.mjs', content);
console.log('Fixed pipeline.events.on in regression-test.mjs');
