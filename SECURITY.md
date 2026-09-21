# Security

Defensive notes for this owned MV3 extension. Not an exploit write-up.

## Threat model (short)

| Question | Answer |
| --- | --- |
| Where could a TypeSafe API key leak? | It is stored in `chrome.storage.local` and read only by the service worker (and the options page the user typed it into). It is never hardcoded, never in classify responses, and never sent to content scripts. `fetch` uses `credentials: "omit"` so console.typesafe.ai cookies are not attached. |
| Could a malicious page read `chrome.storage`? | No. Content scripts run in an isolated world; page JS cannot call `chrome.*`. The content script does not read storage at all. |
| Content-script isolation? | Default isolated world (no `world: "MAIN"`). No `window.postMessage` bridge. Undo listens with `event.isTrusted`. |
| Host permissions overreach? | Production: only `https://api.typesafe.ai/*`. x.com injection uses `content_scripts.matches`. Loopback matches are **not** in the store/production manifest; `npm run build:fixture` adds `http://127.0.0.1:18080/*` for local smoke. |
| Cache poisoning? | Dry-run `data-feed-rubric-scores` are accepted only from `http://127.0.0.1:18080`, verified from `sender.url`. Live hosts cannot spoof fixture scores. Fixture hosts never call TypeSafe. |
| XSS via tweet text? | Hide/Undo UI is built with `createElement` + `textContent`. Tweet body is not interpolated into HTML. |

## Findings → mitigations

| Severity | Finding | Mitigation |
| --- | --- | --- |
| High | Fixture scores were trusted from any classify message, so a page that can set `data-feed-rubric-scores` (x.com page JS) could skip Jev and poison the session cache. | Service worker sets `allowFixture` from sender origin; x.com fixture payloads are dropped. |
| High | Localhost content scripts could spend the user's TypeSafe quota. | Fixture origins never take the API path. Production manifest has no loopback matches; fixture builds pin `127.0.0.1:18080` only. |
| High | `host_permissions` included x.com, twitter.com, and all localhost HTTP. | Host permission is TypeSafe only. Sourcemaps are not shipped in production builds. |
| Medium | Classify `fetch` could attach cookies; API error bodies were stored/logged. | `credentials: "omit"`, `referrerPolicy: "no-referrer"`, status-only errors, token redaction. |
| Medium | `chrome.runtime.onMessage` did not check sender; content scripts could clear cache. | Classify allowlist; `clearCache` only from `chrome-extension://<id>/`. |
| Medium | Options built category fields with `innerHTML`. | DOM APIs only; last-error uses `textContent`. |
| Low | Undo row could disappear if the host rewrote article children. | Remount placeholder from stored reasons. Untrusted synthetic clicks ignored. |

## Fail-open (do not regress)

Errors, missing key, rate limit, ambiguous noul, untrusted sender, malformed post id, and fixture-without-scores **must leave the post visible**.

## Out of scope here

Firefox, extra sites, a backend, or publishing exploit PoCs. Live x.com still needs a manual smoke with your own account.
