import type { BalanceResponse, ContentConfig, EstimateResponse, Request, RunEvent, RunJob, TestKeyResponse } from "../shared/messages";
import { matchLanguage } from "../shared/languages";
import { RUN_PORT } from "../shared/messages";
import { allModels, findModel, guessModel, isChatModelId } from "../shared/models";
import { costUsd, estimateRun } from "../shared/pricing";
import { buildPrompt } from "../shared/prompts";
import { decideRoute, postFeatures } from "../shared/router";
import type { RouteInput } from "../shared/router";
import { resolveUiLang } from "../shared/settings";
import {
  keyedProviders,
  loadExplorerKeys,
  loadHistory,
  loadSecrets,
  loadSettings,
  loadUsage,
  saveHistory,
  saveUsage,
} from "../shared/storage";
import { ACTIONS } from "../shared/types";
import type { HistoryEntry, LinkedPage, ProviderId, RouteChoice, RunResult, Settings, UiLang, UsageEntry } from "../shared/types";
import { appendCapped, spentByProvider, USAGE_LIMIT } from "../shared/usage";
import type { WalletEvent, WalletRequest } from "../shared/wallet";
import { CORE_ORIGINS, TOKEN_ORIGINS, WALLET_PORT } from "../shared/wallet";
import { listAnthropicModels, runAnthropic } from "./providers/anthropic";
import type { ProviderCallbacks, ProviderRequest, ProviderResult } from "./providers/common";
import { ProviderError } from "./providers/common";
import { canReadAllSites, fetchWebPage, fetchXArticle } from "./pages";
import { deepSeekBalance, listDeepSeekModels, runDeepSeek } from "./providers/deepseek";
import { listOpenAIModels, runOpenAI } from "./providers/openai";
import { BLOCKSCOUT_PRO_ORIGIN, checkBlockscoutKey } from "./wallet/blockscout";
import { ETHERSCAN_ORIGIN, checkKey } from "./wallet/etherscan";
import { HttpError } from "./wallet/net";
import { lookupWallet, validQuery } from "./wallet/lookup";

const RUNNERS: Record<ProviderId, (req: ProviderRequest, cb: ProviderCallbacks) => Promise<ProviderResult>> = {
  anthropic: runAnthropic,
  openai: runOpenAI,
  deepseek: runDeepSeek,
};

const LISTERS: Record<ProviderId, (key: string) => Promise<string[]>> = {
  anthropic: listAnthropicModels,
  openai: listOpenAIModels,
  deepseek: listDeepSeekModels,
};

const HISTORY_LIMIT = 300;

/** Usage and history are read-modify-write; parallel jobs go through one queue. */
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * A service worker idles out after ~30s without extension events. Web searches
 * can be silent for longer than that, so an API call is made every 20s while any
 * job is running.
 */
let activeJobs = 0;
let keepAlive: ReturnType<typeof setInterval> | undefined;
function jobStarted(): void {
  activeJobs += 1;
  keepAlive ??= setInterval(() => void chrome.runtime.getPlatformInfo(), 20_000);
}
function jobEnded(): void {
  activeJobs = Math.max(0, activeJobs - 1);
  if (activeJobs === 0 && keepAlive) {
    clearInterval(keepAlive);
    keepAlive = undefined;
  }
}

function outputLang(settings: Settings): UiLang {
  return settings.outputLang === "ui" ? resolveUiLang(settings.uiLang, navigator.language) : settings.outputLang;
}

/** Where to translate a post that is already in the answer language: the next language the browser prefers. */
function secondLanguage(first: UiLang): UiLang {
  for (const tag of navigator.languages ?? []) {
    const code = matchLanguage(tag);
    if (code && code !== first) return code;
  }
  return first === "en" ? "es" : "en";
}

async function routeInput(action: RouteInput["action"], features: RouteInput["features"]) {
  const [settings, secrets, usage] = await Promise.all([loadSettings(), loadSecrets(), loadUsage()]);
  const input: RouteInput = {
    action,
    features,
    settings,
    models: allModels(settings.customModels),
    keyed: keyedProviders(secrets),
    spent: spentByProvider(usage, Date.now()),
  };
  return { input, settings, secrets };
}

