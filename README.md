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

You supply your own TypeSafe API key in the options page. It is stored in `chrome.storage.local` and used **only** by the service worker. Content scripts never see the key. There is no hosted proxy and no shared key.

## Fail open

Errors, rate limits, missing API key, and ambiguous noul scores (near 0.5) **never hide** a post. When in doubt, you see the post.

## Default categories

Three editable, disable-able categories ship by default (threshold **0.75**). Each is a noul (yes/no) with explicit true/false criteria — not a chat prompt.

| ID | True (hide) | False (show) |
| --- | --- | --- |
| `rage_bait` | Written to inflame: dunks, pile-ons, "get furious" | Informs, reports, or makes a real argument (including sarcasm) |
| `crypto_promo` | Shills a token, exchange, wallet, or get-rich scheme | Policy/market news, education without a buy pitch |
| `unsolicited_politics` | Partisan argument or campaign ask | Neutral headline/report, or not electoral politics |

Change instructions, true/false criteria, threshold, or toggles on the **options page** (right-click extension icon → Options, or open from the popup). The last classify error and a cache-clear button live there too.

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

1. **Load unpacked** — `chrome://extensions` → Developer mode → Load unpacked → `extension/` folder.
2. **Options + API key** — right-click the extension icon → Options (or popup → Open settings). Paste your TypeSafe key. It stays in `chrome.storage.local` on this machine and is used only by the service worker.
3. **Fixture first (no X, no TypeSafe network required for the hide loop)** — `npm test` applies dry-run scores from `fixtures/timeline.html` and asserts tweets 1–3 hide. Then `npm run fixture` and open [http://127.0.0.1:8080/timeline.html](http://127.0.0.1:8080/timeline.html) with the extension loaded. Tweets 1–3 hide at the default threshold; the rest stay visible. Enable **Debug** to see a faint chip on hidden posts (click to unhide).
4. **Then x.com** — open a timeline. If nothing hides, check Options for the last error (missing key, rate limit, API failure) and that categories are enabled. x.com selectors live in `src/sites/x.ts`.
5. **Privacy reminder** — only post text, author handle, and your category instructions go to `https://api.typesafe.ai/v1/systemone`. No cookies, DMs, page HTML, or telemetry. Use your own key (BYOK). There is no backend.

## Fixture timeline (no API key required)

Three fixture tweets include hardcoded `data-feed-rubric-scores` so you can demo the hide loop without a key:

```bash
npm test          # jsdom smoke: hide loop, no network
npm run fixture   # serve fixtures/ on :8080
```

Open [http://127.0.0.1:8080/timeline.html](http://127.0.0.1:8080/timeline.html). Tweets 1–3 should hide at the default threshold; the rest stay visible.

## Architecture

```
content script (x.com + fixtures)
  → extract text + post id
  → chrome.runtime.sendMessage
service worker
  → cache (memory + chrome.storage.session)
  → rate limit (~40 calls/min, fail open over cap)
  → POST Jev systemone (one call, one noul per enabled category)
  → { hide, reasons, scores }
content script
  → [data-feed-rubric-hide] or leave visible
```

x.com selectors live in `src/sites/x.ts` and are expected to break.

## Development

```bash
npm install
npm test           # vitest + jsdom hide-loop smoke (no network)
npm run build      # compile TS → extension/
npm run watch      # rebuild on change
npm run fixture    # serve fixtures/ on :8080
```

Source layout:

- `src/jev.ts` — thin fetch wrapper for System One
- `src/categories.ts` — defaults, noul criteria, settings helpers
- `src/sites/x.ts` — x.com DOM adapter (documented selectors, fail-open)
- `src/score.ts` / `src/hide.ts` — pure score evaluation and hide attribute
- `extension/` — loadable unpacked extension (built artifacts)
- `fixtures/timeline.html` — 8 fake tweets for local testing
- `test/hide-loop.test.ts` — fixture hide-loop smoke

## License

MIT — Copyright (c) 2026 Andrew Heim / [andepants](https://github.com/andepants)
