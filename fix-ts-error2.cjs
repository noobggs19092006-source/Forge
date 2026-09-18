const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const oldFix = `
    // Post-processing: generic missing imports auto-fixer for 7B models
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
      const missing = [];
      const c = validation.data.content;
      if (c.includes('useEffect(') && !c.includes('useEffect}')) missing.push('import { useEffect } from "react";');
      if (c.includes('useRef(') && !c.includes('useRef}')) missing.push('import { useRef } from "react";');
      if (c.includes('useState(') && !c.includes('useState}')) missing.push('import { useState } from "react";');
      if (c.includes('gsap.') && !c.match(/import\\s+gsap/)) missing.push('import gsap from "gsap";');
      
      if (missing.length > 0) {
        // Insert missing imports directly after the first import or use client directive
        const lines = validation.data.content.split('\\n');
        let insertIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('import ')) {
            insertIdx = i + 1;
          }
        }
        lines.splice(insertIdx, 0, ...missing);
        validation.data.content = lines.join('\\n');
      }
    }
`;

const newFix = `
    // Post-processing: generic missing imports auto-fixer for 7B models
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
      const missing = [];
      const c = validation.data.content;
      if (c.includes('useEffect(') && !c.includes('useEffect}')) missing.push('import { useEffect } from "react";');
      if (c.includes('useRef(') && !c.includes('useRef}')) missing.push('import { useRef } from "react";');
      if (c.includes('useState(') && !c.includes('useState}')) missing.push('import { useState } from "react";');
      if (c.includes('gsap.') && !c.match(/import\\s+gsap/)) missing.push('import gsap from "gsap";');
      
      if (missing.length > 0) {
        // Insert missing imports directly after the first import or use client directive
        const lines = validation.data!.content!.split('\\n');
        let insertIdx = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith('import ')) {
            insertIdx = i + 1;
          }
        }
        lines.splice(insertIdx, 0, ...missing);
        validation.data!.content = lines.join('\\n');
      }
    }
`;

content = content.replace(oldFix, newFix);
fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixed TS error again!');
