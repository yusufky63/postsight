import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlockParam, BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Source } from "../../shared/types";
import { codeForStatus, ProviderError, scrub, SourceList } from "./common";
import type { ProviderCallbacks, ProviderRequest, ProviderResult } from "./common";

/** Models that take the dynamic-filtering web search tool; older ones keep the basic variant. */
const DYNAMIC_WEB_SEARCH = /^claude-(opus-(5-5|5|4-[678])|sonnet-(5-5|5|4-6))$/;
/** Models that accept output_config.effort (4.6 and newer). */
const EFFORT_MODELS = /^claude-(opus|sonnet|haiku|fable|mythos)-(5|4-[6-9])/;
/** Models with server-side refusal fallback; Haiku 5.5 has none. */
const FALLBACK_MODELS = /^claude-(opus-5-5|opus-5|sonnet-5-5|fable-5-1|fable-5)$/;

function client(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
    maxRetries: 1,
    defaultHeaders: { "anthropic-dangerous-direct-browser-access": "true" },
  });
}

/**
 * Light jobs (translate, summarize) run at low effort; on Haiku 5.5 thinking is
 * switched off entirely, which it allows at that effort. Opus 5.5 and Sonnet 5.5
 * cannot turn thinking off, so effort is the only dial there.
 */
function reasoning(model: string, depth: "light" | "deep") {
  if (!EFFORT_MODELS.test(model)) return {};
  const effort = depth === "light" ? ("low" as const) : ("medium" as const);
  if (model.startsWith("claude-haiku-5") && depth === "light") {
    return { thinking: { type: "disabled" as const }, output_config: { effort } };
  }
  return { output_config: { effort } };
}

function toError(err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new ProviderError("aborted");
  if (err instanceof Anthropic.APIConnectionError) return new ProviderError("network");
  if (err instanceof Anthropic.APIError) {
    const message = scrub(err.message);
    return new ProviderError(codeForStatus(err.status ?? 0, message), message);
  }
  return new ProviderError("unknown", err instanceof Error ? scrub(err.message) : undefined);
}

export async function runAnthropic(req: ProviderRequest, cb: ProviderCallbacks): Promise<ProviderResult> {
  const content: BetaContentBlockParam[] = req.images.map((url) => ({ type: "image", source: { type: "url", url } }));
  content.push({ type: "text", text: req.user });

  const tools: BetaToolUnion[] = req.useWeb
    ? [
        DYNAMIC_WEB_SEARCH.test(req.model.id)
          ? { type: "web_search_20260209", name: "web_search", max_uses: req.maxSearches }
          : { type: "web_search_20250305", name: "web_search", max_uses: req.maxSearches },
      ]
    : [];
  const fallback = FALLBACK_MODELS.test(req.model.id);

  const sources = new SourceList(cb.onSource);
  const searchResults: Source[] = [];
  let text = "";

  try {
    const stream = client(req.apiKey).beta.messages.stream(
      {
        model: req.model.id,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user", content }],
        ...(tools.length ? { tools } : {}),
        ...reasoning(req.model.id, req.depth),
        ...(fallback ? { fallbacks: "default" as const, betas: ["server-side-fallback-2026-07-01"] } : {}),
      },
      { signal: req.signal },
    );

    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const block = event.content_block;
        if (block.type === "thinking" || block.type === "redacted_thinking") cb.onStatus("thinking");
        else if (block.type === "server_tool_use") {
          cb.onStatus("searching");
          // Text written before a search is narration ("let me look this up"), not the answer.
          if (text) {
            text = "";
            cb.onReset();
          }
        } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const r of block.content) searchResults.push({ url: r.url, title: r.title });
        } else if (block.type === "text") {
          cb.onStatus("writing");
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          text += event.delta.text;
          cb.onText(event.delta.text);
        } else if (event.delta.type === "citations_delta" && event.delta.citation.type === "web_search_result_location") {
          sources.add(event.delta.citation.url, event.delta.citation.title);
        }
      }
    }

    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new ProviderError("refusal");

    if (sources.list.length === 0) for (const r of searchResults.slice(0, 5)) sources.add(r.url, r.title);
    const u = final.usage;
    const cached = u.cache_read_input_tokens ?? 0;
    return {
      text,
      sources: sources.list,
      model: final.model,
      usage: {
        inputTokens: (u.input_tokens ?? 0) + cached + (u.cache_creation_input_tokens ?? 0),
        cachedInputTokens: cached,
        outputTokens: u.output_tokens ?? 0,
        webSearches: u.server_tool_use?.web_search_requests ?? 0,
      },
    };
  } catch (err) {
    throw toError(err);
  }
}

export async function listAnthropicModels(apiKey: string): Promise<string[]> {
  try {
    const page = await client(apiKey).models.list({ limit: 100 });
    return page.data.map((m) => m.id);
  } catch (err) {
    throw toError(err);
  }
}
