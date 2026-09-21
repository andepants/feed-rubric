import { isRecord } from "./guard.js";

export const LAST_ERROR_KEY = "lastError";

export interface LastError {
  message: string;
  at: number;
}

export function parseLastError(value: unknown): LastError | null {
  if (!isRecord(value)) return null;
  const message = value.message;
  const at = value.at;
  if (typeof message !== "string" || message.length === 0) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return { message, at };
}

export function formatLastError(error: LastError | null): string {
  if (!error) return "No errors recorded.";
  return `${new Date(error.at).toLocaleString()} — ${humanizeError(error.message)}`;
}

export function humanizeError(message: string): string {
  switch (message) {
    case "no_api_key":
      return "No TypeSafe API key — posts stay visible (fail open).";
    case "rate_limited":
      return "Rate limited (~40 calls/min) — posts stay visible (fail open).";
    default:
      return message;
  }
}
