# Liuyao Owner IP and Progress Review

- Contract: [Liuyao Owner IP and Progress Contract](../contracts/liuyao-owner-ip-progress.md)
- Reviewed change: `8790593`
- Reviewed: 2026-07-25
- Verdict: PASS
- Evidence:
  - All 13 focused Worker tests passed; Worker TypeScript and production dry-run passed; Astro built 115 pages.
  - Commit `8790593` derives owner access only from a Worker-side HMAC lookup, rejects missing/unknown IPs, keeps non-matches on the normal quota path, and preserves usage-log plus `unlimited` refund semantics without storing or binding plaintext IPs.
  - The rollout receipt records migration `0003_owner_ip_allowlist.sql` applied before Worker version `cb1d6ce6-f258-4ddb-8e58-02934c016ab8`. The enrolled row stores IP identity only as an HMAC fingerprint, alongside `enabled` and `created_at` metadata.
  - Independent public checks confirmed the production page loads `LiuyaoApp.D_BAsxho.js` and `LiuyaoApp.B41xIXLR.css`; those bundles contain the 92% waiting cap, progress ARIA label, owner-network copy, and reduced-motion rule. Production `/health` returned `env=prod`.
- Blocking issues: none.
- Residual risk: a dynamic IP change removes owner access, while a shared NAT grants it to authenticated visitors on that address; rotating `SESSION_HMAC_SECRET` requires re-enrollment; the progress percentage is intentionally staged rather than upstream telemetry.
- Wiki check: `wiki/liuyao-web.md` documents the current behavior and `wiki/log.md` records the rollout.
