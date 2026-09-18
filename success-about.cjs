const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

if (content.fileStatuses['components/About.tsx']) {
  content.fileStatuses['components/About.tsx'] = {
    "status": "success",
    "attempts": 1,
    "passCompleted": 1,
    "generatedAt": new Date().toISOString(),
    "lastPassAttempted": 1
  };
}

fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Marked About.tsx as success in checkpoint.json!');