function cacheKey(job: RunJob, provider: ProviderId, model: string, lang: UiLang, settings: Settings): string {
  return [job.tweet.id, job.action, provider, model, lang, settings.detail, job.question?.trim() ?? ""].join("|");
}

/**
 * Fetches what the post points to, so a link-only post or an X Article is not
 * analysed from its headline alone. X Articles are always read; other sites only
 * with the optional all-sites permission. Failures just leave the page out.
 */
async function gatherPages(tweet: RunJob["tweet"], settings: Settings, emit: (e: RunEvent) => void, signal: AbortSignal): Promise<LinkedPage[]> {
  const pages: LinkedPage[] = [];
  const wantArticle = tweet.isArticle && !tweet.body;
  const wantLinks = settings.readLinks && tweet.links.length > 0;
  if (!wantArticle && !wantLinks) return pages;
  emit({ type: "status", status: "reading" });
  if (wantArticle) {
    const article = await fetchXArticle(tweet, signal);
    if (article) pages.push(article);
  }
  if (wantLinks) {
    if (await canReadAllSites()) {
      const found = await Promise.all(tweet.links.slice(0, 2).map((url) => fetchWebPage(url, signal)));
      for (const page of found) if (page) pages.push(page);
    } else {
      emit({ type: "notice", code: "linksNeedPermission" });
    }
  }
  return pages;
}

async function runJob(job: RunJob, emit: (e: RunEvent) => void, signal: AbortSignal): Promise<void> {
  const started = Date.now();
  const { input, settings, secrets } = await routeInput(job.action, postFeatures(job.tweet));
  const outcome = decideRoute(input, job.route);
  if (!outcome.ok) {
    emit({ type: "error", code: outcome.error });
    return;
  }
  const decision = outcome.decision;
  const lang = outputLang(settings);
  const key = cacheKey(job, decision.provider, decision.model, lang, settings);
  emit({ type: "route", decision });

  if (settings.cacheResults && !job.force) {
    const hit = (await loadHistory()).find((h) => h.key === key);
    if (hit) {
      emit({ type: "done", result: { ...hit.result, cached: true } });
      return;
    }
  }

  const pages = await gatherPages(job.tweet, settings, emit, signal);
  emit({ type: "status", status: "waiting" });
  const model = findModel(input.models, decision.provider, decision.model) ?? guessModel(decision.provider, decision.model);
  const prompt = buildPrompt(job.action, job.tweet, {
    lang,
    detail: settings.detail,
    useWeb: decision.useWeb,
    imagesVisible: decision.useVision,
    question: job.question,
    today: new Date().toISOString().slice(0, 10),
    secondLang: secondLanguage(lang),
    pages,
    facts: job.action === "ask" ? job.facts?.slice(0, 4000) : undefined,
  });

  const out = await RUNNERS[decision.provider](
    {
      apiKey: secrets[decision.provider],
      model,
      system: prompt.system,
      user: prompt.user,
      images: decision.useVision ? job.tweet.images.slice(0, 4) : [],
      useWeb: decision.useWeb,
      depth: prompt.depth,
      maxTokens: prompt.maxTokens,
      maxSearches: prompt.maxSearches,
      signal,
    },
    {
      onText: (text) => emit({ type: "delta", text }),
      onStatus: (status) => emit({ type: "status", status }),
      onSource: (source) => emit({ type: "source", source }),
      onReset: () => emit({ type: "reset" }),
    },
  );

  // A server-side fallback may answer with a model that has no price of its own; bill it at the requested model's rate.
  const billed = findModel(input.models, decision.provider, out.model) ?? model;
  const now = Date.now();
  const cost = costUsd(billed, out.usage, new Date(now));
  const entry: UsageEntry = { ts: now, provider: decision.provider, model: out.model, action: job.action, costUsd: cost, ...out.usage };
  await serial(async () => saveUsage(appendCapped(await loadUsage(), entry, USAGE_LIMIT)));

  if (!out.text.trim()) throw new ProviderError("empty");

  const result: RunResult = {
    action: job.action,
    text: out.text,
    sources: out.sources,
    provider: decision.provider,
    model: out.model,
    modelLabel: billed.id === out.model ? billed.label : out.model,
    usage: out.usage,
    costUsd: cost,
    ms: now - started,
    ts: now,
    cached: false,
    useWeb: decision.useWeb,
    auto: decision.auto,
  };

  if (settings.cacheResults) {
    const t = job.tweet;
    const record: HistoryEntry = {
      key,
      tweet: { id: t.id, url: t.url, authorName: t.authorName, handle: t.handle, text: t.text.slice(0, 600) },
      result,
    };
    await serial(async () => {
      const history = (await loadHistory()).filter((h) => h.key !== key);
      await saveHistory(appendCapped(history, record, HISTORY_LIMIT));
    });
  }
  emit({ type: "done", result });
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== RUN_PORT) return;
  const controller = new AbortController();
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
    controller.abort();
  });
  const emit = (event: RunEvent) => {
    if (open) port.postMessage(event);
  };
  port.onMessage.addListener((job: RunJob) => {
    jobStarted();
    runJob(job, emit, controller.signal)
      .catch((err: unknown) => {
        const e = err instanceof ProviderError ? err : new ProviderError("unknown", err instanceof Error ? err.message : undefined);
        const showDetail = e.code === "bad_request" || e.code === "server" || e.code === "unknown";
        emit({ type: "error", code: e.code, detail: showDetail ? e.detail : undefined });
      })
      .finally(jobEnded);
  });
});

