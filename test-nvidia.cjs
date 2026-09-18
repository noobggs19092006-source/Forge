const apiKey = process.env.NVIDIA_API_KEY;

async function testNvidia() {
  console.log('Testing Nvidia...');
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta/llama3-70b-instruct',
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

testNvidia();
