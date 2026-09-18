import { GroqAdapter } from './core/dist/providers/adapters/groq.js';
import { z } from 'zod';

const apiKey = process.env.GROQ_API_KEY;
const adapter = new GroqAdapter(apiKey, 'openai/gpt-oss-120b');

// Schema with all fields explicitly required
const schema = z.object({
  path: z.string(),
  content: z.string(),
  dependencies: z.record(z.string(), z.string())
}).strict();

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
  responseSchema: z.object({
    path: z.string(),
    content: z.string(),
    dependencies: z.record(z.string(), z.string())
  }),
  temperature: 0.3,
});

console.log('Raw content:', result.content);
console.log('Parsed structured:', JSON.stringify(result.structured, null, 2));