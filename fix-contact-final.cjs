const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

// 1. Remove the bad globals.css and LenisProvider instructions from Contact.tsx
content = content.replace(
  /  - Import globals\.css as: import '\.\.\/app\/globals\.css'\r?\n/,
  ""
);
content = content.replace(
  /  - Import LenisProvider from '\.\.\/lib\/lenis-provider'\r?\n/,
  ""
);

// 2. Add rule against dot notation for kebab-case CSS module classes
content = content.replace(
  "- Do NOT use styled-jsx or <style jsx> - use CSS Modules instead",
  "- Do NOT use styled-jsx or <style jsx> - use CSS Modules instead\n  - IMPORTANT: NEVER use dot notation for kebab-case CSS classes (e.g., styles.contact-form is INVALID). Always use bracket notation for kebab-case class names: styles['contact-form']"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Fixes applied successfully!');
