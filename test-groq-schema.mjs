const apiKey = process.env.GROQ_API_KEY;

const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-oss-120b',
    messages: [
      { role: 'system', content: 'You are an architect. Output valid JSON matching the schema.' },
      { role: 'user', content: 'Generate a sitemap for a minimal portfolio site with hero section.' }
    ],
    temperature: 0.3,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'sitemap',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            pages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  purpose: { type: 'string' },
                  sections: { type: 'array', items: { type: 'object' } },
                  priority: { type: 'string' }
                },
                required: ['path', 'purpose', 'sections', 'priority']
              }
            },
            sharedLayout: {
              type: 'object',
              properties: {
                navType: { type: 'string' },
                footerType: { type: 'string' },
                persistentElements: { type: 'array', items: { type: 'string' } }
              },
              required: ['navType', 'footerType', 'persistentElements']
            },
            routingNotes: { type: 'string' }
          },
          required: ['pages', 'sharedLayout', 'routingNotes']
        }
      }
    }
  }),
});

const data = await response.json();
console.log('Status:', response.status);
console.log('Response:', JSON.stringify(data, null, 2));