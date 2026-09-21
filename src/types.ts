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
