import { allModels, DEFAULT_TIERS, findModel } from "../shared/models";
import { tokensForBudget } from "../shared/pricing";
import type { ModelInfo, ProviderId, Settings, UsageEntry } from "../shared/types";
import { monthKey } from "../shared/usage";

/**
 * The model a provider's "tokens left" figure is based on: whichever model it
 * used most this month, otherwise its detailed-tier model.
 */
export function referenceModel(settings: Settings, entries: readonly UsageEntry[], provider: ProviderId, now: number): ModelInfo | undefined {
  const models = allModels(settings.customModels);
  const counts = new Map<string, number>();
  const month = monthKey(now);
  for (const e of entries) {
    if (e.provider === provider && monthKey(e.ts) === month) counts.set(e.model, (counts.get(e.model) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return (
    (top ? findModel(models, provider, top) : undefined) ??
    findModel(models, provider, settings.providers[provider].tiers.balanced) ??
    findModel(models, provider, DEFAULT_TIERS[provider].balanced)
  );
}

export function tokensLeft(settings: Settings, entries: readonly UsageEntry[], provider: ProviderId, spent: number, now: number) {
  const budget = settings.providers[provider].monthlyBudgetUsd;
  if (budget <= 0) return null;
  const model = referenceModel(settings, entries, provider, now);
  if (!model) return null;
  const tokens = tokensForBudget(model, Math.max(0, budget - spent));
  return tokens === null ? null : { tokens, model };
}
