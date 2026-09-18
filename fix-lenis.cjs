const fs = require('fs');

function fixFile(file) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes("import { Lenis } from 'lenis';") || content.includes("import { Lenis } from \"lenis\";")) {
      content = content.replace(/import\s*\{\s*Lenis\s*\}\s*from\s*['"]lenis['"];?/g, "import Lenis from 'lenis';");
      fs.writeFileSync(file, content);
      console.log(`Fixed ${file} manually!`);
    }
  }
}

const dir = 'regression-output/simple-portfolio/components';
const files = fs.readdirSync(dir);
for (const file of files) {
  if (file.endsWith('.tsx')) {
    fixFile(`${dir}/${file}`);
  }
}
