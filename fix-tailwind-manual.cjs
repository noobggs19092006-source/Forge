const fs = require('fs');
let content = fs.readFileSync('regression-output/simple-portfolio/tailwind.config.ts', 'utf8');

content = content.replace(
  "import { defineConfig } from 'tailwindcss'\n\nexport default defineConfig({",
  "import type { Config } from 'tailwindcss';\n\nconst config: Config = {"
);

// also we need to add export default config; at the end if it's missing, but it currently has }); at the end
content = content.replace(
  "});\n",
  "};\nexport default config;\n"
);
// just in case it doesn't have a trailing newline
content = content.replace(
  /}\)?$/,
  "};\nexport default config;\n"
);
content = content.replace(
  /}\);\s*$/,
  "};\nexport default config;\n"
);


fs.writeFileSync('regression-output/simple-portfolio/tailwind.config.ts', content);
console.log('Fixed tailwind.config.ts manually!');
