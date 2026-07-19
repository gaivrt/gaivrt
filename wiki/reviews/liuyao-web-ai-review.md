# Liuyao Web AI Review

- Contract: [Liuyao Web AI Contract](../contracts/liuyao-web-ai.md)
- Verdict: PASS
- Validation evidence:
  - Worker TypeScript check passed (`tsc --noEmit`).
  - Eight focused Worker security tests passed for exact-origin and credentialed CORS, Turnstile hostname binding, missing-host rejection, HMACed-IP anonymous-session limits, 10-use quota initialization, and production cookie attributes.
  - Astro production build passed with a production Turnstile site key.
  - Browser regression passed at 1440 × 900, 390 × 700, and 320 × 700 with six casts, successful interpretation, remaining quota, cached-history reopen without another API call, and no runtime exceptions.
  - Turnstile recovery regression deliberately failed the first challenge-script request, surfaced a retry state, then loaded the script and completed `/auth/web` plus `/interpret` on retry (`turnstileRequests=2`, `loading=false`, `exceptions=[]`).
- Blocking issues: none.
- Residual risk:
  - Production deployment remains pending and still requires real D1 identifiers, Worker secrets, migration application, a production Turnstile widget, and a post-deploy smoke test.
  - Browser-local history is intentionally device-specific; clearing site data removes the cached interpretation and anonymous identity.
  - The per-IP anonymous-session cap can affect visitors sharing a heavily used NAT, but it limits session creation rather than authenticated interpretation and fails with an explicit retry-later message.
- Wiki check: `wiki/liuyao-web.md` describes the current authentication, privacy, quota, caching, desktop/mobile presentation, and validation behavior; `wiki/index.md` links the contract and this review; `wiki/log.md` contains one concise durable change entry. No relevant stale or contradictory Liuyao page was found.
