const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

if (content.fileStatuses['tailwind.config.ts']) {
  content.fileStatuses['tailwind.config.ts'] = {
    status: 'pending',
    attempts: 0
  };
}

// Reset pass results so it knows it still has to finish pass 1
content.passResults = [];
// totalFiles remains the same

fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Reset tailwind.config.ts in checkpoint.json successfully!');
