# Liuyao API Worker

Cloudflare Worker for the website and the archived WeChat mini-program. It keeps the DeepSeek key server-side, verifies anonymous website sessions with Turnstile, and reuses the existing D1 quota and usage-log model.

## Local validation

```bash
yarn install --ignore-scripts
yarn typecheck
yarn test
```

Apply both migrations to a local D1 database before running `yarn dev`.

## Required production configuration

1. Replace the production D1 placeholder in `wrangler.toml` with the existing `liuyao-prod` database ID.
2. Create a Cloudflare Turnstile widget for `gaivrt.com` in managed mode.
3. Add these Worker secrets with `wrangler secret put --env production`:
   - `WX_APPSECRET`
   - `DEEPSEEK_API_KEY`
   - `CODE_HMAC_SECRET`
   - `SESSION_HMAC_SECRET`
   - `TURNSTILE_SECRET_KEY`
4. Apply `migrations/0002_web_auth.sql` to the production D1 database.
5. Set the site's `PUBLIC_TURNSTILE_SITE_KEY` build variable to the widget's public site key.
6. Deploy the Worker before rebuilding the website.

Production intentionally sets `LEGACY_ROOT_FALLBACK = "false"`. Do not re-enable the anonymous root endpoint: it bypasses quota accounting.

## Privacy boundary

The question, structured hexagram, and local diagnosis are sent through this Worker to DeepSeek when the visitor explicitly requests interpretation. D1 stores identity/quota and usage metadata, not the prompt or returned interpretation. The browser stores the returned text in local history.
