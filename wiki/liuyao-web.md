# Liuyao Web Page

`/surface/liuyao/` is a browser port of the archived WeChat mini-program's casting, Najia diagnosis, and DeepSeek interpretation flow.

## Behavior

- The Solid island in `src/components/liuyao/LiuyaoApp.tsx` handles the question, six coin casts, optional DeviceMotion input, vibration feedback, result display, reset, and local history. Each cast renders three temporary coins in the same frame that shaking begins, then commits the resulting line only after both coin and whole-screen desktop animations finish.
- On phones, casting and result views are locked to the visual viewport: the document cannot scroll, overscroll, or be touch-dragged. The app measures the rendered content and available safe-area space, then applies one uniform scale when necessary, so all six casts and the result/reset controls remain on one screen without per-model breakpoints. Long interpretation and history content still scroll inside their own overlays.
- At 900px and above, casting uses a two-column desktop workspace (identity/date on the left, question or hexagram on the right). At 1180px and above, results use an editorial desktop spread: hexagram identity and text actions form the left folio, while the six-line and changed-hexagram structures become a borderless ruled ledger in the right folio. The 1440 × 900 result view fits without scrolling.
- History is browser-local under `localStorage['gaivrt_liuyao_history']`, capped at 200 records. Successful DeepSeek text is cached with its record, so reopening the same record does not consume another interpretation. History is not uploaded or shared across devices.
- The result footer preserves the original action hierarchy. “解读卦象” runs the archived local diagnosis and Handbook prompt through the Liuyao Worker and DeepSeek: the archived bottom sheet remains unchanged on mobile, while desktop uses a full-height right-side reading folio. Loading, retry, quota exhaustion, and remaining-count states are local UI states. “分享” uses the Web Share API with a clipboard fallback, and “保存” opens the browser print/save flow.
- `src/lib/liuyao/najia.ts` is a behavior-preserving ESM port of the mini-program's pure `najia.js` algorithm. It produces the primary hexagram, changed hexagram, palace, six relations, six spirits, host/guest lines, stems and branches, void branches, and status annotations.
- `src/lib/liuyao/diagnose.ts` and `prompt.ts` preserve the mini-program's local reasoning and full 《增删卜易》Handbook prompt. `interpret.ts` is the browser transport; it never contains the DeepSeek key.
- `workers/liuyao-api/` preserves WeChat bearer-token compatibility and adds Turnstile-verified anonymous Web sessions in a Secure, HttpOnly, SameSite cookie. Exact-origin CORS allows only the site, production disables the unauthenticated legacy root, and anonymous session creation is limited per HMACed IP/day.
- New and daily-reset quota is 10. Calls still use the existing D1 consume → usage-log → DeepSeek → success/refund flow, so upstream failures do not spend a use. The launch migration raises existing daily balances to 10.
- When interpretation is requested, the question, structured hexagram, and local diagnosis are sent through the Worker to DeepSeek. D1 stores identity/quota and usage metadata, not prompts or interpretation text; the returned interpretation remains in browser-local history.
- The home-page entrance is the small six-line icon in the upper-left corner of `/surface/`.
- The Liuyao header uses the same shared `site-back-link` markup and stylesheet as Blog and other Surface pages. Its fixed-viewport shell may remove only the component's outer vertical padding; typography, arrow, color, spacing, and hover motion remain shared on desktop and mobile.

## Visual boundary

The page uses the Liuyao-specific Ma Shan Zheng subset for large Chinese titles and hexagram names. On mobile, result colors, DOM hierarchy, and all dimensions follow the archived mini-program's `app.wxss` and `result.wxss`; `rpx` values are mapped with `100vw / 750`, preserving WeChat's viewport scaling. The GAIVRT link and shared theme control remain as the website shell. Both the page shell and Liuyao canvas inherit the shared `--surface-bg` token, so dark mode has no mismatched outer gutter.

## Validation

- Static build with R2 variables blank and temporary empty local collection directories.
- Algorithm parity check across 128 base/moving-line cases against the archived mini-program implementation.
- Worker TypeScript check and eight focused security tests covering exact-origin CORS, credentialed CORS, Turnstile hostname binding, missing-host rejection, HMACed-IP session limits, 10-use initialization, and production cookie attributes.
- Browser interaction regression at 1440 × 900 plus phone viewports 320 × 568, 360 × 640, 375 × 667, 390 × 700, 390 × 844, 412 × 915, 430 × 932, and 844 × 390: six casts, result transition, AI request/response, remaining count, local-history cache with no second API call, fixed document dimensions, visible footer controls, no horizontal overflow, desktop full-page shake, and zero runtime exceptions.
- First-cast browser timing check at 35 ms: three coins are visible with `coinShake`, the desktop canvas simultaneously has `screenShake`, the first line is not committed until animation completion, and page/app dark backgrounds resolve to the same shared color.
- Browser computed-style comparison confirms Blog and Liuyao share the same back-link font family, size, weight, letter spacing, color, gap, alignment, and destination at desktop width; the same values persist on the 390 px mobile viewport.
