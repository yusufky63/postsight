import type { Estimate } from "./pricing";
import type { PostFeatures } from "./router";
import type {
  ActionId,
  ErrorCode,
  ModelInfo,
  ProviderId,
  RouteChoice,
  RouteDecision,
  RunResult,
  Source,
  Strategy,
  TweetData,
  UiLang,
} from "./types";

export const RUN_PORT = "postsight-run";

export interface ContentConfig {
  enabled: boolean;
  lang: UiLang;
  actions: ActionId[];
  route: RouteChoice;
  strategy: Strategy;
  /** Models of providers that have a key. */
  models: ModelInfo[];
  hasKey: boolean;
  shortcuts: boolean;
  includeThread: boolean;
  /** Wallet cards are on and their hosts are allowed. */
  wallets: boolean;
}

export interface RunJob {
  action: ActionId;
  tweet: TweetData;
  route: RouteChoice;
  question?: string;
  /** What a wallet card found, for researching that wallet; sent to the model, not shown. */
  facts?: string;
  force?: boolean;
}

export type RunStatus = "waiting" | "reading" | "thinking" | "searching" | "writing";

export type RunEvent =
  | { type: "route"; decision: RouteDecision }
  | { type: "status"; status: RunStatus }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "source"; source: Source }
  /** Linked pages were skipped because Postsight may not read other sites yet. */
  | { type: "notice"; code: "linksNeedPermission" }
  | { type: "done"; result: RunResult }
  | { type: "error"; code: ErrorCode; detail?: string };

export type EstimateResponse =
  | { ok: true; decision: RouteDecision; estimate: Estimate }
  | { ok: false; error: ErrorCode };

export interface TestKeyResponse {
  ok: boolean;
  models?: string[];
  error?: ErrorCode;
  detail?: string;
}

export interface BalanceResponse {
  ok: boolean;
  balances?: { currency: string; total: string }[];
  error?: ErrorCode;
}

export type Request =
  | { type: "config" }
  | { type: "estimate"; action: ActionId; features: PostFeatures; route: RouteChoice }
  | { type: "test-key"; provider: ProviderId }
  | { type: "balance" }
  | { type: "open-options"; section?: string };

export function sendRequest<T>(request: Request): Promise<T> {
  return chrome.runtime.sendMessage(request) as Promise<T>;
}
