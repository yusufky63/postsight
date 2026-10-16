import type { ModelInfo, ProviderId, Tier } from "./types";

/** Date the built-in prices were checked against each provider's pricing page. */
export const PRICES_CHECKED = "2026-10-16";

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  deepseek: "DeepSeek",
};

export const PROVIDER_KEY_URL: Record<ProviderId, string> = {
  anthropic: "https://platform.claude.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  deepseek: "https://platform.deepseek.com/api_keys",
};

/** USD per web search call, billed on top of tokens. */
export const WEB_SEARCH_PRICE: Record<ProviderId, number> = {
  anthropic: 0.01,
  openai: 0.01,
  deepseek: 0,
};

const m = (
  provider: ProviderId,
  id: string,
  label: string,
  tier: Tier,
  [inputPrice, cachedInputPrice, outputPrice]: [number, number, number],
  vision: boolean,
  webSearch: boolean,
): ModelInfo => ({ id, provider, label, tier, inputPrice, cachedInputPrice, outputPrice, vision, webSearch, priceKnown: true });

/**
 * Built-in models. DeepSeek prices are the off-peak rates; peak hours cost double
 * and are applied in pricing.ts.
 */
export const CATALOG: readonly ModelInfo[] = [
  m("anthropic", "claude-haiku-5-5", "Claude Haiku 5.5", "fast", [0.1, 0.01, 0.5], true, true),
  m("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", "balanced", [2, 0.2, 10], true, true),
  m("anthropic", "claude-opus-5-5", "Claude Opus 5.5", "best", [4, 0.2, 20], true, true),
  m("anthropic", "claude-fable-5-1", "Claude Fable 5.1", "best", [10, 0.25, 50], true, true),
  m("openai", "gpt-6-luna", "GPT-6 Luna", "fast", [0.1, 0.01, 0.5], true, true),
  m("openai", "gpt-6.1-sol", "GPT-6.1 Sol", "balanced", [2, 0.1, 10], true, true),
  m("openai", "gpt-6-astra", "GPT-6 Astra", "best", [10, 1, 50], true, true),
  m("openai", "gpt-5.5", "GPT-5.5", "best", [5, 0.5, 30], true, true),
  m("deepseek", "deepseek-flash", "DeepSeek Flash", "fast", [0.15, 0.003, 0.6], false, false),
  m("deepseek", "deepseek-v4-pro", "DeepSeek V4 Pro", "balanced", [0.66, 0.022, 1.98], false, false),
];

export const DEFAULT_TIERS: Record<ProviderId, Record<Tier, string>> = {
  anthropic: { fast: "claude-haiku-5-5", balanced: "claude-sonnet-5-5", best: "claude-opus-5-5" },
  openai: { fast: "gpt-6-luna", balanced: "gpt-6.1-sol", best: "gpt-6-astra" },
  deepseek: { fast: "deepseek-flash", balanced: "deepseek-v4-pro", best: "deepseek-v4-pro" },
};

/** Catalog plus user models; a user entry with the same id replaces the built-in one. */
export function allModels(custom: readonly ModelInfo[]): ModelInfo[] {
  const byId = new Map<string, ModelInfo>();
  for (const model of CATALOG) byId.set(`${model.provider}:${model.id}`, model);
  for (const model of custom) byId.set(`${model.provider}:${model.id}`, model);
  return [...byId.values()];
}

export function findModel(models: readonly ModelInfo[], provider: ProviderId, id: string): ModelInfo | undefined {
  return models.find((x) => x.provider === provider && x.id === id);
}

/** Best guess for a model id fetched from a provider's model list. */
export function guessModel(provider: ProviderId, id: string): ModelInfo {
  const lower = id.toLowerCase();
  const tier: Tier = /haiku|mini|nano|luna|flash|lite/.test(lower)
    ? "fast"
    : /opus|fable|astra|-pro|ultra/.test(lower)
      ? "best"
      : "balanced";
  return {
    id,
    provider,
    label: id,
    tier,
    inputPrice: 0,
    cachedInputPrice: 0,
    outputPrice: 0,
    vision: provider !== "deepseek",
    webSearch: provider !== "deepseek",
    priceKnown: false,
    custom: true,
  };
}

/** Filters a provider's /models list down to chat models worth offering. */
export function isChatModelId(provider: ProviderId, id: string): boolean {
  if (provider === "anthropic") return id.startsWith("claude-");
  if (provider === "deepseek") return id.startsWith("deepseek-");
  return /^(gpt-|o\d|chatgpt-)/.test(id) && !/(audio|realtime|transcribe|tts|image|embedding|search|codex|instruct)/.test(id);
}
