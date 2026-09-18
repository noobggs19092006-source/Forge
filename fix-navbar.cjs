const fs = require('fs');
const file = 'regression-output/simple-portfolio/components/Navbar.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace("lenis.scrollTo(0, { duration: 0.6, easing: 'power3.out' });", "lenis.scrollTo(0, { duration: 0.6 });");

fs.writeFileSync(file, content);
console.log('Fixed Navbar.tsx manually!');
