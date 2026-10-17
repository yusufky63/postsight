import { matchLanguage } from "./languages";
import { DEFAULT_TIERS } from "./models";
import type { ActionId, ProviderId, Settings, UiLang, UiLangSetting } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  uiLang: "auto",
  outputLang: "ui",
  route: { mode: "auto" },
  strategy: "balanced",
  providerOrder: ["anthropic", "openai", "deepseek"],
  providers: {
    anthropic: { enabled: true, tiers: { ...DEFAULT_TIERS.anthropic }, monthlyBudgetUsd: 0 },
    openai: { enabled: true, tiers: { ...DEFAULT_TIERS.openai }, monthlyBudgetUsd: 0 },
    deepseek: { enabled: true, tiers: { ...DEFAULT_TIERS.deepseek }, monthlyBudgetUsd: 0 },
  },
  globalMonthlyBudgetUsd: 0,
  budgetMode: "warn",
  webSearch: true,
  includeImages: true,
  includeThread: true,
  readLinks: true,
  walletCards: false,
  detail: "standard",
  actions: { verify: true, research: true, summarize: true, translate: true, explain: true, reply: true, ask: true },
  shortcuts: true,
  cacheResults: true,
  checkUpdates: true,
  customModels: [],
};

/** Fills gaps left by older stored settings so new fields always have a value. */
export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!stored) return base;
  const providers = { ...base.providers };
  for (const id of Object.keys(providers) as ProviderId[]) {
    const saved = stored.providers?.[id];
    if (saved) providers[id] = { ...providers[id], ...saved, tiers: { ...providers[id].tiers, ...saved.tiers } };
  }
  const order = (stored.providerOrder ?? []).filter((p): p is ProviderId => p in providers);
  for (const p of base.providerOrder) if (!order.includes(p)) order.push(p);
  return {
    ...base,
    ...stored,
    providers,
    providerOrder: order,
    actions: { ...base.actions, ...(stored.actions ?? {}) } as Record<ActionId, boolean>,
    customModels: stored.customModels ?? [],
  };
}

export function resolveUiLang(setting: UiLangSetting, browserLang: string): UiLang {
  if (setting !== "auto") return setting;
  return matchLanguage(browserLang) ?? "en";
}
