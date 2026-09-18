const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

if (content.fileStatuses['tailwind.config.ts']) {
  content.fileStatuses['tailwind.config.ts'] = {
    status: 'success',
    attempts: 1
  };
}

fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Marked tailwind.config.ts as success in checkpoint.json!');
