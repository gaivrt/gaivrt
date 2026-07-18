# R2 rebuild trigger

This Queue consumer triggers one Cloudflare Pages build for each delivered batch
of R2 change notifications. Queue delivery retries the batch when the deploy hook
returns a non-2xx response.

## Configuration

- Worker: `r2-rebuild-trigger`
- Queue: `r2-rebuild-queue`
- Secret: `CF_DEPLOY_HOOK`
- Batch window: up to 100 messages or 60 seconds, whichever comes first
- Notification filter: R2 keys beginning with `gaivrt/`

Wrangler 3.114.17 is pinned below because it has been dry-run tested with this
configuration and supports the project's current Node 18 development runtime.
Wrangler 4 currently requires Node 20 or newer at runtime.

## Deploy

```bash
npx -y wrangler@3.114.17 login
npx -y wrangler@3.114.17 queues create r2-rebuild-queue
npx -y wrangler@3.114.17 deploy --config workers/r2-rebuild-trigger/wrangler.jsonc
npx -y wrangler@3.114.17 secret put CF_DEPLOY_HOOK --config workers/r2-rebuild-trigger/wrangler.jsonc
```

Create one notification rule for overwrites/creates and deletes. Replace
`<R2_BUCKET>` with the existing Obsidian bucket name.

```bash
npx -y wrangler@3.114.17 r2 bucket notification create <R2_BUCKET> --event-type object-create --event-type object-delete --queue r2-rebuild-queue --prefix "gaivrt/" --description "GAIVRT content rebuild"
```

Keep `.github/workflows/scheduled-rebuild.yml` enabled as a delayed fallback.

## Verify

```bash
node --test workers/r2-rebuild-trigger/src/index.test.mjs
npx -y wrangler@3.114.17 deploy --dry-run --config workers/r2-rebuild-trigger/wrangler.jsonc
npx -y wrangler@3.114.17 r2 bucket notification list <R2_BUCKET>
```

After changing a Markdown file through Obsidian, verify that the Queue consumer
reports a successful invocation and that Cloudflare Pages creates one deployment.

## Roll back

Delete the R2 notification rule for `r2-rebuild-queue` first. The GitHub Actions
fallback will continue rebuilding every six hours. The Worker and Queue can then
be removed from the Cloudflare dashboard after confirming that no messages remain.
