# Liuyao Owner IP and Progress Contract

- Target: let the explicitly enrolled owner network interpret without decrementing quota, and show restrained staged progress while interpretation is pending.
- Scope: HMAC-only owner IP allowlist, normal quota fallback for missing/non-matching IPs, unchanged usage logging/refund behavior, and an accessible client progress line capped below completion until a real response arrives.
- Non-goals: plaintext IP storage, account-wide unlimited access, changing ordinary visitor quota, or exposing upstream telemetry.
- Acceptance: owner matching is Worker-derived and request bodies cannot override it; ordinary quota remains 10/day; failures do not add or spend quota; progress stays at or below 92% before success, cleans up on failure/reset/unmount, and respects reduced motion.
- Validation: focused Worker tests, Worker typecheck and dry-run, Astro production build, migration-first production rollout, deployed bundle inspection, and reviewer PASS.
- Risk: governed authentication/quota and production migration.
