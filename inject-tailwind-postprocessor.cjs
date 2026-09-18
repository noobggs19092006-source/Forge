const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const tailwindFix = `
              if (fileOutput.path === 'tailwind.config.ts' && fileOutput.content) {
                fileOutput.content = fileOutput.content.replace(
                  /import\\s*\\{\\s*defineConfig\\s*\\}\\s*from\\s*['"]tailwindcss['"]\\s*;?\\s*export\\s*default\\s*defineConfig\\s*\\(/g,
                  "import type { Config } from 'tailwindcss';\\n\\nconst config: Config = {"
                ).replace(
                  /export\\s*default\\s*defineConfig\\s*\\(/g,
                  "const config: Config = {"
                );
                if (fileOutput.content.includes('const config: Config = {')) {
                  fileOutput.content = fileOutput.content.replace(/}\\)?;?\\s*$/, "};\\nexport default config;\\n");
                }
              }
`;

const tailwindFixSingle = `
    if (fileSpec.path === 'tailwind.config.ts' && validation.data.content) {
      validation.data.content = validation.data.content.replace(
        /import\\s*\\{\\s*defineConfig\\s*\\}\\s*from\\s*['"]tailwindcss['"]\\s*;?\\s*export\\s*default\\s*defineConfig\\s*\\(/g,
        "import type { Config } from 'tailwindcss';\\n\\nconst config: Config = {"
      ).replace(
        /export\\s*default\\s*defineConfig\\s*\\(/g,
        "const config: Config = {"
      );
      if (validation.data.content.includes('const config: Config = {')) {
        validation.data.content = validation.data.content.replace(/}\\)?;?\\s*$/, "};\\nexport default config;\\n");
      }
    }
`;

content = content.replace(
  "              if (fileOutput.path === 'next.config.js' && fileOutput.content) {",
  tailwindFix + "\n              if (fileOutput.path === 'next.config.js' && fileOutput.content) {"
);

content = content.replace(
  "    if (fileSpec.path === 'next.config.js' && validation.data.content) {",
  tailwindFixSingle + "\n    if (fileSpec.path === 'next.config.js' && validation.data.content) {"
);

fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
console.log('Injected tailwind post-processor successfully!');
