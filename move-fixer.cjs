const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const badInjection = `    // Post-processing: generic missing imports auto-fixer for 7B models
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
          if (lines[i]?.startsWith('import ')) {
            insertIdx = i + 1;
          }
        }
        lines.splice(insertIdx, 0, ...missing);
        validation.data!.content = lines.join('\\n');
      }
    }`;

// Remove from generateConfigBatch
content = content.replace(badInjection, '');

// Now inject into generateSingleFile just before `return validation.data;`
// To be safe, we'll replace the LAST occurrence of `return validation.data;`
const parts = content.split('return validation.data;');
if (parts.length >= 2) {
    // Rejoin all but the last part with the delimiter
    const beforeLast = parts.slice(0, -1).join('return validation.data;');
    const afterLast = parts[parts.length - 1];
    
    content = beforeLast + badInjection + '\n    return validation.data;' + afterLast;
    fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
    console.log('Successfully moved auto-fixer to generateSingleFile!');
} else {
    console.log('Could not find return validation.data;');
}
