import type { ProviderId, UsageEntry } from "./types";

export interface ProviderTotals {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  requests: number;
  /** Requests whose model had no price on file. */
  unpriced: number;
}

export interface UsageSummary {
  month: Record<ProviderId, ProviderTotals>;
  monthTotal: ProviderTotals;
  today: ProviderTotals;
}

const empty = (): ProviderTotals => ({ costUsd: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, requests: 0, unpriced: 0 });

function add(t: ProviderTotals, e: UsageEntry): void {
  t.costUsd += e.costUsd ?? 0;
  t.inputTokens += e.inputTokens;
  t.outputTokens += e.outputTokens;
  t.webSearches += e.webSearches;
  t.requests += 1;
  if (e.costUsd === null) t.unpriced += 1;
}

/** Budgets follow the calendar month in the user's own time zone. */
export function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${monthKey(ts)}-${String(d.getDate()).padStart(2, "0")}`;
}

export function summarizeUsage(entries: readonly UsageEntry[], now: number): UsageSummary {
  const month = { anthropic: empty(), openai: empty(), deepseek: empty() };
  const monthTotal = empty();
  const today = empty();
  const thisMonth = monthKey(now);
  const thisDay = dayKey(now);
  for (const e of entries) {
    if (monthKey(e.ts) !== thisMonth) continue;
    add(month[e.provider], e);
    add(monthTotal, e);
    if (dayKey(e.ts) === thisDay) add(today, e);
  }
  return { month, monthTotal, today };
}

export function spentByProvider(entries: readonly UsageEntry[], now: number): Record<ProviderId, number> {
  const { month } = summarizeUsage(entries, now);
  return { anthropic: month.anthropic.costUsd, openai: month.openai.costUsd, deepseek: month.deepseek.costUsd };
}

/** Keeps the log bounded; old months stop mattering once budgets roll over. */
export const USAGE_LIMIT = 3000;

export function appendCapped<T>(list: readonly T[], item: T, limit: number): T[] {
  const next = [...list, item];
  return next.length > limit ? next.slice(next.length - limit) : next;
}
