const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// 1. CSS Append fix
content = content.replace(
  "- Output complete, runnable code -- no placeholders, no TODOs",
  "- Output complete, runnable code -- no placeholders, no TODOs\n  - NEVER append CSS or unrelated file contents to a .tsx file. Output ONLY the code for the requested file.\n  - NEVER import framer-motion. The project uses GSAP exclusively for all animations."
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
  "Use matchMedia('(prefers-reduced-motion: reduce)') internally\n  - DO NOT type the event parameter. Instead, use 'const handleChange = () => setReducedMotion(mediaQuery.matches);' to completely avoid TypeScript errors."
);

// 4. Section Component Relative Path Fix
content = content.replace(
  "- Do NOT use inline styles, styled-jsx, or <style jsx> tags\\n' +",
  "- Do NOT use inline styles, styled-jsx, or <style jsx> tags\\n' +\n             '- IMPORTANT: For all imports from lib or hooks directories, use ONE level up relative path (e.g. \\'../lib/lenis-provider\\' or \\'../hooks/useReducedMotion\\' or \\'../lib/gsap-config\\'). Do NOT use \\'../../\\'.\\n' +"
);

// 5. Layout Component fix for hallucinated imports and wrapping
content = content.replace(
  "- TYPE the children prop: children: React.ReactNode (NOT implicit any)",
  "- TYPE the children prop: children: React.ReactNode (NOT implicit any)\n  - DO NOT import any non-existent hooks or utilities like 'use-client-effect'. Only import what is strictly required.\n  - MUST export default function RootLayout({ children }: { children: React.ReactNode })"
);

content = content.replace(
  "- Wrap children with LenisProvider",
  "- Wrap children with LenisProvider (MUST be inside the <body> tag, do NOT wrap the <html> tag with LenisProvider)"
);


// 6. Page Component componentName hallucination
content = content.replace(
  "({ id: s.id, contentType: s.contentType })))",
  "({ id: s.id, contentType: s.contentType, componentName: s.id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('') })))"
);

content = content.replace(
  "- ONLY import and render section components that EXIST in the sitemap sections array",
  "- ONLY import and render section components that EXIST in the sitemap sections array (use the exact 'componentName' field provided below for the import path and component tag)"
);

// 7. GSAP-config fix
content = content.replace(
  "- Register ScrollTrigger plugin: gsap.registerPlugin(ScrollTrigger)",
  "- Register ScrollTrigger plugin: gsap.registerPlugin(ScrollTrigger)\n  - DO NOT USE ScrollTrigger.register(). It does not exist. Only use gsap.registerPlugin(ScrollTrigger)."
);

// 8. Lenis-provider fixes
content = content.replace(
  "- Export LenisContext with createContext<Lenis | null>(null)",
  "- MUST export LenisContext: export const LenisContext = createContext<Lenis | null>(null);"
);

content = content.replace(
  "- Apply gsap.defaultEase from design tokens",
  ""
);

// 9. useLenis.ts fix
content = content.replace(
  "- Throw error if used outside LenisProvider",
  "- IMPORTANT: If context is null, return null (DO NOT throw an error, because it will be null during server-side prerendering)."
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
