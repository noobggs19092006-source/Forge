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
`;

const newFix = `
    // Post-processing: generic missing imports auto-fixer for 7B models
    if (validation.data && validation.data.content && fileSpec.path.startsWith('components/')) {
      const missing = [];
      const c = validation.data.content;
      if (c.includes('useEffect(') && !c.match(/useEffect.*from\\s+['"]react['"]/)) missing.push('import { useEffect } from "react";');
      if (c.includes('useRef(') && !c.match(/useRef.*from\\s+['"]react['"]/)) missing.push('import { useRef } from "react";');
      if (c.includes('useState(') && !c.match(/useState.*from\\s+['"]react['"]/)) missing.push('import { useState } from "react";');
      if (c.includes('gsap.') && !c.match(/import\\s+gsap/)) missing.push('import gsap from "gsap";');
`;

content = content.replace(oldFix, newFix);
fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixed regex in auto-fixer!');
