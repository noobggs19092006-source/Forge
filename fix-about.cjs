const fs = require('fs');
let content = fs.readFileSync('regression-output/simple-portfolio/components/About.tsx', 'utf8');

if (!content.includes('import { useEffect }')) {
  content = content.replace("import React from 'react';", "import React, { useEffect } from 'react';\nimport gsap from 'gsap';");
  fs.writeFileSync('regression-output/simple-portfolio/components/About.tsx', content);
  console.log('Fixed About.tsx manually!');
}
