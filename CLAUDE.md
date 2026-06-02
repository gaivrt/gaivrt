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

- **Astro 5.5** (static output) + **Solid.js 1.9** (client islands) + **Three.js 0.172** (WebGL)
- **TypeScript** strict mode, JSX configured for Solid.js
- Pure scoped CSS — no Tailwind or CSS framework
- GLSL shaders imported as assets (`vite.assetsInclude: ['**/*.glsl']`)
- Content via Astro Content Collections (Markdown, Obsidian-compatible)
- Cloudflare R2 for remote content via `@aws-sdk/client-s3`; `gray-matter` for frontmatter, `https-proxy-agent` for proxied fetches; falls back to local `src/content/` when R2 env vars are missing

## Architecture: Three-Layer Experience

Personal academic homepage with hidden depth layers. Core concept: "你要剥开我" — surface is professional, depths are private, only discoverable through exploration. Unified warm color palette across all layers.

### Layer 0 — Entrance (`pages/index.astro`)
Canvas 2D particle animation forming "GAIVRT" with painting-inspired color palettes (Monet, Vermeer, Hokusai, Klimt, Yoshida). Particles have spring physics + mouse repulsion. Click anywhere to enter. Return visitors (>3 visits) skip directly to `/surface/`.

Engine: `src/lib/particles/ParticleText.ts` (config-driven, `src/lib/constants.ts` ENTRANCE block).
Component: `src/components/entrance/ParticleEntrance.tsx` (Solid.js island).

### Layer 1 — Surface (`pages/surface/`)
Warm paper editorial theme (#f5f0e8 background). Cormorant Garamond display font. SVG feTurbulence paper grain texture overlay. WebGL ripple produces warm golden glow on mouse movement (candlelight effect via `mix-blend-mode: soft-light`). After ~30s of idle, ink stains appear; clicking while they're visible floods the page and transitions to Layer 2.

Routes:
- `/surface/` — centered hero with avatar + book-style TOC grid (no sticky nav)
- `/surface/about`, `/surface/cv`, `/surface/research` — single-entry pages that render the first item of the matching R2 collection inline; show a fallback message if the collection is empty
- `/surface/blog/[...page]` paginated list (20/page) + `/surface/blog/[slug]` single post
- `/surface/projects/[...page]` + `/surface/projects/[slug]`
- `/surface/publications/[...page]` + `/surface/publications/[slug]`

All content pages use `BackLink.astro` (`← GAIVRT`) — there is no sticky navbar. `NavBar.astro` and `BreathingCard.astro` exist but are currently unused; prefer extending `BackLink.astro` / `TableOfContents.astro` unless a full nav is being introduced.

### Layer 2 — Depths (`pages/depths/`)
Deep warm black (#0a0806) with floating text fragments. Content progressively unlocks based on visit count (thresholds in `src/lib/constants.ts`).
- `/depths/` — floating fragment space
- `/depths/thoughts/[...slug]` — individual entries from the `thoughts` collection (each entry has an `unlockAt` visit-count gate, default 3)
- `/depths/core` — final endpoint, redirects unless visit count ≥ 10

### Progressive Unlock System

Visit count (localStorage via `visitStore.ts`) drives content revelation. Thresholds in `constants.ts`:
- **3 visits**: extra text fragments appear on `/depths/`; entrance may reappear (25% chance)
- **5 visits**: all thoughts collection content unlocked
- **8 visits**: core link begins flickering on `/depths/`
- **10 visits**: full access to `/depths/core` (redirects otherwise)

InkBleed idle delay also scales with visits: >10 → 15s, >5 → 18s, default → 30s (see `InkBleedOverlay.tsx:14-16`).

### Theme System

Real light/dark/system theme support, not just stylistic toggling:
- `src/components/shared/ThemeToggle.astro` — fixed top-right control cycling **light → dark → system**, persisted in `localStorage('gaivrt_theme')`.
- Sets `data-theme-pref` on `<html>`; resolves to `data-theme` (`light` | `dark`), respecting `prefers-color-scheme` when pref is `system`.
- `InkBleedOverlay.tsx` watches `data-theme` via `MutationObserver` and rebuilds the engine with theme-appropriate visuals: `#1a1410` stain + `multiply` blend in light, `#d4c4a8` stain + `screen` blend in dark.

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

- Markdown sourced from an Obsidian vault, synced to Cloudflare R2 via the `remotely-save` plugin (or symlinked locally for dev)
- Custom remark plugins in `src/plugins/`: wikilinks (`[[link]]`), callouts (`> [!type]`), mark highlights, video embeds
- Rehype plugins: slug, autolink headings, KaTeX math
- `r2-loader.ts` is a custom Astro Content Loader: checks R2 env vars → S3 or local fallback, cleans Obsidian/Typora markdown artifacts (zero-width spaces, non-breaking spaces, single-`$` math normalization), supports `HTTPS_PROXY` / `https_proxy`

### Collections (`src/content/config.ts`)

Seven collections, all loaded through `r2Loader({ prefix })`:

| Collection | R2 Prefix | Schema highlights |
|---|---|---|
| `blog` | `gaivrt/Blog/` | title, date?, description?, tags[], draft |
| `thoughts` | `gaivrt/Thoughts/` | title?, date?, **unlockAt** (default 3) — visit-count gate |
| `projects` | `gaivrt/Projects/` | title, date?, description?, tags[], url?, github? |
| `publications` | `gaivrt/Publications/` | title, date?, authors?, venue?, url? |
| `research` | `gaivrt/Research/` | title, date?, description?, status? |
| `cv` | `gaivrt/CV/` | title? |
| `about` | `gaivrt/About/` | title? |

When `R2_*` env vars are missing, `r2Loader` falls back to local `src/content/{collection}/*.md`.

## Environment Variables

Defined in `.env` (see `.env.example`):
- `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` — Cloudflare R2 access
- Accessed via `import.meta.env`
- `HTTPS_PROXY` / `https_proxy` (read directly from `process.env` by `r2-loader.ts` and `scripts/list-r2.mjs`) — routes outbound R2 traffic through a proxy when set

## Operational Tooling

- `scripts/list-r2.mjs` — diagnostic script that lists the first few objects under `gaivrt/Blog/` and `gaivrt/Thoughts/` to verify R2 credentials. Run via `node scripts/list-r2.mjs` with the standard `R2_*` env vars loaded.
- `.github/workflows/scheduled-rebuild.yml` — GitHub Actions cron `0 */6 * * *` that POSTs to a Cloudflare Pages deploy hook (`secrets.CF_DEPLOY_HOOK`). Also manually dispatchable. Purpose: refresh the static build against the latest R2 content without waiting on a code push.
- `docs/` — `DEPLOY.md` (Cloudflare Pages + R2 + scheduled-rebuild runbook), `PLAN.md` (original design philosophy and architecture intent), `WALKTHROUGH.md` (feature walkthrough). Read these when deeper context on intent is needed.

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
