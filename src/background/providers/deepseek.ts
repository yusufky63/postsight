import { readSse } from "../../shared/sse";
import { codeForStatus, isAbort, messageFromBody, ProviderError } from "./common";
import type { ProviderCallbacks, ProviderRequest, ProviderResult } from "./common";

const BASE = "https://api.deepseek.com";

interface Chunk {
  model?: string;
  choices?: { delta?: { content?: string | null; reasoning_content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number } | null;
}

async function post(req: ProviderRequest, withThinking: boolean): Promise<Response> {
  const body: Record<string, unknown> = {
    model: req.model.id,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: req.maxTokens,
  };
  // Thinking is on by default; light jobs switch it off to save time and tokens.
  if (withThinking) body.thinking = { type: req.depth === "light" ? "disabled" : "enabled" };
  try {
    return await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (err) {
    throw new ProviderError(isAbort(err) ? "aborted" : "network");
  }
}

export async function runDeepSeek(req: ProviderRequest, cb: ProviderCallbacks): Promise<ProviderResult> {
  let res = await post(req, true);
  if (res.status === 400) {
    // A model that does not know the thinking switch gets one retry without it.
    const body = await res.text();
    if (!/thinking/i.test(body)) throw new ProviderError(codeForStatus(400, body), messageFromBody(body));
    res = await post(req, false);
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(codeForStatus(res.status, body), messageFromBody(body));
  }

  let text = "";
  let thinking = false;
  let model = req.model.id;
  let usage: Chunk["usage"] = null;

  try {
    for await (const sse of readSse(res.body)) {
      if (!sse.data || sse.data === "[DONE]") continue;
      const chunk = JSON.parse(sse.data) as Chunk;
      if (chunk.model) model = chunk.model;
      if (chunk.usage) usage = chunk.usage;
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.reasoning_content && !thinking) {
        thinking = true;
        cb.onStatus("thinking");
      }
      if (delta?.content) {
        if (!text) cb.onStatus("writing");
        text += delta.content;
        cb.onText(delta.content);
      }
    }
  } catch (err) {
    throw new ProviderError(isAbort(err) ? "aborted" : "network");
  }

  return {
    text,
    sources: [],
    model,
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      cachedInputTokens: usage?.prompt_cache_hit_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      webSearches: 0,
    },
  };
}

async function getJson<T>(path: string, apiKey: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${apiKey}` } });
  } catch {
    throw new ProviderError("network");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(codeForStatus(res.status, body), messageFromBody(body));
  }
  return (await res.json()) as T;
}

export async function listDeepSeekModels(apiKey: string): Promise<string[]> {
  const json = await getJson<{ data?: { id: string }[] }>("/models", apiKey);
  return (json.data ?? []).map((m) => m.id);
}

export async function deepSeekBalance(apiKey: string): Promise<{ currency: string; total: string }[]> {
  const json = await getJson<{ balance_infos?: { currency: string; total_balance: string }[] }>("/user/balance", apiKey);
  return (json.balance_infos ?? []).map((b) => ({ currency: b.currency, total: b.total_balance }));
}
