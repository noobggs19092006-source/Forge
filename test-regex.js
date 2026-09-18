const regex = /^\s*(?:\/\*|\/\/)?\s*["']?use client["']?[\s;\*\/]*\n/m;
const tests = [
  "// 'use client';\n",
  "//\"use client\"\n",
  "//  use client;\n",
  "/* use client */\n",
  "\"use client\";\n",
];
for (const t of tests) {
  console.log('Test: ' + JSON.stringify(t) + ' -> Matches: ' + regex.test(t));
}
