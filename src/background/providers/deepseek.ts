import { runMessages } from "./anthropic";
import type { MessagesEndpoint } from "./anthropic";
import { codeForStatus, messageFromBody, ProviderError } from "./common";
import type { ProviderCallbacks, ProviderRequest, ProviderResult } from "./common";

const BASE = "https://api.deepseek.com";

/*
 * Answers go through DeepSeek's Anthropic-compatible Messages API rather than its chat
 * completions: there the model can run DeepSeek's own web search as a server-side tool and
 * read images, and results come back as the same blocks Claude's do. The model list
 * and the balance stay on DeepSeek's native endpoints.
 */
const DEEPSEEK: MessagesEndpoint = {
  baseURL: `${BASE}/anthropic`,
  webSearch: (_model, maxUses) => ({ type: "web_search_20250305", name: "web_search", max_uses: maxUses }),
  // Thinking is on by default; light jobs switch it off to save time and tokens.
  reasoning: (_model, depth) => (depth === "light" ? { thinking: { type: "disabled" } } : {}),
  fallback: () => false,
  // DeepSeek answers "Failed to download image" for any image URL, X's own included.
  inlineImages: true,
};

export function runDeepSeek(req: ProviderRequest, cb: ProviderCallbacks): Promise<ProviderResult> {
  return runMessages(req, cb, DEEPSEEK);
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
