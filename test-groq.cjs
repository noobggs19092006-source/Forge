const apiKey = process.env.GROQ_API_KEY;

async function testGroq() {
  console.log('Testing Groq...');
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
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

testGroq();
