const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

if (content.fileStatuses['components/Contact.tsx']) {
  content.fileStatuses['components/Contact.tsx'] = {
    status: 'pending',
    attempts: 0
  };
}

// Reset pass results so it knows it still has to finish pass 1
content.passResults = [];
content.totalFiles = 20; // Keep the same number from the last clean sitemap run

fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Reset Contact.tsx in checkpoint.json successfully!');
