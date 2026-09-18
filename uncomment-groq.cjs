const fs = require('fs');
let content = fs.readFileSync('.env', 'utf8');

content = content.replace(/#GROQ_API_KEY/g, 'GROQ_API_KEY');

fs.writeFileSync('.env', content);
console.log('Uncommented Groq API Key!');
