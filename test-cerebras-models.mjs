const apiKey = process.env.CEREBRAS_API_KEY;

const models = ['gpt-oss-120b', 'qwen-3.8-27b', 'gemma-4-31b'];

for (const model of models) {
  const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Return JSON: {"message": "hello"}' },
        { role: 'user', content: 'Return JSON' }
      ],
      temperature: 0.3,
      max_tokens: 100,
    }),
  });

  const data = await response.json();
  console.log(`\n=== ${model} ===`);
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(data, null, 2));
}