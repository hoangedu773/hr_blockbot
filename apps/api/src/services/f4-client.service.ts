import { F4InternalRequestSchema, F4InternalResponseSchema, type F4InternalRequest } from "@hr-blockbot/contracts";

/** Dedicated local read-only worker; never reuses chatbot, provider or Jev transport. */
export async function semanticCandidates(input: F4InternalRequest) {
  const origin = process.env.F4_WORKER_ORIGIN, key = process.env.F4_SERVICE_KEY;
  if (!origin || !key || key.length < 32) throw new Error("F4_NOT_CONFIGURED");
  const url = new URL(origin);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("F4_INVALID_ORIGIN");
  const body = F4InternalRequestSchema.parse(input);
  const response = await fetch(new URL("/rank", url), { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json", "x-f4-service-key": key }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error("F4_WORKER_UNAVAILABLE");
  const reader = response.body?.getReader(); if (!reader) throw new Error("F4_INVALID_RESPONSE");
  let data = "", bytes = 0;
  try { const decoder = new TextDecoder(); for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength;
    if (bytes > 512000) throw new Error("F4_RESPONSE_TOO_LARGE"); data += decoder.decode(part.value, { stream: true }); } data += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  const result = F4InternalResponseSchema.parse(JSON.parse(data));
  const ids = new Set(body.candidates.map((candidate) => candidate.id));
  if (result.requestId !== body.requestId || result.items.length !== ids.size || new Set(result.items.map((item) => item.id)).size !== ids.size || result.items.some((item) => !ids.has(item.id))) throw new Error("F4_FOREIGN_CANDIDATE");
  for (const item of result.items) { const skills = body.candidates.find((candidate) => candidate.id === item.id)!.skills;
    if (item.pairs.length !== body.requiredSkills.length || item.pairs.some((pair, index) => pair.required !== body.requiredSkills[index] || pair.matched !== null && !skills.includes(pair.matched) || pair.matched === null && pair.cosine !== 0)) throw new Error("F4_FABRICATED_SKILL");
    if (Math.abs(item.semanticScore - item.pairs.reduce((sum, pair) => sum + pair.cosine, 0) / body.requiredSkills.length) > 1e-6) throw new Error("F4_INCONSISTENT_SCORE"); }
  return result;
}
