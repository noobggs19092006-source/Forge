const fs = require('fs');
const file = 'regression-output/simple-portfolio/components/Portfolio.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("import { useEffect } from \"react\";\n", "");
content = content.replace("import gsap from \"gsap\";\n", "");

fs.writeFileSync(file, content);
console.log('Fixed Portfolio.tsx manually!');
