import type { UiLang } from "./languages";

export type ProviderId = "anthropic" | "openai" | "deepseek";
export const PROVIDERS: readonly ProviderId[] = ["anthropic", "openai", "deepseek"];

export type ActionId = "verify" | "research" | "summarize" | "translate" | "explain" | "reply" | "ask";
export const ACTIONS: readonly ActionId[] = ["verify", "research", "summarize", "translate", "explain", "reply", "ask"];

export type Tier = "fast" | "balanced" | "best";
export const TIERS: readonly Tier[] = ["fast", "balanced", "best"];

export type Strategy = "economy" | "balanced" | "quality";
export type { UiLang } from "./languages";
export type UiLangSetting = UiLang | "auto";
export type OutputLang = "ui" | UiLang;
export type Detail = "brief" | "standard" | "detailed";
export type BudgetMode = "warn" | "block";

export interface QuotedPost {
  authorName: string;
  handle: string;
  text: string;
}

export interface ThreadItem {
  handle: string;
  text: string;
  position: "before" | "after";
}

/** Everything Postsight reads from one post on the page. */
export interface TweetData {
  id: string;
  url: string;
  authorName: string;
  handle: string;
  text: string;
  lang: string | null;
  createdAt: string | null;
  images: string[];
  hasVideo: boolean;
  quote: QuotedPost | null;
  card: string | null;
  thread: ThreadItem[];
  /** Full addresses of the web pages the post links to (not X itself). */
  links: string[];
  /** Poll choices as shown, one per line. */
  poll: string | null;
  /** Text of an X community note attached to the post. */
  note: string | null;
  /** True when the post is an X Article (long-form) rather than a plain post. */
  isArticle: boolean;
  /** Long-form text visible on the page, when there is any (an open X Article, a long card). */
  body: string | null;
}

/** Readable content of a page the post links to, or of the post's X Article. */
export interface LinkedPage {
  url: string;
  kind: "x-article" | "web";
  title: string;
  site: string | null;
  published: string | null;
  description: string | null;
  text: string;
}

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  tier: Tier;
  /** USD per 1M tokens. */
  inputPrice: number;
  cachedInputPrice: number;
  outputPrice: number;
  vision: boolean;
  webSearch: boolean;
  /** False for models fetched from an API whose price nobody has entered yet. */
  priceKnown: boolean;
  custom?: boolean;
}

export type RouteChoice = { mode: "auto" } | { mode: "manual"; provider: ProviderId; model: string };

export interface ProviderSettings {
  enabled: boolean;
  tiers: Record<Tier, string>;
  monthlyBudgetUsd: number;
}

export interface Settings {
  enabled: boolean;
  uiLang: UiLangSetting;
  outputLang: OutputLang;
  route: RouteChoice;
  strategy: Strategy;
  providerOrder: ProviderId[];
  providers: Record<ProviderId, ProviderSettings>;
  globalMonthlyBudgetUsd: number;
  budgetMode: BudgetMode;
  webSearch: boolean;
  includeImages: boolean;
  includeThread: boolean;
  /** Read the web pages a post links to (needs the optional all-sites permission). */
  readLinks: boolean;
  detail: Detail;
  actions: Record<ActionId, boolean>;
  shortcuts: boolean;
  cacheResults: boolean;
  customModels: ModelInfo[];
}

export type Secrets = Record<ProviderId, string>;

export interface Source {
  url: string;
  title: string;
}

export interface UsageNumbers {
  /** Total prompt tokens, cached ones included. */
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearches: number;
}

export interface UsageEntry extends UsageNumbers {
  ts: number;
  provider: ProviderId;
  model: string;
  action: ActionId;
  costUsd: number | null;
}

export type ReasonKey =
  | "reason.light"
  | "reason.deep"
  | "reason.long"
  | "reason.thread"
  | "reason.images"
  | "reason.web"
  | "reason.noWeb"
  | "reason.noVision"
  | "reason.budgetSkip"
  | "reason.strategyEconomy"
  | "reason.strategyQuality"
  | "reason.manual";

export interface RouteDecision {
  provider: ProviderId;
  model: string;
  modelLabel: string;
  tier: Tier;
  score: number;
  useWeb: boolean;
  useVision: boolean;
  auto: boolean;
  reasons: ReasonKey[];
  skipped: ProviderId[];
}

export interface RunResult {
  action: ActionId;
  text: string;
  sources: Source[];
  provider: ProviderId;
  model: string;
  modelLabel: string;
  usage: UsageNumbers;
  costUsd: number | null;
  ms: number;
  ts: number;
  cached: boolean;
  useWeb: boolean;
  auto: boolean;
}

export type ErrorCode =
  | "no_key"
  | "no_provider"
  | "auth"
  | "billing"
  | "rate_limit"
  | "model_not_found"
  | "bad_request"
  | "refusal"
  | "network"
  | "server"
  | "budget"
  | "aborted"
  | "empty"
  | "unknown";

export interface HistoryEntry {
  key: string;
  tweet: Pick<TweetData, "id" | "url" | "authorName" | "handle" | "text">;
  result: RunResult;
}
