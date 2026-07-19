# Liuyao Web Page

`/surface/liuyao/` is a self-contained browser port of the archived WeChat mini-program's offline divination flow.

## Behavior

- The Solid island in `src/components/liuyao/LiuyaoApp.tsx` handles the question, six coin casts, optional DeviceMotion input, vibration feedback, result display, reset, and local history.
- Casting is viewport-locked: the document itself does not scroll, and the primary/result/reset controls remain visible after the sixth cast, including on a 390 × 700 short screen. Long result content scrolls inside its own container.
- At 900px and above, casting uses a two-column desktop workspace (identity/date on the left, question or hexagram on the right). Result cards split into a primary-hexagram column and a changed-hexagram/notes column.
- History is browser-local under `localStorage['gaivrt_liuyao_history']`, capped at 200 records. It is not uploaded or shared across devices.
- `src/lib/liuyao/najia.ts` is a behavior-preserving ESM port of the mini-program's pure `najia.js` algorithm. It produces the primary hexagram, changed hexagram, palace, six relations, six spirits, host/guest lines, stems and branches, void branches, and status annotations.
- The page deliberately does not expose AI interpretation. The existing Worker authentication depends on `wx.login`, and its production CORS policy does not allow the personal-site origin.
- The home-page entrance is the small six-line icon in the upper-left corner of `/surface/`.

## Visual boundary

The page uses the Surface warm-paper theme and the Liuyao-specific Ma Shan Zheng subset for large Chinese titles and hexagram names. Body and UI text continue to use the site's standard serif and system stacks.

## Validation

- Static build with R2 variables blank and temporary empty local collection directories.
- Algorithm parity check across 128 base/moving-line cases against the archived mini-program implementation.
- Mobile headless-Chrome screenshot at 390 × 844.
- Browser interaction regression at 1440 × 900 and 390 × 700: six casts, enabled result button, successful result transition, six rendered lines, document scroll locked, and zero runtime exceptions.
