import { OllamaAdapter } from './core/dist/providers/adapters/ollama.js';
import { GroqAdapter } from './core/dist/providers/adapters/groq.js';
import { CerebrasAdapter } from './core/dist/providers/adapters/cerebras.js';
import { NvidiaNimAdapter } from './core/dist/providers/adapters/nvidia-nim.js';

const providers = [
  { name: 'Ollama', adapter: new OllamaAdapter('', 'qwen2.5-coder:7b'), model: 'qwen2.5-coder:7b' },
  { name: 'Groq', adapter: new GroqAdapter(process.env.GROQ_API_KEY ?? '', 'openai/gpt-oss-120b'), model: 'openai/gpt-oss-120b' },
  { name: 'Cerebras', adapter: new CerebrasAdapter(process.env.CEREBRAS_API_KEY ?? '', 'gpt-oss-120b'), model: 'gpt-oss-120b' },
  { name: 'NVIDIA NIM', adapter: new NvidiaNimAdapter(process.env.NVIDIA_API_KEY ?? '', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'), model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' },
];

async function testProvider(provider) {
  console.log(`\n=== Testing ${provider.name} (${provider.model}) ===`);
  try {
    const result = await provider.adapter.complete({
      model: provider.model,
      systemPrompt: 'You are a senior frontend engineer. Return ONLY valid JSON.',
      messages: [{ role: 'user', content: 'Return JSON: {"test": "hello"}' }],
      temperature: 0.3,
      maxTokens: 100,
    });
    console.log('Success:', result.structured ? 'JSON parsed' : 'Raw text');
    console.log('Content preview:', result.content.slice(0, 100));
    return { provider: provider.name, success: true, content: result.content };
  } catch (error) {
    console.log('Error:', error.message);
    return { provider: provider.name, success: false, error: error.message };
  }
}

async function runTests() {
  for (const provider of providers) {
    await testProvider(provider);
  }
}

runTests().catch(console.error);