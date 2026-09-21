import type { Category } from "./categories.js";
import { isRecord } from "./guard.js";
import { CLASSIFY_TIMEOUT_MS } from "./limits.js";

export const JEV_MODEL = "jev-1.13.0";
export const SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";

/** Noul answers below this distance from 0.5 are treated as ambiguous (fail open). */
export const AMBIGUITY_MARGIN = 0.15;

export interface PostState {
  author: string;
  text: string;
}

export interface NoulAnswer {
  type: "noul";
  noul: number;
}

export interface NoulQuestion {
  type: "noul";
  instructions: string;
  criteria: {
    true: string;
    false: string;
  };
}

export interface SystemOneResponse {
  model: string;
  answers: Record<string, NoulAnswer>;
}

export function buildQuestions(categories: Category[]): Record<string, NoulQuestion> {
  const questions: Record<string, NoulQuestion> = {};
  for (const cat of categories) {
    if (!cat.enabled) continue;
    questions[cat.id] = {
      type: "noul",
      instructions: cat.instructions,
      criteria: {
        true: cat.criteria.true,
        false: cat.criteria.false,
      },
    };
  }
  return questions;
}

export function parseNoulAnswer(value: unknown): NoulAnswer | null {
  if (!isRecord(value)) return null;
  if (value.type !== "noul") return null;
  if (typeof value.noul !== "number" || !Number.isFinite(value.noul)) return null;
  return { type: "noul", noul: value.noul };
}

export function parseSystemOneResponse(value: unknown): SystemOneResponse {
  if (!isRecord(value)) {
    throw new Error("invalid_jev_response");
  }

  const answersRaw = value.answers;
  if (!isRecord(answersRaw)) {
    throw new Error("invalid_jev_answers");
  }

  const answers: Record<string, NoulAnswer> = {};
  for (const [id, answer] of Object.entries(answersRaw)) {
    const parsed = parseNoulAnswer(answer);
    if (parsed) answers[id] = parsed;
  }

  const model = typeof value.model === "string" ? value.model : "";
  if (model !== JEV_MODEL) {
    throw new Error("unexpected_jev_model");
  }
  return { model, answers };
}

export async function classifyPost(
  apiKey: string,
  state: PostState,
  categories: Category[],
): Promise<SystemOneResponse> {
  const questions = buildQuestions(categories);
  if (Object.keys(questions).length === 0) {
    return { model: JEV_MODEL, answers: {} };
  }

  const res = await fetch(SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state, model: JEV_MODEL, questions }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Jev API ${res.status}`);
  }

  const payload: unknown = await res.json();
  return parseSystemOneResponse(payload);
}

export function isConfidentYes(noul: number): boolean {
  return Math.abs(noul - 0.5) > AMBIGUITY_MARGIN;
}
