# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
yarn dev        # Start dev server (Astro)
yarn build      # Static build → dist/
yarn preview    # Preview built site locally
```

No test runner is configured. Validate manually: `yarn build` for build errors, `yarn dev` for runtime behavior.

## Tech Stack

- **Astro 5.5** (static output) + **Solid.js 1.9** (client islands) + **Three.js** (WebGL)
- **TypeScript** strict mode, JSX configured for Solid.js
- Pure scoped CSS — no Tailwind or CSS framework
- GLSL shaders imported as assets (`vite.assetsInclude: ['**/*.glsl']`)
- Content via Astro Content Collections (Markdown, Obsidian-compatible)
- Cloudflare R2 for remote content; falls back to local `src/content/` when R2 env vars are missing

## Architecture: Three-Layer Experience

The site is a personal academic homepage with a hidden depth layer. Core concept: "你要剥开我" — surface is professional, depths are private, only discoverable through exploration.

### Layer 0 — Entrance (`pages/index.astro`)
Particle animation morphing into "GAIVRT". Shorter for return visitors (detected via localStorage).

### Layer 1 — Surface (`pages/surface/`)
White academic theme. WebGL ripple effect (Three.js FBO ping-pong water simulation) reveals black underneath when mouse moves. After 30s, SVG cracks appear; clicking them transitions to Layer 2.

### Layer 2 — Depths (`pages/depths/`)
Black abyss with floating text fragments. Content progressively unlocks based on visit count (thresholds in `src/lib/constants.ts`). Core page (`depths/core.astro`) is the final endpoint.

### Key architectural boundaries
- **Layouts**: `BaseLayout` → `Layer1Layout` (white) or `Layer2Layout` (black)
- **Client islands**: Solid.js components use `client:only="solid-js"` (no SSR)
- **State**: localStorage only (`visitStore.ts`), no external state management
- **Transitions**: Astro `<ClientRouter />` for View Transitions between layers

## WebGL Pipeline

`RippleEffect.ts` manages the Three.js scene with dual FBO ping-pong:
1. `rippleSim.frag.glsl` — water wave equation, mouse energy injection, decay
2. `ripple.frag.glsl` — composite pass: height map → black overlay alpha
3. `ripple.vert.glsl` — fullscreen quad vertex shader

Canvas overlays with `position:fixed; pointer-events:none; z-index:10`. Mouse events captured at document level.

Performance monitor (`performanceMonitor.ts`) degrades gracefully: FPS < 30 → half resolution, FPS < 15 → CSS radial-gradient fallback.

## Content Pipeline

- Blog posts sourced from Obsidian vault (symlinked or copied to `src/content/blog/`)
- Custom remark plugins in `src/plugins/`: wikilinks (`[[link]]`), callouts (`> [!type]`), mark highlights, video embeds
- Rehype plugins: slug, autolink headings, KaTeX math
- `src/content/config.ts` defines Zod schemas for `blog` and `thoughts` collections

## Environment Variables

Defined in `.env` (see `.env.example`):
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — Cloudflare R2 access
- Accessed via `import.meta.env`
- `.npmrc` contains proxy config for network access

## Conventions

- Package manager: **yarn** (not npm)
- Styling: CSS variables defined in `src/styles/global.css` (surface vs depths color systems)
- Fonts: Inter (body), JetBrains Mono (code), Noto Serif SC (serif) — loaded from Google Fonts CDN
- All timing/threshold constants centralized in `src/lib/constants.ts`
- Solid.js components are `.tsx`, Astro components are `.astro`
