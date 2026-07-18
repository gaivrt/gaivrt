# Deployment

Blog content is synchronized from Obsidian to R2. One rule sends R2
`object-create` and `object-delete` notifications for the `gaivrt/` prefix to the
`r2-rebuild-queue` Queue. Its `r2-rebuild-trigger` consumer batches up to
100 messages for up to 60 seconds, then calls the Cloudflare Pages deploy hook
once. Non-success responses cause Queue retry.

The event consumer stores the hook as the Worker secret `CF_DEPLOY_HOOK`.
GitHub Actions stores its own repository secret with the same name and remains
enabled as a six-hour fallback.

Operational commands are documented in
`workers/r2-rebuild-trigger/README.md`.
