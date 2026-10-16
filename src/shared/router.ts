import { findModel, guessModel } from "./models";
import { postChars } from "./pricing";
import type { ActionId, ModelInfo, ProviderId, ReasonKey, RouteChoice, RouteDecision, Settings, Tier, TweetData } from "./types";

export interface PostFeatures {
  chars: number;
  threadCount: number;
  images: number;
  hasQuote: boolean;
}

export interface RouteInput {
  action: ActionId;
  features: PostFeatures;
  settings: Settings;
  models: readonly ModelInfo[];
  /** Providers that have an API key saved. */
  keyed: ReadonlySet<ProviderId>;
  /** USD spent this month per provider. */
  spent: Record<ProviderId, number>;
}

export type RouteOutcome = { ok: true; decision: RouteDecision } | { ok: false; error: "no_key" | "no_provider" | "budget" };

/** How demanding each action is before the post itself is considered (0-100). */
export const ACTION_WEIGHT: Record<ActionId, number> = {
  translate: 10,
  summarize: 20,
  reply: 25,
  explain: 30,
  ask: 40,
  verify: 62,
  research: 72,
};

const WEB_ACTIONS: ReadonlySet<ActionId> = new Set(["verify", "research"]);
const VISUAL_ACTIONS: ReadonlySet<ActionId> = new Set(["verify", "research", "explain", "ask", "summarize"]);

export interface Complexity {
  score: number;
  tier: Tier;
  reasons: ReasonKey[];
}

export function complexity(action: ActionId, f: PostFeatures, strategy: Settings["strategy"]): Complexity {
  const reasons: ReasonKey[] = [];
  let score = ACTION_WEIGHT[action];
  if (f.chars > 1200) score += 15;
  else if (f.chars > 450) score += 8;
  if (f.chars > 450) reasons.push("reason.long");
  // Translation only covers the post and its quote, so a thread does not make it harder.
  const threadCounts = action !== "translate";
  if (threadCounts && f.threadCount >= 3) score += 15;
  else if (threadCounts && f.threadCount >= 1) score += 8;
  if (threadCounts && f.threadCount >= 1) reasons.push("reason.thread");
  if (f.images > 0 && VISUAL_ACTIONS.has(action)) {
    score += 8;
    reasons.push("reason.images");
  }
  if (f.hasQuote && threadCounts) score += 5;
  if (strategy === "economy") {
    score -= 25;
    reasons.push("reason.strategyEconomy");
  } else if (strategy === "quality") {
    score += 25;
    reasons.push("reason.strategyQuality");
  }
  score = Math.max(0, Math.min(100, score));
  const tier: Tier = score < 40 ? "fast" : score < 80 ? "balanced" : "best";
  reasons.unshift(tier === "fast" ? "reason.light" : "reason.deep");
  return { score, tier, reasons };
}

function overBudget(settings: Settings, provider: ProviderId, spent: Record<ProviderId, number>): boolean {
  const limit = settings.providers[provider].monthlyBudgetUsd;
  return limit > 0 && spent[provider] >= limit;
}

function totalSpent(spent: Record<ProviderId, number>): number {
  return spent.anthropic + spent.openai + spent.deepseek;
}

export function decideRoute(input: RouteInput, choice: RouteChoice): RouteOutcome {
  const { action, features, settings, models, keyed, spent } = input;
  if (keyed.size === 0) return { ok: false, error: "no_key" };
  const blocking = settings.budgetMode === "block";
  if (blocking && settings.globalMonthlyBudgetUsd > 0 && totalSpent(spent) >= settings.globalMonthlyBudgetUsd) {
    return { ok: false, error: "budget" };
  }

  const wantsWeb = settings.webSearch && WEB_ACTIONS.has(action);
  const wantsVision = settings.includeImages && features.images > 0 && VISUAL_ACTIONS.has(action);
  const { score, tier, reasons } = complexity(action, features, settings.strategy);

  if (choice.mode === "manual") {
    if (!keyed.has(choice.provider)) return { ok: false, error: "no_key" };
    if (blocking && overBudget(settings, choice.provider, spent)) return { ok: false, error: "budget" };
    const model = findModel(models, choice.provider, choice.model) ?? guessModel(choice.provider, choice.model);
    const manualReasons: ReasonKey[] = ["reason.manual"];
    if (wantsWeb && !model.webSearch) manualReasons.push("reason.noWeb");
    if (wantsVision && !model.vision) manualReasons.push("reason.noVision");
    return {
      ok: true,
      decision: {
        provider: model.provider,
        model: model.id,
        modelLabel: model.label,
        tier: model.tier,
        score,
        useWeb: wantsWeb && model.webSearch,
        useVision: wantsVision && model.vision,
        auto: false,
        reasons: manualReasons,
        skipped: [],
      },
    };
  }

  const skipped: ProviderId[] = [];
  const candidates: { model: ModelInfo; rank: number }[] = [];
  settings.providerOrder.forEach((provider, order) => {
    if (!keyed.has(provider) || !settings.providers[provider].enabled) return;
    const over = overBudget(settings, provider, spent);
    if (over) skipped.push(provider);
    if (over && blocking) return;
    const id = settings.providers[provider].tiers[tier];
    const model = findModel(models, provider, id) ?? guessModel(provider, id);
    // Lower rank wins: a missing capability costs more than provider order,
    // and a provider over its budget only wins when nothing else is left.
    let rank = order;
    if (wantsWeb && !model.webSearch) rank += 100;
    if (wantsVision && !model.vision) rank += 10;
    if (over) rank += 1000;
    candidates.push({ model, rank });
  });

  if (candidates.length === 0) return { ok: false, error: skipped.length ? "budget" : "no_provider" };
  candidates.sort((a, b) => a.rank - b.rank);
  const chosen = candidates[0]!.model;

  const finalReasons = [...reasons];
  if (wantsWeb) finalReasons.push(chosen.webSearch ? "reason.web" : "reason.noWeb");
  if (wantsVision && !chosen.vision) finalReasons.push("reason.noVision");
  if (skipped.length) finalReasons.push("reason.budgetSkip");

  return {
    ok: true,
    decision: {
      provider: chosen.provider,
      model: chosen.id,
      modelLabel: chosen.label,
      tier,
      score,
      useWeb: wantsWeb && chosen.webSearch,
      useVision: wantsVision && chosen.vision,
      auto: true,
      reasons: finalReasons,
      skipped,
    },
  };
}

export function postFeatures(tweet: TweetData): PostFeatures {
  return {
    chars: postChars(tweet),
    threadCount: tweet.thread.length,
    images: tweet.images.length,
    hasQuote: tweet.quote !== null,
  };
}
