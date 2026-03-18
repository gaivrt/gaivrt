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

Personal academic homepage with hidden depth layers. Core concept: "你要剥开我" — surface is professional, depths are private, only discoverable through exploration. Unified warm color palette across all layers.

### Layer 0 — Entrance (`pages/index.astro`)
Canvas 2D particle animation forming "GAIVRT" with painting-inspired color palettes (Monet, Vermeer, Hokusai, Klimt, Yoshida). Particles have spring physics + mouse repulsion. Click anywhere to enter. Return visitors (>3 visits) skip directly to `/surface/`.

Engine: `src/lib/particles/ParticleText.ts` (config-driven, `src/lib/constants.ts` ENTRANCE block).
Component: `src/components/entrance/ParticleEntrance.tsx` (Solid.js island).

### Layer 1 — Surface (`pages/surface/`)
Warm paper editorial theme (#f5f0e8 background). Cormorant Garamond display font. SVG feTurbulence paper grain texture overlay. WebGL ripple produces warm golden glow on mouse movement (candlelight effect via `mix-blend-mode: soft-light`). After 30s, SVG cracks appear; clicking them transitions to Layer 2.

Homepage: centered hero with avatar + book-style TOC navigation (no navbar).
Subpages: minimal `← GAIVRT` back-link via `BackLink.astro` (no sticky nav).

### Layer 2 — Depths (`pages/depths/`)
Deep warm black (#0a0806) with floating text fragments. Content progressively unlocks based on visit count (thresholds in `src/lib/constants.ts`). Core page (`depths/core.astro`) is the final endpoint.

### Progressive Unlock System

Visit count (localStorage via `visitStore.ts`) drives content revelation. Thresholds in `constants.ts`:
- **3 visits**: extra text fragments appear on `/depths/`; entrance may reappear (25% chance)
- **5 visits**: all thoughts collection content unlocked
- **8 visits**: core link begins flickering on `/depths/`
- **10 visits**: full access to `/depths/core` (redirects otherwise)

InkBleed idle delay also scales with visits: >10 → 15s, >5 → 18s, default → 30s.

### Key architectural boundaries
- **Layouts**: `BaseLayout` → `Layer1Layout` (warm paper) or `Layer2Layout` (deep warm black)
- **Client islands**: Solid.js components use `client:only="solid-js"` (no SSR)
- **State**: localStorage only (`visitStore.ts`), no external state management
- **Transitions**: Astro `<ClientRouter />` for View Transitions between layers

## WebGL Pipeline (Ripple Effect)

`RippleEffect.ts` manages the Three.js scene with dual FBO ping-pong:
1. `rippleSim.frag.glsl` — water wave equation, mouse energy injection, decay
2. `ripple.frag.glsl` — composite pass: height map → warm golden glow (`soft-light` blend)
3. `ripple.vert.glsl` — fullscreen quad vertex shader

Canvas overlays with `position:fixed; pointer-events:none; z-index:10; mix-blend-mode:soft-light`. Mouse events captured at document level.

Performance monitor (`performanceMonitor.ts`) degrades gracefully: FPS < 30 → half resolution, FPS < 15 → CSS radial-gradient fallback.

## Ink Bleed System (`src/lib/inkbleed/`)

SVG feTurbulence-based transition effect on Layer 1 (no WebGL dependency):
- `InkBleedEngine.ts` — builds an SVG filter chain (`feTurbulence → feColorMatrix → feFlood → feComposite`), animates threshold via `feFuncA.tableValues`
- Component: `InkBleedOverlay.tsx` (Solid.js island, z-index: 20, above ripple)
- Behavior: idle 30s → stains appear (10s reveal) → user moves → stains vanish → idle again. Click while stains visible → flood transition (700ms) → navigate to `/depths/`
- Overlays at `position:fixed; z-index:20` covering the ripple layer

## Particle System (`src/lib/particles/`)

Canvas 2D particle text engine for the entrance page:
- `ParticleText.ts` — core engine class (build → start → stop → dispose lifecycle, matches `RippleEffect.ts` pattern)
- `palettes.ts` — 5 painting-inspired color palettes with smoothstep cycling
- `noise.ts` — Perlin 2D noise factory for color distribution
- `types.ts` — Particle, Palette, config interfaces

## Content Pipeline

- Blog posts sourced from Obsidian vault (symlinked or copied to `src/content/blog/`)
- Custom remark plugins in `src/plugins/`: wikilinks (`[[link]]`), callouts (`> [!type]`), mark highlights, video embeds
- Rehype plugins: slug, autolink headings, KaTeX math
- `src/content/config.ts` defines Zod schemas for `blog` and `thoughts` collections
- `r2-loader.ts` is a custom Astro Content Loader: checks R2 env vars → S3 or local fallback, cleans Obsidian/Typora markdown artifacts (zero-width spaces, non-breaking spaces, single-$ math normalization), supports `HTTPS_PROXY`
- `thoughts` collection has `unlockAt` field (default 3) — content gated by visit count

## Environment Variables

Defined in `.env` (see `.env.example`):
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — Cloudflare R2 access
- Accessed via `import.meta.env`
- `.npmrc` contains proxy config for network access

## Conventions

- Package manager: **yarn** (not npm)
- All timing/threshold constants centralized in `src/lib/constants.ts`
- Solid.js components are `.tsx`, Astro components are `.astro`
- Rendering engine classes follow `constructor → start → stop → dispose` lifecycle pattern
- Lightweight Astro components (`VisitTracker.astro`, `ObserverText.astro`) use inline `<script>` — no framework overhead
- Fonts: Cormorant Garamond (display), 华文中宋/STZhongsong (body/serif), JetBrains Mono (code)

## CSS Architecture (`src/styles/`)

Four CSS files, no preprocessor:
- `global.css` — CSS variables (color tokens for both layers, spacing scale `--space-xs` to `--space-2xl`, font stacks), reset, base elements
- `layer1.css` — Surface warm paper theme, ripple canvas container styling
- `layer2.css` — Depths dark theme, floating fragment drift animations, core link flicker, prose overrides for dark background
- `typography.css` — Prose content styling: headings, code blocks, callout variants (note/tip/warning/important/quote), KaTeX, video embeds

Z-index stacking on Layer 1: content (default) → ripple canvas (10, `soft-light`) → ink bleed overlay (20)
