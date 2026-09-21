import { describe, expect, it } from "vitest";
import { JEV_MODEL, parseSystemOneResponse } from "../src/jev.js";

describe("parseSystemOneResponse", () => {
  it("accepts a pinned jev model and noul answers", () => {
    const parsed = parseSystemOneResponse({
      model: JEV_MODEL,
      answers: {
        rage_bait: { type: "noul", noul: 0.92 },
      },
    });
    expect(parsed.model).toBe(JEV_MODEL);
    expect(parsed.answers.rage_bait?.noul).toBe(0.92);
  });

  it("rejects unexpected models (fail open upstream)", () => {
    expect(() =>
      parseSystemOneResponse({
        model: "other-model",
        answers: { rage_bait: { type: "noul", noul: 0.99 } },
      }),
    ).toThrow("unexpected_jev_model");
  });

  it("rejects missing model strings", () => {
    expect(() =>
      parseSystemOneResponse({
        answers: { rage_bait: { type: "noul", noul: 0.99 } },
      }),
    ).toThrow("unexpected_jev_model");
  });
});
