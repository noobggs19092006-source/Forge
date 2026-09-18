import { NvidiaNimAdapter } from './core/dist/providers/adapters/nvidia-nim.js';

const apiKey = process.env.NVIDIA_API_KEY;
const adapter = new NvidiaNimAdapter(apiKey, 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning');

const systemPrompt = `You are a senior frontend engineer generating production React/Next.js (App Router, TypeScript strict mode) code.`;

const userPrompt = `Generate the app/layout.tsx file for a minimal portfolio Next.js 15 project.

Requirements:
- Root layout with LenisProvider wrapping children
- Import LenisProvider from '@/lib/lenis-provider'
- Import heroTimelineConfig from '@/lib/gsap-config'
- Use design tokens: Libre Baskerville for display, Source Sans Pro for text
- Dark mode by default (data-theme="dark" on html)
- Global CSS variables for colors, spacing, typography
- No Navbar or Footer (sharedLayout.navType="none", footerType="none")

Output ONLY valid JSON with this exact structure:
{
  "path": "app/layout.tsx",
  "content": "<complete file content as string with \\n for newlines>",
  "dependencies": {}
}`;

async function test() {
  console.log('Calling NIM adapter for app/layout.tsx...');
  
  const result = await adapter.complete({
    model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.3,
  });

  console.log('Raw content:');
  console.log(result.content);
  console.log('\nParsed structured:');
  console.log(JSON.stringify(result.structured, null, 2));
  
  try {
    const parsed = JSON.parse(result.content);
    console.log('\nParsed content:');
    console.log('Path:', parsed.path);
    console.log('Content length:', parsed.content?.length);
    console.log('Dependencies:', parsed.dependencies);
  } catch (e) {
    console.log('\nFailed to parse content as JSON:', e.message);
  }
}

test().catch(console.error);