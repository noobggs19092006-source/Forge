# Next.js Base Template

> **Status**: Placeholder for M2+

This directory will contain a minimal Next.js App Router + TypeScript strict starter template used by Forge when scaffolding new projects.

## Planned contents (M2)

- `app/` — App Router layout + page structure
- `public/` — static assets
- `tailwind.config.ts` — generated from design tokens
- `tsconfig.json` — strict mode
- `next.config.ts` — optimized defaults
- `package.json` — with GSAP, Lenis, R3F, drei as optional deps

## Design principles

- Zero default styling — all styles come from design tokens generated per project
- Route-level code splitting for heavy libs (Three.js, GSAP)
- `next/font` for font loading with size-adjust fallbacks
- `next/image` for all images with explicit dimensions
