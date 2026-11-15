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

### Layer 0 — Entrance (overlay on the homepage)
Canvas 2D particle animation forming "GAIVRT" with painting-inspired color palettes (Monet, Vermeer, Hokusai, Klimt, Yoshida). Particles have spring physics + mouse repulsion. It is laid over `/` once per browser session (`Entrance.astro` decides before first paint and counts the visit); click anywhere and it lifts off the homepage. Return visitors (>3 visits) usually skip it.

Engine: `src/lib/particles/ParticleText.ts` (config-driven, `src/lib/constants.ts` ENTRANCE block).
Components: `src/components/entrance/Entrance.astro` (overlay + inline decision), `ParticleEntrance.tsx` (Solid.js island).

### Layer 1 — Surface (`pages/`, everything outside `depths/`)
The surface has no prefix in its URLs (`/`, `/about`, `/blog/...`): it must look like the whole site. Old `/surface/...` addresses redirect (`public/_redirects`).

Warm paper editorial theme (#f5f0e8 background). Cormorant Garamond display font. SVG feTurbulence paper grain texture overlay. Every surface page (not 六爻) lies under clear water that the pointer stirs. Now and then, on the homepage, wine seeps up into it. That wine is the depths: there is no separate depths page any more.

Homepage: centered hero with avatar + book-style TOC navigation (no navbar).
Subpages: minimal `← GAIVRT` back-link via `BackLink.astro` (no sticky nav).

### Layer 2 — Depths (in the wine, and `pages/depths/thoughts/`)
The depths have no page of their own and nothing links to them. They come up through the homepage with the wine (see Wine below): hidden lines in three layers, shallow to deep, and under the deepest the titles of the `thoughts` collection. A title is the only way in to a thought's page (`/depths/thoughts/<id>`, `Layer2Layout`). Clicking it sinks first: a `.wine-sink` overlay deepens to `--depths-bg` (burgundy-black by day, warm black #0a0806 by night), then the router navigates. A thought is read one line at a time (`[...slug].astro`), in wine on paper as on the surface: the page arrives under a `.thought-dark` cover of that same dark, which lifts off paper (`.depths.in-wine`) while wine wells up in the middle. It is the same `WineEffect`, with no lines, in a `.thought-wine` wrapper (multiply by day, screen by night); every new line opens a source there, the pointer stirs it and a press pours. The words are in the paper's own colour, so they read only where wine stands, like wax under a wash. Each line of the note's body is one line on screen, large and centred; it holds for a while, then dims and moves up as the next comes (a press, Space or arrows move it sooner, Escape leaves). Lines wrap only between words (`Intl.Segmenter` at build time puts a `<wbr>` after each). After the last line the page rises by itself: a `.thought-rise` overlay thins to `--surface-bg`, then the router goes to `/`. There is no link back. Without WebGL or with reduced motion the page stays dark with light text. Old `/depths` and `/depths/core` addresses redirect to `/` (`public/_redirects`).

Visit count (localStorage via `visitStore.ts`) only decides two things now: whether the entrance is skipped, and whether the wine may come (`WINE.MIN_VISITS`).


### Key architectural boundaries
- **Layouts**: `BaseLayout` → `Layer1Layout` (warm paper) or `Layer2Layout` (deep warm black)
- **Client islands**: Solid.js components use `client:only="solid-js"` (no SSR)
- **State**: localStorage only (`visitStore.ts`), no external state management
- **Transitions**: Astro `<ClientRouter />` for View Transitions between layers

## Wine (`src/lib/wine/`)

One fluid, two states. Every `Layer1Layout` page (fine pointer, no reduced-motion) always lies under clear water: the pointer pushes it, and it shows only in what it bends — the page's text (SVG `feDisplacementMap` fed from the velocity field), a faint paper weave drawn by the canvas, a dried stain. Now and then, on the homepage only, wine seeps up into that water, spreads, and dries into a stain. Once it has come, pressing pours more.
- **Layered lines**: each of 8 places holds three lines (one from each pool in `lines.ts`: `SHALLOW`, `DEEPER`, `DEEPEST`) and, for some places, a thought's title under them. Which one shows depends on how long thick wine has stood there (`soak` buffer, thresholds `DEPTH`). A title that is out is clickable and leads to the thought. Wide viewports put the places in the side margins, tall ones (phones) down the middle.
- **The page soaks away**: where wine has stood (`GONE`), a paper-coloured veil canvas covers what was printed, and clicks on links under it are swallowed — the link is gone too. A reload brings the page back.
- **The deep end**: once 90% of the page has soaked away (`LOST`), the rest goes at once: nothing more wells up, the wine stays exactly as it is (no fill, no fade), the whole page is gone, and every place shows its deepest line and title. The places are scattered at random on each visit. The pointer still pushes it; pressing no longer pours.
- **Touch screens**: no clear water (nothing to stir it with) and no SVG filter; only the wine, on the homepage, when it is chosen. Press and hold pours.
- `WineEffect.ts` — WebGL2 stable-fluids engine (no Three.js); `shaders.ts` — its GLSL; `lines.ts` — the three pools of lines (edit them there). The loop rests whenever the water is still.
- `Wine.astro` (in `Layer1Layout`) — starts the water, picks the lines and titles, and decides whether the wine comes on this load (thresholds in `constants.ts` `WINE`). Back doors for looking at it: `/#wine` brings it at once; `/#deep` does too and soaks in twelve times as fast, so one press brings out every layer.
- Clear water's canvas is `position:fixed`; once wine is to come, the veil and wine canvases lie on the page instead (`position:absolute` in `.surface`), so they scroll with it and a phone's address bar cannot stretch them. Both at `z-index:12`, the wine blended `multiply` (light) / `screen` (dark); the water bends the page's `<main>`

## Particle System (`src/lib/particles/`)

Canvas 2D particle text engine for the entrance page:
- `ParticleText.ts` — core engine class (build → start → stop → dispose lifecycle)
- `palettes.ts` — 5 painting-inspired color palettes with smoothstep cycling
- `noise.ts` — Perlin 2D noise factory for color distribution
- `types.ts` — Particle, Palette, config interfaces

## Content Pipeline

- Blog posts sourced from Obsidian vault (symlinked or copied to `src/content/blog/`)
- Custom remark plugins in `src/plugins/`: wikilinks (`[[link]]`), callouts (`> [!type]`), mark highlights, video embeds
- Rehype plugins: slug, autolink headings, KaTeX math
- `src/content/config.ts` defines Zod schemas for `blog` and `thoughts` collections
- `r2-loader.ts` is a custom Astro Content Loader: checks R2 env vars → S3 or local fallback, cleans Obsidian/Typora markdown artifacts (zero-width spaces, non-breaking spaces, single-$ math normalization), supports `HTTPS_PROXY`
- `thoughts` collection: local to the repo (`src/content/thoughts/`, Astro `glob` loader, not R2: a note saved in the vault folder would be published). Short fragments reached only through the wine, one sentence per paragraph; `title` is what the wine shows (falls back to the id) and must fit a margin (16 full-width characters)
- Every line in `lines.ts` and every fragment is the author's own words from his notes, cut but never reworded. Do not write new ones for him

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
- Lightweight Astro components (`Entrance.astro`) use inline `<script>` — no framework overhead
- Fonts: Cormorant Garamond (display), 华文中宋/STZhongsong (body/serif), JetBrains Mono (code)

## CSS Architecture (`src/styles/`)

Four CSS files, no preprocessor:
- `global.css` — CSS variables (color tokens for both layers, spacing scale `--space-xs` to `--space-2xl`, font stacks), reset, base elements
- `layer1.css` — Surface warm paper theme
- `layer2.css` — Depths background for thought pages: dark, or paper once the wine runs
- `typography.css` — Prose content styling: headings, code blocks, callout variants (note/tip/warning/important/quote), KaTeX, video embeds

Z-index stacking on Layer 1: content (default) → veil and water/wine canvas (12) → 六爻 door (30; once wine has come it drops under the veil and soaks away with the page) → theme toggle (200)
