import { isRecord } from "./guard.js";

export interface ClassifyRequest {
  type: "classify";
  platform: string;
  postId: string;
  author: string;
  text: string;
  fixtureScores?: Record<string, number>;
}

export interface ClassifyResult {
  hide: boolean;
  reasons: string[];
  scores: Record<string, number>;
  cached?: boolean;
  rateLimited?: boolean;
  error?: string;
}

export interface ClassifyResponse {
  type: "classifyResult";
  postId: string;
  result: ClassifyResult;
}

export interface ClearCacheRequest {
  type: "clearCache";
}

export interface CacheClearedResponse {
  type: "cacheCleared";
  cleared: number;
}

export type ExtensionRequest = ClassifyRequest | ClearCacheRequest;

export function isClassifyRequest(message: unknown): message is ClassifyRequest {
  if (!isRecord(message)) return false;
  return (
    message.type === "classify" &&
    typeof message.platform === "string" &&
    typeof message.postId === "string" &&
    typeof message.author === "string" &&
    typeof message.text === "string"
  );
}

export function isClearCacheRequest(message: unknown): message is ClearCacheRequest {
  return isRecord(message) && message.type === "clearCache";
}
