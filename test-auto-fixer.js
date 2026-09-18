const c = `import React from 'react';
import useReducedMotion from '../hooks/useReducedMotion';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import styles from './About.module.css';

interface Props {
  id?: string;
}

const About: React.FC<Props> = ({ id = 'about' }) => {
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!reducedMotion) {
      const tl = gsap.timeline({ scrollTrigger: { trigger: \`#${id}\`, start: 'top center', end: 'bottom center', scrub: true } });
      tl.from(\`#${id}__title\`, { x: -100, opacity: 0, duration: 0.6, ease: 'power3.out' });
    }
  }, [reducedMotion, id]);

  return (
    <section id={id} className={styles.aboutSection}>
      <h2 id={\`${id}__title\`} className={styles.aboutTitle}>About Us</h2>
    </section>
  );
};

export default About;`;

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
