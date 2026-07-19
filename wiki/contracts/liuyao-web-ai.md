# Liuyao Web AI Contract

- Target: restore the archived Liuyao DeepSeek interpretation flow on the public personal website without exposing the upstream API key.
- Scope: add a repository-owned Cloudflare Worker based on the archived service; add Turnstile-verified anonymous Web sessions; allow only the production site and local development origins; reuse the existing D1 user/session/quota/usage model; set the daily free quota to 10; port the local diagnosis and Handbook prompt; display, retry, and cache real AI interpretations in the existing result view.
- Non-goals: account registration, email login, payments, cross-device history, streaming output, changing the Najia algorithm, or remotely deploying without separate approval.
- Acceptance criteria:
  - DeepSeek credentials remain Worker-only and no secret enters the browser bundle;
  - a Web visitor receives an HttpOnly anonymous session only after successful Turnstile verification;
  - authenticated interpretation requests share the existing quota, usage-log, and idempotent refund path;
  - the daily anonymous quota initializes and resets to 10;
  - CORS uses an explicit origin allowlist with credentials, and the unauthenticated legacy root is disabled in production;
  - a successful interpretation is cached with its local history record and does not consume quota again when reopened;
  - loading, quota exhaustion, network failure, and retry states are visible and accessible without changing the archived mobile result layout.
- Required validation: focused Worker unit tests for Web auth/CORS/cookie/quota behavior; Worker typecheck or Wrangler dry-run bundle; Astro production build; browser checks at desktop and mobile widths; no secret scan findings; reviewer PASS after implementation.
- Risk class: governed authentication, permissions, external API, and deployment configuration.
- Reviewer checklist: authentication bypasses, CORS/cookie/CSRF boundaries, Turnstile verification, quota reset and refund correctness, prompt/data exposure, secret handling, client caching semantics, and preservation of WeChat authentication compatibility.
