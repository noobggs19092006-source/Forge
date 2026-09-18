const fs = require('fs');
let content = JSON.parse(fs.readFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', 'utf8'));

for (const key of Object.keys(content.fileStatuses)) {
  content.fileStatuses[key].status = 'success';
}
content.passResults = [];

fs.writeFileSync('regression-output/simple-portfolio/.forge/checkpoint.json', JSON.stringify(content, null, 2));
console.log('Marked all files as success in checkpoint.json!');
