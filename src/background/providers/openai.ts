import { readSse } from "../../shared/sse";
import { failFromResponse, isAbort, ProviderError, scrub, SourceList } from "./common";
import type { ProviderCallbacks, ProviderRequest, ProviderResult } from "./common";

const BASE = "https://api.openai.com/v1";
/** Reasoning models take `reasoning.effort`; older chat models reject it. */
const REASONING_MODELS = /^(gpt-5|gpt-6|o\d)/;

interface Annotation {
  type: string;
  url?: string;
  title?: string;
}

interface OutputItem {
  type: string;
  content?: { type: string; annotations?: Annotation[] }[];
}

interface ResponseObject {
  model?: string;
  status?: string;
  output?: OutputItem[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; code?: string } | null;
}

interface StreamEvent {
  type: string;
  delta?: string;
  item?: OutputItem;
  annotation?: Annotation;
  response?: ResponseObject;
  message?: string;
  code?: string;
}

export async function runOpenAI(req: ProviderRequest, cb: ProviderCallbacks): Promise<ProviderResult> {
  const content: Record<string, string>[] = [{ type: "input_text", text: req.user }];
  for (const url of req.images) content.push({ type: "input_image", image_url: url });

  const body: Record<string, unknown> = {
    model: req.model.id,
    instructions: req.system,
    input: [{ role: "user", content }],
    stream: true,
    store: false,
    max_output_tokens: req.maxTokens,
  };
  if (req.useWeb) body.tools = [{ type: "web_search" }];
  if (REASONING_MODELS.test(req.model.id)) body.reasoning = { effort: req.depth === "light" ? "low" : "medium" };

  let res: Response;
  try {
    res = await fetch(`${BASE}/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${req.apiKey}` },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (err) {
    throw new ProviderError(isAbort(err) ? "aborted" : "network");
  }
  if (!res.ok || !res.body) await failFromResponse(res);

  const sources = new SourceList(cb.onSource);
  let text = "";
  let final: ResponseObject | null = null;

  try {
    for await (const sse of readSse(res.body!)) {
      if (!sse.data || sse.data === "[DONE]") continue;
      const event = JSON.parse(sse.data) as StreamEvent;
      switch (event.type) {
        case "response.output_item.added":
          if (event.item?.type === "reasoning") cb.onStatus("thinking");
          else if (event.item?.type === "web_search_call") cb.onStatus("searching");
          else if (event.item?.type === "message") {
            cb.onStatus("writing");
            if (text) {
              text += "\n\n";
              cb.onText("\n\n");
            }
          }
          break;
        case "response.web_search_call.searching":
          cb.onStatus("searching");
          break;
        case "response.output_text.delta":
          if (event.delta) {
            text += event.delta;
            cb.onText(event.delta);
          }
          break;
        case "response.output_text.annotation.added":
          if (event.annotation?.type === "url_citation" && event.annotation.url) {
            sources.add(event.annotation.url, event.annotation.title);
          }
          break;
        case "response.completed":
        case "response.incomplete":
          final = event.response ?? null;
          break;
        case "response.failed":
          throw new ProviderError("server", scrub(event.response?.error?.message ?? ""));
        case "error":
          throw new ProviderError(event.code === "insufficient_quota" ? "billing" : "server", scrub(event.message ?? ""));
      }
    }
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(isAbort(err) ? "aborted" : "network");
  }

  for (const item of final?.output ?? []) {
    for (const part of item.content ?? []) {
      for (const a of part.annotations ?? []) if (a.type === "url_citation" && a.url) sources.add(a.url, a.title);
    }
  }
  const usage = final?.usage;
  return {
    text,
    sources: sources.list,
    model: final?.model ?? req.model.id,
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      webSearches: (final?.output ?? []).filter((o) => o.type === "web_search_call").length,
    },
  };
}

export async function listOpenAIModels(apiKey: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${apiKey}` } });
  } catch {
    throw new ProviderError("network");
  }
  if (!res.ok) await failFromResponse(res);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}
