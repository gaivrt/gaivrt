# R2 Event Rebuild Contract

- Target: rebuild Cloudflare Pages shortly after Obsidian content changes in R2.
- Scope: add a Queue consumer Worker, deployment configuration, setup commands, and deployment documentation.
- Non-goals: change the Astro R2 loader, remove the GitHub Actions fallback, or expose the Pages deploy hook.
- Acceptance criteria:
  - one Queue batch triggers at most one deploy-hook request;
  - failed hook requests are retried by Queue;
  - R2 notifications are scoped to `gaivrt/` content changes;
  - the deploy hook is stored as a Worker secret;
  - setup and rollback steps are documented.
- Required validation: Worker unit tests, Wrangler dry-run bundle, production Astro build, cloud configuration inspection, an end-to-end probe, and a reviewer PASS after implementation.
- Risk class: governed deployment configuration.
- Reviewer checklist: correctness, secret handling, retry/batching behavior, Cloudflare configuration consistency, and preservation of the GitHub fallback.
