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

## Obsidian publishing after the LiveSync migration (2026-09-18)

LiveSync handles device synchronization through CouchDB. On the Windows desktop,
Remotely Save is retained as a separate upload-only publisher to the existing R2
`obsidian` bucket. Its allow-path regex is `^gaivrt(/|$)`, direction is
`incremental_push_only`, and empty-folder cleanup is `skip`. Vault configuration
and bookmarks are excluded. It checks every 10 minutes and is triggered 10
seconds after saves; startup synchronization is delayed by 10 seconds. Obsidian
on this desktop must be running for these triggers to work.

Local deletions and renames do not remove old R2 objects in this mode. Remove
retired public content separately when intended. Do not restore the old
whole-vault bidirectional settings alongside LiveSync.
