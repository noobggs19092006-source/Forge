const apiKey = process.env.GROQ_API_KEY;

const response = await fetch('https://api.groq.com/openai/v1/models', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
});

const data = await response.json();
console.log('Groq models:');
data.data.forEach(m => console.log(`  - ${m.id}`));