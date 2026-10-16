import { WEB_SEARCH_PRICE } from "./models";
import type { ActionId, ModelInfo, TweetData, UsageNumbers } from "./types";

/**
 * DeepSeek bills double during its peak windows: 01:00-04:00 and 06:00-10:00 UTC,
 * Monday to Friday. Chinese public holidays are off-peak too, but they move every
 * year, so a holiday request is estimated at the higher rate rather than guessed.
 */
export function isDeepSeekPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10);
}

export function priceMultiplier(model: ModelInfo, at: Date): number {
  return model.provider === "deepseek" && isDeepSeekPeak(at) ? 2 : 1;
}

/** Cost in USD, or null when the model has no price on file. */
export function costUsd(model: ModelInfo, usage: UsageNumbers, at: Date): number | null {
  if (!model.priceKnown) return null;
  const cached = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const fresh = usage.inputTokens - cached;
  const tokens = fresh * model.inputPrice + cached * model.cachedInputPrice + usage.outputTokens * model.outputPrice;
  return (tokens / 1_000_000) * priceMultiplier(model, at) + usage.webSearches * WEB_SEARCH_PRICE[model.provider];
}

/** Rough token count; real tokenizers differ by model, so this only feeds estimates. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}

const OUTPUT_GUESS: Record<ActionId, number> = {
  verify: 700,
  research: 900,
  summarize: 220,
  translate: 0,
  explain: 400,
  reply: 260,
  ask: 400,
};

/** Each search pulls result pages into the prompt; this is a typical amount. */
const TOKENS_PER_SEARCH = 3500;
const SYSTEM_OVERHEAD = 450;

export interface Estimate {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number | null;
}

export function postChars(tweet: Pick<TweetData, "text" | "quote" | "thread" | "card" | "body" | "isArticle">): number {
  let chars = tweet.text.length + (tweet.quote?.text.length ?? 0) + (tweet.card?.length ?? 0);
  // An X Article not open on the page is fetched later; budget for a typical one.
  chars += tweet.body?.length ?? (tweet.isArticle ? 6000 : 0);
  for (const item of tweet.thread) chars += item.text.length + 20;
  return chars;
}

export function estimateRun(
  model: ModelInfo,
  action: ActionId,
  chars: number,
  images: number,
  useWeb: boolean,
  at: Date,
): Estimate {
  const textTokens = Math.ceil(chars / 3.6);
  const searches = useWeb ? (action === "research" ? 3 : 2) : 0;
  const inputTokens = SYSTEM_OVERHEAD + textTokens + images * 1100 + searches * TOKENS_PER_SEARCH;
  const outputTokens = action === "translate" ? Math.ceil(textTokens * 1.3) + 40 : OUTPUT_GUESS[action];
  const usage = { inputTokens, cachedInputTokens: 0, outputTokens, webSearches: searches };
  return { inputTokens, outputTokens, webSearches: searches, costUsd: costUsd(model, usage, at) };
}

/**
 * Blended price per token for "how many tokens are left" figures. Postsight prompts are
 * input-heavy (post text plus search results), so input is weighted 4:1.
 */
export function blendedPricePerToken(model: ModelInfo): number | null {
  if (!model.priceKnown) return null;
  const perMillion = model.inputPrice * 0.8 + model.outputPrice * 0.2;
  return perMillion > 0 ? perMillion / 1_000_000 : null;
}

export function tokensForBudget(model: ModelInfo, usd: number): number | null {
  const price = blendedPricePerToken(model);
  if (price === null) return null;
  return Math.max(0, Math.floor(usd / price));
}
