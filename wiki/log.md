# Wiki Log

- 2026-07-20: Kept retryable Turnstile `300*`/`600*` failures in the same Widget for one bounded automatic retry, avoiding a full verification restart while preventing an endless spinner.
- 2026-07-20: Moved Liuyao browser auth to the first-party `liuyao.gaivrt.com` Worker domain to preserve anonymous cookies, restored archived mobile casting proportions without whole-page scaling, and moved Android haptics into the initiating click frame.
- 2026-07-20: Expanded the production Turnstile challenge lifecycle with usable provider UI and actionable callbacks, and kept regular-weight four-character hexagram names on one line; production token issuance still awaits a fresh real-browser check.
- 2026-07-20: Deployed the reviewed Liuyao production Worker and D1 binding with production secrets, verified health and exact credentialed CORS, and added the public Turnstile site key as a browser fallback; full session and DeepSeek smoke testing awaits the corresponding Pages deployment.
- 2026-07-19: Replaced the Liuyao-only `GAIVRT / SURFACE` navigation treatment with the shared Surface back-link component styling used by Blog on both desktop and mobile.
- 2026-07-19: Unified the Liuyao dark canvas with the site background, made all three coins visible from the first shaking frame, allowed the actual `gaivrt.com` Pages origins, and initialized the production D1 schema; Worker deployment still awaits production DeepSeek and Turnstile secrets.
- 2026-07-19: Made the Liuyao phone casting and result views fit the visual viewport dynamically across safe areas and short screens, with document scrolling, overscroll, and touch dragging disabled.
- 2026-07-19: Restored real DeepSeek Liuyao interpretation through a Turnstile-protected anonymous Web session, set the shared daily quota to 10, cached returned text locally, and added Worker security tests; deployment remains pending approval.
- 2026-07-19: Replaced the desktop Liuyao interpretation bottom sheet with a full-height right-side reading folio; mobile interpretation styling remains unchanged.
- 2026-07-19: Removed card, pill, filled-row, and boxed-button treatments from the desktop Liuyao result view, leaving a restrained ruled-paper ledger while preserving mobile styling.
- 2026-07-19: Added a desktop-only editorial two-column Liuyao result layout while leaving the original responsive mobile result rules unchanged.
- 2026-07-19: Rebuilt the Liuyao mobile result DOM from the original WXML/WXSS with exact responsive `rpx` scaling, restored its action footer and local interpretation sheet, and added mobile vibration plus desktop full-page shake feedback.
- 2026-07-19: Fixed Liuyao result navigation, made history persistence non-blocking, locked casting controls inside the viewport, and added distinct desktop two-column casting/result layouts.
- 2026-07-19: Ported the archived Liuyao mini-program's offline casting and Najia result flow to `/surface/liuyao/`, with local browser history and a home-page icon entrance.
- 2026-07-19: Documented the R2 Event Notification → Queue → Worker → Pages rebuild path, with GitHub Actions retained as fallback.
