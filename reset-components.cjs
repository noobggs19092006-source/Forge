const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

const filesToReset = [
  'components/Hero.tsx',
  'components/About.tsx',
  'components/Work.tsx',
  'components/Contact.tsx',
  'components/Navbar.tsx',
  'components/Footer.tsx',
  'app/page.tsx'
];

for (const file of filesToReset) {
  if (content.fileStatuses[file]) {
    content.fileStatuses[file] = { status: 'pending', attempts: 0 };
  }
}

content.passResults = [];
fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Reset components in checkpoint.json successfully!');
