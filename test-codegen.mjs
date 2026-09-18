import { OllamaAdapter } from './core/dist/providers/adapters/ollama.js';
import { GroqAdapter } from './core/dist/providers/adapters/groq.js';
import { NvidiaNimAdapter } from './core/dist/providers/adapters/nvidia-nim.js';
import { CodegenAgent } from './core/dist/agents/codegen/codegen-agent.js';

const testInput = {
  designTokens: {
    typography: {
      displayFont: { family: "Libre Baskerville", weights: [400, 700], source: "google-fonts" },
      textFont: { family: "Source Sans Pro", weights: [400, 500], source: "google-fonts" },
      justification: "Test",
      typeScale: [
        { name: "xs", minSize: "0.75rem", maxSize: "0.875rem", clampFormula: "clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem)", lineHeight: 1.5 },
        { name: "sm", minSize: "0.875rem", maxSize: "1rem", clampFormula: "clamp(0.875rem, 0.8rem + 0.5vw, 1rem)", lineHeight: 1.5 },
        { name: "base", minSize: "1rem", maxSize: "1.125rem", clampFormula: "clamp(1rem, 0.95rem + 0.5vw, 1.125rem)", lineHeight: 1.5 },
        { name: "lg", minSize: "1.25rem", maxSize: "1.5rem", clampFormula: "clamp(1.25rem, 1.2rem + 0.75vw, 1.5rem)", lineHeight: 1.5 },
        { name: "xl", minSize: "1.5rem", maxSize: "2rem", clampFormula: "clamp(1.5rem, 1.4rem + 1vw, 2rem)", lineHeight: 1.5 },
        { name: "2xl", minSize: "2rem", maxSize: "2.5rem", clampFormula: "clamp(2rem, 1.9rem + 1.5vw, 2.5rem)", lineHeight: 1.5 },
        { name: "3xl", minSize: "2.5rem", maxSize: "3rem", clampFormula: "clamp(2.5rem, 2.4rem + 2vw, 3rem)", lineHeight: 1.5 },
        { name: "display", minSize: "3.5rem", maxSize: "4.5rem", clampFormula: "clamp(3.5rem, 3.2rem + 3vw, 4.5rem)", lineHeight: 1.4 }
      ]
    },
    colors: {
      tokens: [
        { name: "primary", light: "oklch(0.3 0.2 260)", dark: "oklch(0.75 0.15 260)" },
        { name: "surface", light: "oklch(0.15 0.05 260)", dark: "oklch(0.85 0.05 260)" },
        { name: "on-surface", light: "oklch(0.95 0 0)", dark: "oklch(0.1 0 0)" },
        { name: "accent", light: "oklch(0.35 0.4 35)", dark: "oklch(0.2 0.45 30)" },
      ],
      rationale: "Test"
    },
    spacing: {
      baseUnit: 8,
      scale: [
        { name: "xs", value: "0.25rem" },
        { name: "sm", value: "0.5rem" },
        { name: "md", value: "1rem" },
        { name: "lg", value: "2rem" },
        { name: "xl", value: "4rem" },
        { name: "2xl", value: "8rem" }
      ],
      gridColumns: 12,
      maxWidth: "80rem",
      gutterWidth: "1.5rem"
    },
    motionPersonality: {
      description: "Test",
      defaultEasing: "power3.out",
      defaultDuration: 0.6,
      staggerInterval: 0.08
    },
    designRationale: "Test"
  },
  motionPlan: {
    sections: [
      { sectionId: "hero", trigger: "load", technique: "gsap-timeline", choreography: "Title slides in", justification: "First impression", reducedMotionFallback: "Visible", performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: "minimal" } },
      { sectionId: "features", trigger: "scroll-enter", technique: "gsap-scrolltrigger", choreography: "Cards fade up", justification: "Showcase features", reducedMotionFallback: "Visible", performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: "minimal" } },
      { sectionId: "contact", trigger: "scroll-enter", technique: "gsap-scrolltrigger", choreography: "Form slides up", justification: "Encourage action", reducedMotionFallback: "Visible", performanceBudget: { gpuIntensive: false, lazyMount: false, estimatedCost: "minimal" } }
    ],
    globalNotes: "",
    uses3D: false,
    usesLenis: false
  },
  sitemap: {
    pages: [{
      path: "/",
      purpose: "Portfolio landing",
      sections: [
        { id: "hero", purpose: "Introduce", contentType: "hero", animationSafe: true },
        { id: "features", purpose: "Showcase", contentType: "gallery", animationSafe: true },
        { id: "contact", purpose: "Contact", contentType: "contact", animationSafe: true }
      ],
      priority: "high"
    }],
    sharedLayout: { navType: "none", footerType: "none", persistentElements: [] },
    routingNotes: ""
  },
  brief: { name: "test-portfolio", description: "Minimal portfolio", mood: ["minimal", "dark", "clean"] }
};

const providers = [
  { name: 'Ollama (qwen2.5-coder:7b)', adapter: new (await import('./core/dist/providers/adapters/ollama.js')).OllamaAdapter('', 'qwen2.5-coder:7b'), model: 'qwen2.5-coder:7b' },
  { name: 'Groq (openai/gpt-oss-120b)', adapter: new (await import('./core/dist/providers/adapters/groq.js')).GroqAdapter(process.env.GROQ_API_KEY ?? '', 'openai/gpt-oss-120b'), model: 'openai/gpt-oss-120b' },
  { name: 'NVIDIA NIM (nemotron-3-nano)', adapter: new (await import('./core/dist/providers/adapters/nvidia-nim.js')).NvidiaNimAdapter(process.env.NVIDIA_API_KEY ?? '', 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'), model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' },
];

async function testProvider(provider) {
  console.log(`\n=== ${provider.name} ===`);
  const agent = new (await import('./core/dist/agents/codegen/codegen-agent.js')).CodegenAgent(provider.adapter, provider.model, {
    interRequestDelayMs: 2000,
    maxRetryPasses: 2,
  });
  
  const startTime = Date.now();
  
  try {
    const result = await agent.execute(testInput);
    const duration = Date.now() - startTime;
    
    if (result.status === 'success') {
      const fileCount = Object.keys(result.output.files).length;
      let syntaxErrors = 0;
      
      for (const [path, content] of Object.entries(result.output.files)) {
        if (path.endsWith('.ts') || path.endsWith('.tsx')) {
          try {
            require('typescript').transpileModule(content, {
              compilerOptions: { target: 99, module: 99, moduleResolution: 2, jsx: 4, strict: false, skipLibCheck: true }
            });
          } catch {
            syntaxErrors++;
            console.log(`  SYNTAX ERROR in ${path}`);
          }
        }
      }
      
      console.log(`${provider.name}: ${fileCount} files, ${syntaxErrors} syntax errors, ${duration}ms`);
      return { provider: provider.name, files: fileCount, syntaxErrors, duration, success: true };
    } else {
      console.log(`${provider.name}: FAILED - ${result.error?.message || 'Unknown'}`);
      return { provider: provider.name, success: false, error: result.error?.message };
    }
  } catch (error) {
    console.log(`${provider.name}: ERROR - ${error.message}`);
    return { provider: provider.name, success: false, error: error.message };
  }
}

async function runTests() {
  for (const provider of providers) {
    await testProvider(provider);
  }
}

runTests().catch(console.error);