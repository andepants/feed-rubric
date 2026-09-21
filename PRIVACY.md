# Privacy policy — feed-rubric

Last updated: September 2026

feed-rubric is an open-source Chrome extension (MIT). It filters posts on X (Twitter) using rubric categories you define. This document describes what data the extension handles.

## Summary

- **No telemetry.** The extension does not phone home, run analytics, or use a backend operated by the authors.
- **Bring your own key (BYOK).** You supply a TypeSafe API key. It is stored locally in `chrome.storage.local` on your device.
- **Fail open.** Errors never hide posts silently; when classification fails, posts stay visible.

## Data stored on your device

| Data | Where | Purpose |
| --- | --- | --- |
| TypeSafe API key | `chrome.storage.local` | Authenticate HTTPS calls to TypeSafe from the service worker |
| Rubric categories, threshold, enabled flag | `chrome.storage.local` | Your filtering preferences |
| Cached noul scores | Service worker memory + `chrome.storage.session` | Avoid re-scoring the same post for the same rubric |
| Last classify error | `chrome.storage.local` | Shown on the options page for troubleshooting |

The API key is never sent to content scripts or to any server other than `https://api.typesafe.ai`.

## Data sent to TypeSafe (when you configure a key)

When a post is classified on x.com or twitter.com:

- **Post text** extracted from the visible tweet
- **Author handle** (e.g. `@username`), when available
- **Your category instructions and true/false criteria** for enabled categories

Requests use HTTPS to `https://api.typesafe.ai/v1/systemone` with `credentials: "omit"` (no browser cookies attached).

## Data not collected or transmitted

- Cookies or X/Twitter login sessions
- DMs or non-timeline content
- Full page HTML, images, or media
- Browsing history outside matched timeline pages
- Any data to servers other than TypeSafe (when you use your key)

## Local fixture testing

When you run the bundled fixture timeline on `http://127.0.0.1:18080`, scores can come from embedded fixture data without calling TypeSafe. Production/store builds do not inject into localhost.

## Your controls

- **Pause filtering** — disable “Enable feed filtering” in options; no classify requests are sent.
- **Remove your key** — clear the API key field and save.
- **Clear cache** — options page removes cached scores.
- **Uninstall** — removes extension storage from Chrome.

## Contact

Project home: [github.com/andepants/feed-rubric](https://github.com/andepants/feed-rubric)

Report security issues per [SECURITY.md](SECURITY.md).
