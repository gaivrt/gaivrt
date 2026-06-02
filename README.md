# GAIVRT

> *你要剥开我* — a personal academic homepage with hidden depth layers.

## Overview

A three-layer experience: **Entrance** (a particle animation that forms the name), **Surface** (a warm-paper academic homepage with a WebGL ripple and ink-bleed transition), and **Depths** (a dark space of floating fragments that progressively unlocks based on visit count). The surface is professional; the depths are private and only revealed to visitors who keep coming back.

## Tech stack

- **Astro 5.5** — static output
- **Solid.js 1.9** — client islands (`client:only="solid-js"`)
- **Three.js 0.172** — WebGL ripple via dual FBO ping-pong, custom GLSL shaders
- **Cloudflare R2** — Markdown content storage (with local fallback)
- **Obsidian-flavored Markdown** — wikilinks, callouts, math, video embeds via custom remark plugins
- Pure scoped CSS, TypeScript strict mode, no test runner

## Quick start

```bash
yarn install
cp .env.example .env   # optional: fill R2_* to pull remote content
yarn dev               # http://localhost:4321
yarn build             # static output → dist/
yarn preview           # serve built site locally
```

When the `R2_*` environment variables are missing, content loads from local `src/content/{collection}/` instead of R2 — useful for offline development.

## Content

Posts live in a Cloudflare R2 bucket, synced from an Obsidian vault via the [`remotely-save`](https://github.com/remotely-save/remotely-save) plugin. Seven collections are wired through a custom Astro Content Loader (`src/lib/r2-loader.ts`):

`blog`, `thoughts`, `projects`, `publications`, `research`, `cv`, `about`

The `thoughts` collection has an `unlockAt` field — entries only appear once the visitor has hit the corresponding visit count (default 3).

## Project layout

```
src/
├── pages/
│   ├── index.astro           # Layer 0 — particle entrance
│   ├── surface/              # Layer 1 — warm paper homepage + content
│   └── depths/               # Layer 2 — floating fragments + core
├── components/
│   ├── entrance/             # ParticleEntrance (Solid)
│   ├── surface/              # RippleCanvas, InkBleedOverlay, BackLink, ...
│   └── shared/               # VisitTracker, ThemeToggle
├── lib/
│   ├── webgl/                # RippleEffect, performanceMonitor
│   ├── particles/            # ParticleText engine + palettes
│   ├── inkbleed/             # SVG feTurbulence transition engine
│   ├── r2-loader.ts          # Custom Astro Content Loader (R2 → local fallback)
│   ├── visitStore.ts         # localStorage visit tracking
│   └── constants.ts          # All timing / threshold constants
├── shaders/                  # GLSL: ripple.vert, ripple.frag, rippleSim.frag
├── content/                  # Local content fallback + collection schemas
├── plugins/                  # Custom remark plugins (wikilinks, callouts, ...)
└── styles/                   # global, layer1, layer2, typography
docs/                         # DEPLOY.md, PLAN.md, WALKTHROUGH.md
scripts/                      # list-r2.mjs (R2 connectivity check)
```

## Deployment

Hosted on **Cloudflare Pages**, fed by a GitHub Actions cron (`.github/workflows/scheduled-rebuild.yml`) that triggers a deploy hook every 6 hours so R2 content edits propagate without a code push. Full setup in [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## Further reading

- [`CLAUDE.md`](./CLAUDE.md) — guidance for AI coding assistants
- [`docs/PLAN.md`](./docs/PLAN.md) — design philosophy and original architecture plan
- [`docs/DEPLOY.md`](./docs/DEPLOY.md) — Cloudflare Pages + R2 deployment runbook
- [`docs/WALKTHROUGH.md`](./docs/WALKTHROUGH.md) — feature walkthrough

## Status

Personal project. `package.json` is marked `private`; no license is declared.