/** Wallet lookups need both the setting and the hosts; the reader can revoke the hosts in Chrome at any time. */
async function walletsAllowed(settings?: Settings): Promise<boolean> {
  const s = settings ?? (await loadSettings());
  return s.walletCards && (await chrome.permissions.contains({ origins: CORE_ORIGINS }).catch(() => false));
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== WALLET_PORT) return;
  const controller = new AbortController();
  let open = true;
  port.onDisconnect.addListener(() => {
    open = false;
    controller.abort();
  });
  const emit = (event: WalletEvent) => {
    if (open) port.postMessage(event);
  };
  port.onMessage.addListener((request: WalletRequest) => {
    void (async () => {
      if (!validQuery(request?.query)) return emit({ type: "error", code: "unknown" });
      if (!(await walletsAllowed())) return emit({ type: "error", code: "permission" });
      const [extras, explorer, etherscanAllowed, blockscoutAllowed] = await Promise.all([
        chrome.permissions.contains({ origins: TOKEN_ORIGINS }).catch(() => false),
        loadExplorerKeys(),
        chrome.permissions.contains({ origins: [ETHERSCAN_ORIGIN] }).catch(() => false),
        chrome.permissions.contains({ origins: [BLOCKSCOUT_PRO_ORIGIN] }).catch(() => false),
      ]);
      const etherscanKey = etherscanAllowed && explorer.etherscan ? explorer.etherscan : undefined;
      const blockscoutKey = blockscoutAllowed && explorer.blockscout ? explorer.blockscout : undefined;
      await lookupWallet(request.query, (card) => emit({ type: "card", card }), controller.signal, { extras, etherscanKey, blockscoutKey });
    })().catch(() => emit({ type: "error", code: "unknown" }));
  });
});

async function contentConfig(): Promise<ContentConfig> {
  const [settings, secrets] = await Promise.all([loadSettings(), loadSecrets()]);
  const keyed = keyedProviders(secrets);
  return {
    enabled: settings.enabled,
    lang: resolveUiLang(settings.uiLang, navigator.language),
    actions: ACTIONS.filter((a) => settings.actions[a]),
    route: settings.route,
    strategy: settings.strategy,
    models: allModels(settings.customModels).filter((m) => keyed.has(m.provider)),
    hasKey: keyed.size > 0,
    shortcuts: settings.shortcuts,
    includeThread: settings.includeThread,
    wallets: await walletsAllowed(settings),
  };
}

