const ts = require('typescript');
const code = `const fileSpec = { path: "test.ts" }; throw new Error(\`Could not parse JSON for \${fileSpec.path} from response\`);`;
const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
console.log('Parse successful');