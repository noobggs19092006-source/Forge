const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

if (content.fileStatuses['components/About.tsx']) {
  content.fileStatuses['components/About.tsx'] = { status: 'pending', attempts: 0 };
}

content.passResults = [];
fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Reset About.tsx in checkpoint.json successfully!');
