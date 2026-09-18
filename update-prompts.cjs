const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const t1 = `Requirements for this specific file:
- Follow the design tokens, motion plan, and sitemap EXACTLY
- Import from already-generated dependencies where applicable
- Output complete, runnable code -- no placeholders, no TODOs
  - NEVER append CSS or unrelated file contents to a .tsx file. Output ONLY the code for the requested file.
  - NEVER import framer-motion. The project uses GSAP exclusively for all animations.
- Include all necessary imports`;

const r1 = `Requirements for this specific file:
- Follow the design tokens, motion plan, and sitemap EXACTLY
- Import from already-generated dependencies where applicable
- Output complete, runnable code -- no placeholders, no TODOs
  - NEVER append CSS or unrelated file contents to a .tsx file. Output ONLY the code for the requested file.
  - NEVER import framer-motion. The project uses GSAP exclusively for all animations.
  - When using CSS Modules with dashed class names (kebab-case), you MUST use bracket notation (e.g. className={styles['my-dashed-class']}). NEVER use dot notation (e.g. styles.my-dashed-class is an invalid subtraction in TypeScript).
- Include all necessary imports`;

const t2 = `'SPECIFIC TAILWIND.CONFIG.TS REQUIREMENTS:',
        '- MUST use a SINGLE string for font sizes, do NOT use arrays with min/max/clamp. (e.g. \\'xs\\': \\'var(--clamp-xs)\\')',`;

const r2 = `'SPECIFIC TAILWIND.CONFIG.TS REQUIREMENTS:',
        '- MUST include the content array with exact globs: content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],',
        '- MUST use a SINGLE string for font sizes, do NOT use arrays with min/max/clamp. (e.g. \\'xs\\': \\'var(--clamp-xs)\\')',`;

content = content.replace(t1, r1);
content = content.replace(t2, r2);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixed codegen-agent.ts prompts!');
