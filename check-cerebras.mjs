const apiKey = process.env.CEREBRAS_API_KEY;

const response = await fetch('https://api.cerebras.ai/v1/models', {
  headers: { 'Authorization': `Bearer ${apiKey}` },
});

const data = await response.json();
console.log('Cerebras models:');
data.data.forEach(m => console.log(`  - ${m.id}`));