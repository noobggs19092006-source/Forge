import { GroqAdapter } from './core/dist/providers/adapters/groq.js';
import { z } from 'zod';

const apiKey = process.env.GROQ_API_KEY;
const adapter = new GroqAdapter(apiKey, 'openai/gpt-oss-120b');

const systemPrompt = `You are a senior frontend engineer generating production React/Next.js (App Router, TypeScript strict mode) code.`;

const userPrompt = `## Project: Minimal Portfolio Landing
A minimal portfolio landing page with a hero section, dark mode, clean typography
Mood: minimal, dark, clean

## Sitemap
{
  "pages": [
    {
      "path": "/",
      "purpose": "Home",
      "sections": [
        {
          "id": "hero",
          "purpose": "Introduce the portfolio and the creator",
          "contentType": "hero",
          "animationSafe": true
        }
      ],
      "priority": "high"
    }
  ],
  "sharedLayout": {
    "navType": "none",
    "footerType": "none",
    "persistentElements": []
  },
  "routingNotes": ""
}

## TASK: Generate Single File
Generate ONLY the file: components/Hero.tsx
Type: section
Purpose: Hero section with headline and CTA

Requirements for this specific file:
- Follow the design tokens, motion plan, and sitemap EXACTLY
- Import from already-generated dependencies where applicable
- Output complete, runnable code — no placeholders, no TODOs
- Include all necessary imports
- Use the shared LenisProvider and GSAP config from lib/lenis-provider.tsx and lib/gsap-config.ts
- For section components: implement the exact choreography from the motion plan for that section ID

## OUTPUT FORMAT (CRITICAL - follow EXACTLY)
You MUST output a JSON object with EXACTLY these three fields:
{
  "path": "components/Hero.tsx",
  "content": "<complete file content as a string with escaped newlines>",
  "dependencies": { "<package-name>": "<version>" }
}

- The "path" field MUST be exactly "components/Hero.tsx"
- The "content" field MUST contain the complete file content as a single string (escape newlines as \\n, escape quotes as \\")
- The "dependencies" field MUST be an object mapping npm package names to version strings (empty object {} if none)
- Do NOT output a JSON object with the file path as the key
- Do NOT include any additional fields
- Do NOT wrap in markdown code fences
- Do NOT include any explanatory text

Output valid JSON matching the SingleFileOutput schema ONLY.`;

async function test() {
  const schema = z.object({
    path: z.string(),
    content: z.string(),
    dependencies: z.record(z.string(), z.string()).default({})
  }).strict();

  const adapter = new (await import('./core/dist/providers/adapters/groq.js')).GroqAdapter(process.env.GROQ_API_KEY ?? '', 'openai/gpt-oss-120b');

  const result = await adapter.complete({
    model: 'openai/gpt-oss-120b',
    systemPrompt: `You are a senior frontend engineer generating production React/Next.js (App Router, TypeScript strict mode) code.`,
    messages: [{ role: 'user', content: `## Project: Minimal Portfolio Landing
A minimal portfolio landing page with a hero section, dark mode, clean typography
Mood: minimal, dark, clean

## Sitemap
{
  "pages": [
    {
      "path": "/",
      "purpose": "Home",
      "sections": [
        {
          "id": "hero",
          "purpose": "Introduce the portfolio and the creator",
          "contentType": "hero",
          "animationSafe": true
        }
      ],
      "priority": "high"
    }
  ],
  "sharedLayout": {
    "navType": "none",
    "footerType": "none",
    "persistentElements": []
  },
  "routingNotes": ""
}

## TASK: Generate Single File
Generate ONLY the file: components/Hero.tsx
Type: section
Purpose: Hero section with headline and CTA

Requirements for this specific file:
- Follow the design tokens, motion plan, and sitemap EXACTLY
- Import from already-generated dependencies where applicable
- Output complete, runnable code — no placeholders, no TODOs
- Include all necessary imports
- Use the shared LenisProvider and GSAP config from lib/lenis-provider.tsx and lib/gsap-config.ts
- For section components: implement the exact choreography from the motion plan for that section ID

## OUTPUT FORMAT (CRITICAL - follow EXACTLY)
You MUST output a JSON object with EXACTLY these three fields:
{
  "path": "components/Hero.tsx",
  "content": "<complete file content as a string with escaped newlines>",
  "dependencies": { "<package-name>": "<version>" }
}

- The "path" field MUST be exactly "components/Hero.tsx"
- The "content" field MUST contain the complete file content as a single string (escape newlines as \\n, escape quotes as \\")
- The "dependencies" field MUST be an object mapping npm package names to version strings (empty object {} if none)
- Do NOT output a JSON object with the file path as the key
- Do NOT include any additional fields
- Do NOT wrap in markdown code fences
- Do NOT include any explanatory text

Output valid JSON matching the SingleFileOutput schema ONLY.` }],
    responseSchema: schema,
    temperature: 0.3,
  });
  
  console.log('Raw content:');
  console.log(result.content);
  console.log('\nParsed structured:');
  console.log(JSON.stringify(result.structured, null, 2));
  
  if (result.structured) {
    console.log('\nContent field type:', typeof result.structured.content);
    console.log('Content preview:', result.structured.content.slice(0, 100));
    console.log('Content starts with quote:', result.structured.content.startsWith('"'));
    console.log('Content ends with quote:', result.structured.content.endsWith('"'));
    console.log('Content char codes start:', Array.from(result.structured.content.slice(0, 20)).map(c => c.charCodeAt(0).toString(16)));
  }
}

test().catch(e => console.error(e.message));