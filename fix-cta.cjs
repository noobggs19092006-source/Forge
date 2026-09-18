const fs = require('fs');
let content = fs.readFileSync('regression-output/simple-portfolio/components/Cta.tsx', 'utf8');

content = content.replace("import { useEffect } from \"react\";\n", "");
content = content.replace("import gsap from \"gsap\";\n", "");

fs.writeFileSync('regression-output/simple-portfolio/components/Cta.tsx', content);
console.log('Fixed Cta.tsx manually!');
