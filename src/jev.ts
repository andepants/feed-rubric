import type { Category } from "./categories.js";

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

export interface SystemOneResponse {
  model: string;
  answers: Record<string, NoulAnswer>;
}

export function buildQuestions(categories: Category[]): Record<string, object> {
  const questions: Record<string, object> = {};
  for (const cat of categories) {
    if (!cat.enabled) continue;
    questions[cat.id] = {
      type: "noul",
      instructions: cat.instructions,
      criteria: {
        true: "The condition described in the instructions applies to this post.",
        false: "The condition does not apply.",
      },
    };
  }
  return questions;
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
  });

  if (!res.ok) {
    throw new Error(`Jev API ${res.status}: ${await res.text()}`);
  }

  return (await res.json()) as SystemOneResponse;
}

export function isConfidentYes(noul: number): boolean {
  return Math.abs(noul - 0.5) > AMBIGUITY_MARGIN;
}
