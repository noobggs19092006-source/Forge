const apiKey = process.env.OPENROUTER_API_KEY;

async function testOpenRouter() {
  console.log('Testing OpenRouter...');
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: 'Hello' }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (!res.ok) {
      console.error('Failed:', await res.text());
      return;
    }
    const data = await res.json();
    console.log('Success:', data.choices[0].message.content);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testOpenRouter();
