# feed-rubric

Open-source Chrome MV3 extension: you write rubric categories, [Jev](https://docs.typesafe.ai/) scores each feed post with a noul per category, and posts above your threshold are hidden. Bring your own TypeSafe API key.

**Not affiliated with X/Twitter.**

## What leaves your machine

When you have an API key configured and a post is classified:

- **Post text** (tweet body the extension extracts)
- **Author handle** (e.g. `@username`), when available
- **Your category instructions** (the rubric you wrote in settings)

These are sent to `https://api.typesafe.ai/v1/systemone` over HTTPS from the extension service worker.

## What does not leave your machine

- Cookies or login sessions
- DMs or non-timeline content
- Full page HTML, images, or media
- Any telemetry from feed-rubric (there is none)

## BYOK — no shared key, no backend

You supply your own TypeSafe API key in the options page. It is stored in `chrome.storage.local` and used **only** by the service worker. Content scripts never receive the key and do not call `chrome.storage`. The page cannot read extension storage (isolated world). There is no hosted proxy and no shared key. See [SECURITY.md](SECURITY.md).

## Fail open

Errors, rate limits, missing API key, and ambiguous noul scores (near 0.5) **never hide** a post. When in doubt, you see the post.

## Default categories

Three editable, disable-able categories ship by default (threshold **0.75**). Each is a noul (yes/no) with explicit true/false criteria — not a chat prompt.

| ID | True (hide) | False (show) |
| --- | --- | --- |
| `rage_bait` | Written to inflame: dunks, pile-ons, "get furious" | Informs, reports, or makes a real argument (including sarcasm) |
| `crypto_promo` | Shills a token, exchange, wallet, or get-rich scheme | Policy/market news, education without a buy pitch |
| `unsolicited_politics` | Partisan argument or campaign ask | Neutral headline/report, or not electoral politics |

Change instructions, true/false criteria, threshold, or toggles on the **options page** (right-click extension icon → Options, or open from the popup). Hidden posts collapse to a slim **Undo** row. **Undo is session-ephemeral (v0)** — a reload or a new article node from X's renderer can hide the post again until you change the rubric. The last classify error and a cache-clear button live on Options.

## Load unpacked in Chrome

1. Clone this repo and build (or use the committed `extension/` output):
   ```bash
   npm install
   npm run build
   ```
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** and select the `extension/` folder
5. Visit [x.com](https://x.com) or run the fixture timeline (below)

## Testing on X

Work the fixture first, then x.com. Selectors break; fail-open means a miss leaves posts visible.

**CI = fixtures.** `npm test` runs vitest (no network) plus a Playwright smoke that loads the unpacked `extension/` against `fixtures/timeline.html`. It does not log into X. The Playwright smoke needs a display (headed Chromium or `xvfb-run`); Chrome headless shell cannot load MV3 extensions.

**Manual smoke = your own X account.** Do not automate disposable X account creation.

1. **Load unpacked** — `chrome://extensions` → Developer mode → Load unpacked → `extension/` folder.
2. **Options + API key** — right-click the extension icon → Options (or popup → Open settings). Paste your TypeSafe key. It stays in `chrome.storage.local` on this machine and is used only by the service worker. Saving wipes the score cache. The cache key also includes a hash of threshold + enabled category instructions, so old scores cannot apply to a new rubric.
3. **Fixture first (no X)** — `npm test` (needs Chromium once: `npx playwright install chromium`). Then `npm run build:fixture && npm run fixture` and open [http://127.0.0.1:18080/timeline.html](http://127.0.0.1:18080/timeline.html) with that unpacked build. Tweets 1–3 collapse to a slim **Undo** row at the default threshold; the rest stay visible. Production `npm run build` does not inject on loopback.
4. **Then x.com** — open a timeline on your own account. If nothing hides, check Options for the last error (missing key, rate limit, API failure) and that categories are enabled. x.com selectors live in `src/sites/x.ts` as a fallback chain. Live classify needs `https://api.typesafe.ai/*` host permission (shipped in the manifest).
5. **Privacy reminder** — only post text, author handle, and your category instructions go to `https://api.typesafe.ai/v1/systemone`. No cookies, DMs, page HTML, or telemetry. Use your own key (BYOK). There is no backend.

## Fixture timeline (no API key required)

Three fixture tweets include hardcoded `data-feed-rubric-scores` so you can demo the hide loop without a key:

```bash
npm test            # fixture build + vitest + Playwright smoke (no X)
npm run build:fixture && npm run fixture   # serve fixtures/ on :18080
```

Open [http://127.0.0.1:18080/timeline.html](http://127.0.0.1:18080/timeline.html). Tweets 1–3 collapse to an Undo row at the default threshold; the rest stay visible.

## Architecture

```
content script (x.com; fixture build also injects 127.0.0.1:18080)
  → extract text + post id
  → chrome.runtime.sendMessage (no API key)
service worker
  → allowlist sender origin; drop spoofed fixture scores
  → cache (memory + chrome.storage.session, keyed by post + rubric hash)
  → rate limit (~40 calls/min, fail open over cap)
  → POST Jev systemone from x.com senders only (credentials omitted)
  → { hide, reasons, scores, debug }
content script
  → slim placeholder + Undo, or leave visible
```

x.com selectors live in `src/sites/x.ts` and are expected to break.

## Development

```bash
npm install
npx playwright install chromium
npm test              # fixture build + vitest + Playwright unpacked-extension smoke
npm run build         # production compile TS → extension/ (no sourcemaps, no localhost)
npm run build:fixture # same bundle with 127.0.0.1:18080 content-script matches
npm run watch         # rebuild on change (fixture matches on)
npm run fixture       # serve fixtures/ on :18080
```

Source layout:

- `src/jev.ts` — thin fetch wrapper for System One (`credentials: "omit"`)
- `src/origins.ts` / `src/messaging.ts` — classify origin allowlist
- `src/categories.ts` — defaults, noul criteria, settings helpers
- `src/sites/x.ts` — x.com DOM adapter (selector fallback chain, fail-open)
- `src/score.ts` / `src/hide.ts` / `src/classify-plan.ts` — pure score, hide, and fail-open plan
- `SECURITY.md` — threat model and mitigations
- `extension/` — loadable unpacked extension (built artifacts)
- `fixtures/timeline.html` — 8 fake tweets for local testing
- `test/` — vitest unit/hide-loop/security
- `e2e/` — Playwright smoke with unpacked extension (CI, no X login)

## License

MIT — Copyright (c) 2026 Andrew Heim / [andepants](https://github.com/andepants)
