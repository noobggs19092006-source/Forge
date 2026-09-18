const fs = require('fs');
let content = fs.readFileSync('regression-test.mjs', 'utf8');

const t = `const pipeline = new ForgePipeline(config);`;
const r = `const pipeline = new ForgePipeline(config);
  pipeline.events.on('stage:start', msg => console.log('[PIPELINE] ' + msg));
  pipeline.events.on('stage:success', msg => console.log('[PIPELINE OK] ' + msg));
  pipeline.events.on('stage:error', err => console.log('[PIPELINE ERROR] ' + err.error?.message || err));
`;

content = content.replace(t, r);
fs.writeFileSync('regression-test.mjs', content);
console.log('Added event listeners to regression-test.mjs');
