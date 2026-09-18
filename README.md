# Forge 🛠️✨

**Motion-first autonomous frontend generation.**

Forge is an AI agent pipeline that goes from a single text prompt to a fully styled, motion-rich, production-ready Next.js / React codebase. Out of the box, Forge generates robust code featuring GSAP for animations and Lenis for smooth scrolling, all orchestrated by a powerful local CLI.

## Key Features

🚀 **Global CLI (`forge generate`)**
Forge acts as a native tool on your system. Run `forge generate "<prompt>"` from anywhere to kickstart the generation pipeline and let the agent architect your application automatically.

⚡ **Blazing Fast Inference (M9 Optimizations)**
We've integrated **Groq** and **Cerebras** as routing targets. By swapping out sluggish models for lightning-fast inference on codegen and QA-gate passes, Forge severely cuts down on wall-clock time without sacrificing quality.

🛡️ **Checkpoint-and-Isolate Architecture**
Building reliable AI systems that write complex code is hard. Long-running, 4-hour pipelines shouldn't crash because the LLM hallucinated a single config file.
- **Granular Checkpointing**: Forge persists state dynamically in a `.forge/checkpoint.json` manifest.
- **Fault Tolerance**: If a file fails to generate, the error is isolated, logged, and the rest of the generation continues in parallel.
- **Resilience**: If the pipeline stops, it resumes exactly where it left off, bypassing previously successful files and saving thousands of tokens.

🎨 **CSS Modules Styling**
Forge is smart enough to generate component-scoped CSS. Every section component generates with a paired `.module.css` file mapped perfectly to your app's global design tokens, banishing ugly inline-styles and bloated `styled-jsx` tags.

## Usage

```bash
# Link the CLI globally (if you haven't already)
cd cli
npm link

# Run a generation pass from your prompt
forge generate "SaaS landing page for an AI writing tool, playful and modern"
```

## Environment Variables

Forge requires the following environment variables to route inference tasks:

- `GEMINI_API_KEY`: Google Gemini API key (for primary instruction and reasoning).
- `OPENROUTER_API_KEY`: Used as a fallback or primary for heavy cloud models.
- `GROQ_API_KEY`: Groq API key for high-speed token generation on versatile models.
- `CEREBRAS_API_KEY`: Cerebras API key for maximum token throughput.
- `OLLAMA_BASE_URL`: (Optional) Ollama server URL (defaults to `http://localhost:11434`) for local models.

## How it works

1. **Architect Stage**: The prompt is processed and a site map, design tokens, and motion plan are generated.
2. **Codegen Stage**: The system parallelizes the generation of the codebase across the router, securely writing each file and logging success in the checkpoint file.
3. **QA-Gate**: Independent passes run over the code to correct issues on the fly before finalizing the codebase.
