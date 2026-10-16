import { describe, expect, it } from "vitest";
import { codeForStatus, messageFromBody, scrub } from "../background/providers/common";
import { dictionaries, t } from "./i18n";
import { isChatModelId } from "./models";
import { DEFAULT_SETTINGS, mergeSettings, resolveUiLang } from "./settings";
import type { UsageEntry } from "./types";
import { appendCapped, summarizeUsage } from "./usage";

describe("i18n", () => {
  it("has every key in every language, with the same placeholders", () => {
    const en = dictionaries.en;
    const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [code, dict] of Object.entries(dictionaries)) {
      expect(Object.keys(dict).sort(), code).toEqual(Object.keys(en).sort());
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${code} ${key}`).not.toBe("");
        expect(placeholders(value), `${code} ${key}`).toEqual(placeholders(en[key as keyof typeof en]));
      }
    }
  });

  it("fills variables", () => {
    expect(t("tr", "popup.requests", { n: 3 })).toBe("3 istek");
  });
});

describe("settings", () => {
  it("fills new fields into older stored settings", () => {
    const merged = mergeSettings({ strategy: "quality", providers: { anthropic: { enabled: false } } } as never);
    expect(merged.strategy).toBe("quality");
    expect(merged.providers.anthropic.enabled).toBe(false);
    expect(merged.providers.anthropic.tiers).toEqual(DEFAULT_SETTINGS.providers.anthropic.tiers);
    expect(merged.providerOrder).toEqual(["anthropic", "openai", "deepseek"]);
  });

  it("resolves the interface language from the browser", () => {
    expect(resolveUiLang("auto", "tr-TR")).toBe("tr");
    expect(resolveUiLang("auto", "de-DE")).toBe("de");
    expect(resolveUiLang("auto", "pt-BR")).toBe("pt");
    expect(resolveUiLang("auto", "sv-SE")).toBe("en");
    expect(resolveUiLang("en", "tr-TR")).toBe("en");
  });
});

describe("usage", () => {
  const entry = (ts: number, provider: UsageEntry["provider"], costUsd: number | null): UsageEntry => ({
    ts,
    provider,
    model: "m",
    action: "verify",
    costUsd,
    inputTokens: 100,
    cachedInputTokens: 0,
    outputTokens: 50,
    webSearches: 1,
  });

  it("totals the current month only", () => {
    const now = new Date(2026, 9, 16, 12).getTime();
    const lastMonth = new Date(2026, 8, 30, 12).getTime();
    const s = summarizeUsage([entry(now, "anthropic", 0.5), entry(now, "openai", null), entry(lastMonth, "anthropic", 9)], now);
    expect(s.month.anthropic.costUsd).toBeCloseTo(0.5);
    expect(s.monthTotal.requests).toBe(2);
    expect(s.monthTotal.unpriced).toBe(1);
    expect(s.today.webSearches).toBe(2);
  });

  it("caps the log", () => {
    expect(appendCapped([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });
});

describe("provider errors", () => {
  it("maps status codes and bodies to error codes", () => {
    expect(codeForStatus(401, "")).toBe("auth");
    expect(codeForStatus(429, '{"error":{"code":"insufficient_quota"}}')).toBe("billing");
    expect(codeForStatus(429, "slow down")).toBe("rate_limit");
    expect(codeForStatus(400, "Your credit balance is too low")).toBe("billing");
    expect(codeForStatus(400, "The model `x` does not exist")).toBe("model_not_found");
    expect(codeForStatus(503, "")).toBe("server");
  });

  it("never echoes an API key", () => {
    expect(scrub("Incorrect API key provided: sk-proj-abcdefghijklmnop")).not.toContain("abcdefghijklmnop");
    expect(messageFromBody('{"error":{"message":"bad sk-ant-api03-SECRETSECRETSECRET"}}')).not.toContain("SECRET");
  });

  it("keeps chat models and drops the rest", () => {
    expect(isChatModelId("openai", "gpt-6-luna")).toBe(true);
    expect(isChatModelId("openai", "gpt-4o-realtime-preview")).toBe(false);
    expect(isChatModelId("openai", "text-embedding-3-large")).toBe(false);
    expect(isChatModelId("anthropic", "claude-haiku-5-5")).toBe(true);
  });
});
