const fs = require('fs');
const file = 'regression-output/simple-portfolio/components/Gallery.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("const [isReducedMotion] = useReducedMotion();", "const isReducedMotion = useReducedMotion();");

fs.writeFileSync(file, content);
console.log('Fixed Gallery.tsx manually!');
