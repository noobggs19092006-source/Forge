const c = "import React from 'react';\nimport useReducedMotion from '../hooks/useReducedMotion';\nimport { ScrollTrigger } from 'gsap/ScrollTrigger';\nimport styles from './About.module.css';\n\ninterface Props {\n  id?: string;\n}\n\nconst About: React.FC<Props> = ({ id = 'about' }) => {\n  const reducedMotion = useReducedMotion();\n\n  useEffect(() => {\n    if (!reducedMotion) {\n      const tl = gsap.timeline({ scrollTrigger: { trigger: `#test`, start: 'top center', end: 'bottom center', scrub: true } });\n      tl.from(`#test__title`, { x: -100, opacity: 0, duration: 0.6, ease: 'power3.out' });\n    }\n  }, [reducedMotion, id]);\n\n  return (\n    <section id={id} className={styles.aboutSection}>\n      <h2 id={`test__title`} className={styles.aboutTitle}>About Us</h2>\n    </section>\n  );\n};\n\nexport default About;";

let validation = { data: { content: c } };
let fileSpec = { path: 'components/About.tsx' };

if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
    const missing = [];
    const content = validation.data.content;
    if (content.includes('useEffect(') && !content.includes('useEffect}')) missing.push('import { useEffect } from "react";');
    if (content.includes('useRef(') && !content.includes('useRef}')) missing.push('import { useRef } from "react";');
    if (content.includes('useState(') && !content.includes('useState}')) missing.push('import { useState } from "react";');
    if (content.includes('gsap.') && !content.match(/import\s+gsap/)) missing.push('import gsap from "gsap";');
    
    console.log("Missing:", missing);
    
    if (missing.length > 0) {
        const lines = validation.data.content.split('\n');
        let insertIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i]?.startsWith('import ')) {
                insertIdx = i + 1;
            }
        }
        lines.splice(insertIdx, 0, ...missing);
        validation.data.content = lines.join('\n');
    }
}
console.log("Result:\n" + validation.data.content);
