const fs = require('fs');
let content = fs.readFileSync('core/agents/codegen/codegen-agent.ts', 'utf8');

const targetStr = "'- ALWAYS include ALL imports used in the file! If you use lenis, you MUST import it!\\n' +";
const replacementStr = targetStr + "\n             '- For React hooks (useEffect, useRef, useState), ALWAYS import them explicitly: import React, { useEffect, useRef, useState } from \\'react\\';\\n' +";

if (content.includes(targetStr)) {
  content = content.replace(targetStr, replacementStr);
  fs.writeFileSync('core/agents/codegen/codegen-agent.ts', content);
  console.log('Injected React hooks import rule successfully!');
} else {
  console.log('Could not find anchor string!');
}
