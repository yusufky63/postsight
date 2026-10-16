import { describe, expect, it } from "vitest";
import { allModels } from "./models";
import { complexity, decideRoute } from "./router";
import type { PostFeatures, RouteInput } from "./router";
import { DEFAULT_SETTINGS } from "./settings";
import type { ProviderId, Settings } from "./types";

const short: PostFeatures = { chars: 120, threadCount: 0, images: 0, hasQuote: false };
const heavy: PostFeatures = { chars: 2000, threadCount: 5, images: 2, hasQuote: true };
const noSpend: Record<ProviderId, number> = { anthropic: 0, openai: 0, deepseek: 0 };

function input(over: Partial<RouteInput> & { settings?: Settings } = {}): RouteInput {
  const settings = over.settings ?? structuredClone(DEFAULT_SETTINGS);
  return {
    action: "translate",
    features: short,
    models: allModels(settings.customModels),
    keyed: new Set<ProviderId>(["anthropic", "openai", "deepseek"]),
    spent: noSpend,
    ...over,
    settings,
  };
}

describe("complexity", () => {
  it("keeps a short translation on the light tier", () => {
    expect(complexity("translate", short, "balanced").tier).toBe("fast");
  });

  it("sends a fact-check of a short post to the detailed tier", () => {
    expect(complexity("verify", short, "balanced").tier).toBe("balanced");
  });

  it("escalates research on a long thread with images to the hardest tier", () => {
    const c = complexity("research", heavy, "balanced");
    expect(c.tier).toBe("best");
    expect(c.reasons).toEqual(expect.arrayContaining(["reason.long", "reason.thread", "reason.images"]));
  });

  it("keeps translating a long thread on the light tier", () => {
    expect(complexity("translate", { ...heavy, chars: 800 }, "balanced").tier).toBe("fast");
  });

  it("lets the strategy shift the tier", () => {
    expect(complexity("verify", short, "economy").tier).toBe("fast");
    expect(complexity("verify", short, "quality").tier).toBe("best");
  });
});

describe("decideRoute", () => {
  it("fails without any key", () => {
    expect(decideRoute(input({ keyed: new Set() }), { mode: "auto" })).toEqual({ ok: false, error: "no_key" });
  });

  it("uses the first provider in order for a light task", () => {
    const out = decideRoute(input(), { mode: "auto" });
    expect(out.ok && out.decision.model).toBe("claude-haiku-5-5");
  });

  it("follows the provider order the user set", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.providerOrder = ["deepseek", "anthropic", "openai"];
    const out = decideRoute(input({ settings }), { mode: "auto" });
    expect(out.ok && out.decision.model).toBe("deepseek-flash");
  });

  it("skips a provider without web search when a fact-check needs it", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.providerOrder = ["deepseek", "openai", "anthropic"];
    const out = decideRoute(input({ settings, action: "verify" }), { mode: "auto" });
    expect(out.ok && out.decision.provider).toBe("openai");
    expect(out.ok && out.decision.useWeb).toBe(true);
  });

  it("falls back to a model without web search and says so", () => {
    const out = decideRoute(input({ action: "verify", keyed: new Set<ProviderId>(["deepseek"]) }), { mode: "auto" });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.decision.provider).toBe("deepseek");
    expect(out.decision.useWeb).toBe(false);
    expect(out.decision.reasons).toContain("reason.noWeb");
  });

  it("does not search when web search is switched off", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.webSearch = false;
    const out = decideRoute(input({ settings, action: "verify" }), { mode: "auto" });
    expect(out.ok && out.decision.useWeb).toBe(false);
  });

  it("moves past a provider over its budget in warn mode", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.anthropic.monthlyBudgetUsd = 5;
    const out = decideRoute(input({ settings, spent: { ...noSpend, anthropic: 5 } }), { mode: "auto" });
    expect(out.ok && out.decision.provider).toBe("openai");
    expect(out.ok && out.decision.skipped).toEqual(["anthropic"]);
  });

  it("still answers in warn mode when every provider is over budget", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.providers.anthropic.monthlyBudgetUsd = 1;
    const out = decideRoute(input({ settings, keyed: new Set<ProviderId>(["anthropic"]), spent: { ...noSpend, anthropic: 2 } }), {
      mode: "auto",
    });
    expect(out.ok && out.decision.provider).toBe("anthropic");
  });

  it("stops in block mode once the total budget is used", () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.budgetMode = "block";
    settings.globalMonthlyBudgetUsd = 3;
    const out = decideRoute(input({ settings, spent: { anthropic: 2, openai: 1, deepseek: 0 } }), { mode: "auto" });
    expect(out).toEqual({ ok: false, error: "budget" });
  });

  it("honours a manual pick and notes missing capabilities", () => {
    const out = decideRoute(input({ action: "verify", features: heavy }), {
      mode: "manual",
      provider: "deepseek",
      model: "deepseek-v4-pro",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.decision).toMatchObject({ model: "deepseek-v4-pro", auto: false, useWeb: false, useVision: false });
    expect(out.decision.reasons).toEqual(["reason.manual", "reason.noWeb", "reason.noVision"]);
  });

  it("rejects a manual pick for a provider without a key", () => {
    const out = decideRoute(input({ keyed: new Set<ProviderId>(["openai"]) }), {
      mode: "manual",
      provider: "anthropic",
      model: "claude-opus-5-5",
    });
    expect(out).toEqual({ ok: false, error: "no_key" });
  });
});
