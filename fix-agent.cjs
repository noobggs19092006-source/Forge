const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// 1. CSS Append fix
content = content.replace(
  "- Output complete, runnable code -- no placeholders, no TODOs",
  "- Output complete, runnable code -- no placeholders, no TODOs\n  - NEVER append CSS or unrelated file contents to a .tsx file. Output ONLY the code for the requested file."
);
content = content.replace(
  "Use CSS Modules: import styles from './Contact.module.css' (create separate CSS file)",
  "Use CSS Modules: import styles from './Contact.module.css' (DO NOT include the CSS content in this file, ONLY write the TSX code)"
);

// 2. useLenis path fix
content = content.replace(
  "import { useLenis } from '../lib/lenis-provider'",
  "import { useLenis } from '../hooks/useLenis'"
);
content = content.replace(
  "import { useLenis } from '../lib/lenis-provider'",
  "import { useLenis } from '../hooks/useLenis'"
);

// 3. useReducedMotion explicit type fix
content = content.replace(
  "Use matchMedia('(prefers-reduced-motion: reduce)') internally",
  "Use matchMedia('(prefers-reduced-motion: reduce)') internally\n  - MUST explicitly type the event parameter in the change listener: (event: MediaQueryListEvent) => void"
);

// 4. Section Component Relative Path Fix
content = content.replace(
  "- Do NOT use inline styles, styled-jsx, or <style jsx> tags\\n' +",
  "- Do NOT use inline styles, styled-jsx, or <style jsx> tags\\n' +\n             '- IMPORTANT: For all imports from lib or hooks directories, use ONE level up relative path (e.g. \\'../lib/lenis-provider\\' or \\'../hooks/useReducedMotion\\' or \\'../lib/gsap-config\\'). Do NOT use \\'../../\\'.\\n' +"
);

// 5. Layout Component fix for hallucinated imports
content = content.replace(
  "- TYPE the children prop: children: React.ReactNode (NOT implicit any)",
  "- TYPE the children prop: children: React.ReactNode (NOT implicit any)\n  - DO NOT import any non-existent hooks or utilities like 'use-client-effect'. Only import what is strictly required."
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