async function estimate(action: RouteInput["action"], features: RouteInput["features"], route: RouteChoice): Promise<EstimateResponse> {
  const { input } = await routeInput(action, features);
  const outcome = decideRoute(input, route);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  const d = outcome.decision;
  const model = findModel(input.models, d.provider, d.model) ?? guessModel(d.provider, d.model);
  const images = d.useVision ? Math.min(features.images, 4) : 0;
  return { ok: true, decision: d, estimate: estimateRun(model, action, features.chars, images, d.useWeb, new Date()) };
}

async function testKey(provider: ProviderId): Promise<TestKeyResponse> {
  const secrets = await loadSecrets();
  if (!secrets[provider]) return { ok: false, error: "no_key" };
  try {
    const ids = await LISTERS[provider](secrets[provider]);
    return { ok: true, models: ids.filter((id) => isChatModelId(provider, id)).sort() };
  } catch (err) {
    const e = err instanceof ProviderError ? err : new ProviderError("unknown");
    return { ok: false, error: e.code, detail: e.detail };
  }
}

async function balance(): Promise<BalanceResponse> {
  const secrets = await loadSecrets();
  if (!secrets.deepseek) return { ok: false, error: "no_key" };
  try {
    return { ok: true, balances: await deepSeekBalance(secrets.deepseek) };
  } catch (err) {
    return { ok: false, error: err instanceof ProviderError ? err.code : "unknown" };
  }
}

/** Whether the reader's explorer key works; the reason the explorer gave when it does not. */
async function testExplorer(explorer: "etherscan" | "blockscout"): Promise<{ ok: boolean; detail?: string }> {
  const key = (await loadExplorerKeys())[explorer];
  if (!key) return { ok: false };
  // Blockscout sends no CORS headers, so without the host permission every call fails as "Failed to fetch".
  const origin = explorer === "etherscan" ? ETHERSCAN_ORIGIN : BLOCKSCOUT_PRO_ORIGIN;
  if (!(await chrome.permissions.contains({ origins: [origin] }).catch(() => false))) return { ok: false, detail: "permission" };
  try {
    await (explorer === "etherscan" ? checkKey : checkBlockscoutKey)(key, AbortSignal.timeout(10_000));
    return { ok: true };
  } catch (err) {
    // Blockscout answers a bad key with a bare 401.
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) return { ok: false, detail: "Unauthorized" };
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 160) : undefined };
  }
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case "config":
      return contentConfig();
    case "estimate":
      return estimate(request.action, request.features, request.route);
    case "test-key":
      return testKey(request.provider);
    case "balance":
      return balance();
    case "test-explorer":
      return testExplorer(request.explorer === "blockscout" ? "blockscout" : "etherscan");
    case "open-options": {
      const url = chrome.runtime.getURL(`options.html${request.section ? `#${request.section}` : ""}`);
      await chrome.tabs.create({ url });
      return { ok: true };
    }
  }
}

chrome.runtime.onMessage.addListener((request: Request, sender, sendResponse) => {
  // Only this extension's own pages and content scripts talk to the worker.
  if (sender.id !== chrome.runtime.id) return false;
  handle(request).then(sendResponse, () => sendResponse({ ok: false, error: "unknown" }));
  return true;
});

// Content scripts run inside x.com's renderer; keep stored keys out of their reach.
try {
  void chrome.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" })?.catch(() => undefined);
} catch {
  // Older Chrome without access levels on local storage; content scripts never read storage anyway.
}

// Content scripts cannot read storage, so they are told when settings or permissions change.
function broadcastConfig(): void {
  void chrome.tabs.query({}).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) chrome.tabs.sendMessage(tab.id, { type: "config-changed" }).catch(() => undefined);
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.settings || changes.secrets)) broadcastConfig();
});
chrome.permissions.onAdded.addListener(broadcastConfig);
chrome.permissions.onRemoved.addListener(broadcastConfig);

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") void chrome.runtime.openOptionsPage();
});
