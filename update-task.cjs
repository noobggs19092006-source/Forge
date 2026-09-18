const fs = require('fs');
let content = fs.readFileSync('task.md', 'utf8');

content = content.replace("- `[/]` Execute Real Step 1 Pipeline", "- `[x]` Execute Real Step 1 Pipeline");

fs.writeFileSync('task.md', content);
