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

Three editable, disable-able categories ship by default (threshold **0.75**):

| ID | What it catches |
| --- | --- |
| `rage_bait` | Posts written to provoke outrage or pile-ons rather than inform |
| `crypto_promo` | Token/exchange/wallet shilling (not neutral policy news) |
| `unsolicited_politics` | Partisan arguments or campaign messages (not neutral headlines) |

Change instructions, threshold, or toggles on the **options page** (right-click extension icon → Options, or open from the popup).

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

## Fixture timeline (no API key required)

Three fixture tweets include hardcoded `data-feed-rubric-scores` so you can demo the hide loop without a key:

```bash
npm run fixture
```

Open [http://127.0.0.1:8080/timeline.html](http://127.0.0.1:8080/timeline.html). Tweets 1–3 should hide at the default threshold; the rest stay visible. Enable **Debug** in settings to see a faint chip on hidden posts (click to unhide).

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
npm run build      # compile TS → extension/
npm run watch      # rebuild on change
npm run fixture    # serve fixtures/ on :8080
```

Source layout:

- `src/jev.ts` — thin fetch wrapper for System One
- `src/categories.ts` — defaults and settings helpers
- `src/sites/x.ts` — x.com DOM adapter
- `extension/` — loadable unpacked extension (built artifacts)
- `fixtures/timeline.html` — 8 fake tweets for local testing

## License

MIT — Copyright (c) 2026 Andrew Heim / [andepants](https://github.com/andepants)
