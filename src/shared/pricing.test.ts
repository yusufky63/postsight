import { describe, expect, it } from "vitest";
import { CATALOG, guessModel } from "./models";
import { costUsd, estimateRun, isDeepSeekPeak, tokensForBudget } from "./pricing";

const model = (id: string) => CATALOG.find((m) => m.id === id)!;

describe("isDeepSeekPeak", () => {
  it("knows the weekday peak windows in UTC", () => {
    expect(isDeepSeekPeak(new Date("2026-10-14T02:30:00Z"))).toBe(true); // Wednesday
    expect(isDeepSeekPeak(new Date("2026-10-14T07:00:00Z"))).toBe(true);
    expect(isDeepSeekPeak(new Date("2026-10-14T04:00:00Z"))).toBe(false);
    expect(isDeepSeekPeak(new Date("2026-10-14T12:00:00Z"))).toBe(false);
  });

  it("treats weekends as off-peak", () => {
    expect(isDeepSeekPeak(new Date("2026-10-17T02:30:00Z"))).toBe(false); // Saturday
  });
});

describe("costUsd", () => {
  const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000, webSearches: 0 };

  it("prices input and output per million tokens", () => {
    expect(costUsd(model("claude-sonnet-5-5"), usage, new Date())).toBeCloseTo(12);
  });

  it("bills cached input at the cached rate", () => {
    const cached = { ...usage, cachedInputTokens: 1_000_000, outputTokens: 0 };
    expect(costUsd(model("gpt-6.1-sol"), cached, new Date())).toBeCloseTo(0.1);
  });

  it("adds web searches", () => {
    const searches = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, webSearches: 3 };
    expect(costUsd(model("claude-opus-5-5"), searches, new Date())).toBeCloseTo(0.03);
  });

  it("doubles DeepSeek during peak hours", () => {
    const flash = model("deepseek-flash");
    const off = costUsd(flash, usage, new Date("2026-10-14T12:00:00Z"))!;
    const peak = costUsd(flash, usage, new Date("2026-10-14T02:00:00Z"))!;
    expect(off).toBeCloseTo(0.75);
    expect(peak).toBeCloseTo(off * 2);
  });

  it("returns null when the model has no price", () => {
    expect(costUsd(guessModel("openai", "gpt-7-preview"), usage, new Date())).toBeNull();
  });
});

describe("estimates", () => {
  it("counts web search content in the estimate", () => {
    const sonnet = model("claude-sonnet-5-5");
    const withWeb = estimateRun(sonnet, "verify", 400, 0, true, new Date());
    const without = estimateRun(sonnet, "verify", 400, 0, false, new Date());
    expect(withWeb.webSearches).toBe(2);
    expect(withWeb.costUsd!).toBeGreaterThan(without.costUsd! + 0.02);
  });

  it("sizes a translation by the post length", () => {
    const short = estimateRun(model("claude-haiku-5-5"), "translate", 100, 0, false, new Date());
    const long = estimateRun(model("claude-haiku-5-5"), "translate", 3000, 0, false, new Date());
    expect(long.outputTokens).toBeGreaterThan(short.outputTokens * 10);
  });

  it("turns a dollar budget into a token count", () => {
    expect(tokensForBudget(model("claude-haiku-5-5"), 1)).toBe(5_555_555);
    expect(tokensForBudget(guessModel("anthropic", "claude-x"), 1)).toBeNull();
  });
});
