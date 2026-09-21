# feed-rubric

Chrome MV3 extension: user-defined categories, Jev noul per post, hide if over threshold.

## Constraints

- Jev is not a chatbot. Typed questions only. Pin `jev-1.13.0`.
- One HTTP call per post, many noul questions in parallel. Combine in code.
- API key only in the service worker / chrome.storage.local. Never hardcoded.
- Fail open: errors, low confidence, rate limit → show the post.
- x.com selectors live in one file and are allowed to break.
- No backend. No ads. No extra sites until the X/fixture loop is boring.
- Install TypeSafe skill: `npx skills add typesafe-ai/skills --skill typesafe-ai`
- Prove the hide loop locally: `npm test` (vitest + Playwright fixture smoke; no X login). `npm test` builds with `--fixture` so the unpacked extension injects on `127.0.0.1:18080`. Production `npm run build` does not.

## Product rule

The rubric (category instructions + threshold) is the product. Do not add a generative summary, a digest, or a social graph.
