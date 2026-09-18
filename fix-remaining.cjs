const fs = require('fs');

function fixFile(file) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace("import { useEffect } from \"react\";\n", "");
    content = content.replace("import gsap from \"gsap\";\n", "");
    content = content.replace("import { useRef } from \"react\";\n", "");
    content = content.replace("import { useState } from \"react\";\n", "");
    fs.writeFileSync(file, content);
    console.log(`Fixed ${file} manually!`);
  }
}

fixFile('regression-output/simple-portfolio/components/Contact.tsx');
fixFile('regression-output/simple-portfolio/components/Hero.tsx');
