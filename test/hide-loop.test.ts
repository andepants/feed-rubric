import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_THRESHOLD,
  enabledCategoryIds,
  normalizeCategories,
} from "../src/categories.js";
import { applyHideState, isHidden, createPlaceholder, UNDO_CLASS } from "../src/hide.js";
import { buildQuestions } from "../src/jev.js";
import { evaluateScores, parseFixtureScores } from "../src/score.js";
import {
  extractAuthor,
  extractPostId,
  extractText,
  findTweetArticles,
  parseStatusId,
} from "../src/sites/x.js";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "timeline.html",
);

function loadFixtureDocument(): Document {
  const html = readFileSync(fixturePath, "utf8");
  return new JSDOM(html).window.document;
}

function applyHideLoop(document: Document): HTMLElement[] {
  const articles = findTweetArticles(document);
  const enabledIds = enabledCategoryIds(DEFAULT_CATEGORIES);

  for (const article of articles) {
    const scores = parseFixtureScores(article.dataset.feedRubricScores);
    if (!scores) {
      applyHideState({ article, hide: false });
      continue;
    }
    const result = evaluateScores({
      scores,
      enabledIds,
      threshold: DEFAULT_THRESHOLD,
    });
    applyHideState({ article, hide: result.hide });
  }

  return articles;
}

describe("fixture hide loop", () => {
  it("hides tweets 1–3 and leaves the rest visible, without network", () => {
    const articles = applyHideLoop(loadFixtureDocument());
    expect(articles).toHaveLength(8);

    const hiddenIds = articles.filter(isHidden).map((article) => extractPostId(article));
    expect(hiddenIds).toEqual([
      "1000000000000000001",
      "1000000000000000002",
      "1000000000000000003",
    ]);

    const visibleIds = articles
      .filter((article) => !isHidden(article))
      .map((article) => extractPostId(article));
    expect(visibleIds).toEqual([
      "1000000000000000004",
      "1000000000000000005",
      "1000000000000000006",
      "1000000000000000007",
      "1000000000000000008",
    ]);
  });

  it("extracts post id, author, and text from fixture articles", () => {
    const articles = findTweetArticles(loadFixtureDocument());
    const first = articles[0];
    expect(first).toBeDefined();
    if (!first) return;

    expect(extractPostId(first)).toBe("1000000000000000001");
    expect(extractAuthor(first)).toBe("@outrage_bot");
    expect(extractText(first)).toMatch(/furious/i);
  });
});

describe("x.com adapter fail-open", () => {
  it("returns null post id when permalink nodes are missing", () => {
    const document = new JSDOM(
      `<article data-testid="tweet"><div data-testid="tweetText">hello</div></article>`,
    ).window.document;
    const article = findTweetArticles(document)[0];
    expect(article).toBeDefined();
    if (!article) return;
    expect(extractPostId(article)).toBeNull();
    expect(extractPostId(null)).toBeNull();
    expect(extractText(null)).toBe("");
    expect(extractAuthor(null)).toBe("@unknown");
  });

  it("falls back through the selector chain when testids are missing", () => {
    const document = new JSDOM(`
      <article role="article">
        <a href="/fallback_user">Fallback</a>
        <a href="/fallback_user/status/4242">permalink</a>
        <div lang="en">body via lang fallback</div>
      </article>
    `).window.document;
    const article = findTweetArticles(document)[0];
    expect(article).toBeDefined();
    if (!article) return;
    expect(extractPostId(article)).toBe("4242");
    expect(extractText(article)).toMatch(/lang fallback/i);
  });

  it("parses a status id from a permalink href", () => {
    expect(parseStatusId("/outrage_bot/status/1000000000000000001")).toBe(
      "1000000000000000001",
    );
    expect(parseStatusId("/home")).toBeNull();
  });
});

describe("evaluateScores", () => {
  const enabledIds = enabledCategoryIds(DEFAULT_CATEGORIES);

  it("hides only when a score is over threshold and not ambiguous", () => {
    const hidden = evaluateScores({
      scores: { rage_bait: 0.92, crypto_promo: 0.08 },
      enabledIds,
      threshold: DEFAULT_THRESHOLD,
    });
    expect(hidden.hide).toBe(true);
    expect(hidden.reasons).toEqual(["rage_bait"]);

    const ambiguous = evaluateScores({
      scores: { rage_bait: 0.52, crypto_promo: 0.48 },
      enabledIds,
      threshold: DEFAULT_THRESHOLD,
    });
    expect(ambiguous.hide).toBe(false);
    expect(ambiguous.reasons).toEqual([]);
  });
});

describe("default noul categories", () => {
  it("fills missing criteria on stored categories and sends true/false to Jev", () => {
    const restored = normalizeCategories([
      {
        id: "rage_bait",
        name: "Rage bait",
        enabled: true,
        instructions: "old instruction text",
      },
    ]);
    expect(restored[0]?.criteria.true.length).toBeGreaterThan(0);
    expect(restored[0]?.criteria.false.length).toBeGreaterThan(0);

    const questions = buildQuestions(DEFAULT_CATEGORIES);
    expect(questions.rage_bait?.type).toBe("noul");
    expect(questions.rage_bait?.criteria.true).toMatch(/inflame/i);
    expect(questions.crypto_promo?.criteria.false).toMatch(/not a promo/i);
    expect(questions.unsolicited_politics?.criteria.false).toMatch(/neutral/i);
  });
});

describe("placeholder row", () => {
  it("builds a slim Undo control without removing the article", () => {
    const document = new JSDOM(
      `<article data-testid="tweet"><div data-testid="tweetText">keep</div></article>`,
    ).window.document;
    const article = findTweetArticles(document)[0];
    expect(article).toBeDefined();
    if (!article) return;
    applyHideState({ article, hide: true });
    article.prepend(
      createPlaceholder({
        document,
        reasons: ["rage_bait"],
      }),
    );
    expect(isHidden(article)).toBe(true);
    expect(article.querySelector(`.${UNDO_CLASS}`)?.textContent).toBe("Undo");
    expect(article.textContent).toMatch(/Hidden · rage_bait/);
  });
});
