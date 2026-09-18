const apiKey = process.env.CEREBRAS_API_KEY;

async function testCerebras() {
  console.log('Testing Cerebras...');
  try {
    const res = await fetch('https://api.cerebras.ai/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey
      },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!res.ok) {
      console.error('Failed:', await res.text());
      return;
    }
    const data = await res.json();
    console.log('Success:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testCerebras();
