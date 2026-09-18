const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

if (content.fileStatuses['components/Navbar.tsx']) {
  content.fileStatuses['components/Navbar.tsx'] = {
    status: 'pending',
    attempts: 0
  };
}

// Reset pass results so it knows it still has to finish pass 1
content.passResults = [];
content.totalFiles = 19; // Just keep this the same

fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Reset Navbar.tsx in checkpoint.json successfully!');
