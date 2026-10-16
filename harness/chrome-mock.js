// Stand-in for the chrome.* APIs so the built bundles can be viewed in a normal tab.
// Everything here is sample data for visual checks; nothing talks to a real API.
(() => {
  const params = new URLSearchParams(location.search);
  const lang = params.get("lang") || "en";
  const now = Date.now();
  const day = 86_400_000;

  const settings = {
    enabled: true,
    uiLang: lang,
    outputLang: "ui",
    route: { mode: "auto" },
    strategy: "balanced",
    providerOrder: ["anthropic", "openai", "deepseek"],
    providers: {
      anthropic: { enabled: true, tiers: { fast: "claude-haiku-5-5", balanced: "claude-sonnet-5-5", best: "claude-opus-5-5" }, monthlyBudgetUsd: 10 },
      openai: { enabled: true, tiers: { fast: "gpt-6-luna", balanced: "gpt-6.1-sol", best: "gpt-6-astra" }, monthlyBudgetUsd: 5 },
      deepseek: { enabled: true, tiers: { fast: "deepseek-flash", balanced: "deepseek-v4-pro", best: "deepseek-v4-pro" }, monthlyBudgetUsd: 0 },
    },
    globalMonthlyBudgetUsd: 20,
    budgetMode: "warn",
    webSearch: true,
    includeImages: true,
    includeThread: true,
    readLinks: true,
    detail: "standard",
    actions: { verify: true, research: true, summarize: true, translate: true, explain: true, reply: true, ask: true },
    shortcuts: true,
    cacheResults: true,
    customModels: [],
  };

  const entry = (ago, provider, model, action, inTok, outTok, searches, cost) => ({
    ts: now - ago,
    provider,
    model,
    action,
    inputTokens: inTok,
    cachedInputTokens: 0,
    outputTokens: outTok,
    webSearches: searches,
    costUsd: cost,
  });
  const usage = [
    entry(3 * day, "anthropic", "claude-sonnet-5-5", "verify", 9400, 610, 2, 0.0449),
    entry(2 * day, "openai", "gpt-6-luna", "translate", 260, 31, 0, 0.00004),
    entry(day, "deepseek", "deepseek-flash", "summarize", 820, 190, 0, 0.00024),
    entry(3_600_000, "anthropic", "claude-haiku-5-5", "explain", 700, 380, 0, 0.00026),
    entry(600_000, "anthropic", "claude-sonnet-5-5", "research", 14100, 980, 3, 0.0680),
  ];
  const sample = {
    // A model that echoes the full link, to check the card still shows it short.
    translate: [
      "Sulu patatesli omlet 20 dakikada: püf noktası patatesi kısık ateşte yağda pişirmek. Tarifin tamamı: ",
      "https://example.com/es/recetas/tortilla-de-patatas-jugosa-en-veinte-minutos-con-cebolla-caramelizada?utm_source=x&utm_medium=social&utm_campaign=otono",
    ],
    verify: [
      "VERDICT: false | CONFIDENCE: 92\n",
      "## Claims\n",
      "- **Visible from the Moon with the naked eye** - **false**. From about 384,000 km no single human-made structure can be made out; the wall is long but only a few metres wide ([Wikipedia](https://en.wikipedia.org/wiki/Great_Wall_of_China)).\n",
      "- **The only structure visible from space** - **false**. From low orbit, cities, airports and highways are easier to spot than the wall, which blends into the terrain.\n\n",
      "## Context\n",
      "- The claim is an old myth that predates spaceflight.\n",
      "- China's first astronaut, Yang Liwei, said in 2003 that he could not see the wall from orbit.\n\n",
      "## Bottom line\n",
      "A popular myth: the Great Wall cannot be seen from the Moon, and is hard to spot even from low orbit.",
    ],
    summarize: [
      "**TL;DR:** The team fixed CI cache misses by keying caches on the lockfile hash instead of the branch name.\n",
      "- Cache hit rate on CI is now 94%.\n",
      "- The write-up explains why branch-based keys kept missing.",
    ],
  };
  const sources = [
    { url: "https://en.wikipedia.org/wiki/Great_Wall_of_China", title: "Great Wall of China" },
    { url: "https://en.wikipedia.org/wiki/Yang_Liwei", title: "Yang Liwei" },
  ];

  const store = {
    settings,
    secrets: { anthropic: "harness-sample-anthropic-0000abcd", openai: "harness-sample-openai-1234wxyz", deepseek: "" },
    usage,
    history: [
      {
        key: "h1",
        tweet: { id: "1846000000000000001", url: "https://x.com/triviadaily/status/1846000000000000001", authorName: "Trivia Daily", handle: "triviadaily", text: "Fun fact: the Great Wall of China is the only human-made structure you can see from the Moon with the naked eye." },
        result: { action: "verify", text: sample.verify.join(""), sources, provider: "anthropic", model: "claude-sonnet-5-5", modelLabel: "Claude Sonnet 5.5", usage: { inputTokens: 9400, cachedInputTokens: 0, outputTokens: 610, webSearches: 2 }, costUsd: 0.0449, ms: 8400, ts: now - 3 * day, cached: false, useWeb: true, auto: true },
      },
    ],
  };

  const listeners = [];
  const storage = {
    local: {
      async get(key) {
        if (typeof key === "string") return { [key]: structuredClone(store[key]) };
        return structuredClone(store);
      },
      async set(obj) {
        const changes = {};
        for (const [k, v] of Object.entries(obj)) {
          changes[k] = { oldValue: store[k], newValue: structuredClone(v) };
          store[k] = structuredClone(v);
        }
        for (const fn of listeners) fn(changes, "local");
      },
      async setAccessLevel() {},
    },
    onChanged: { addListener: (fn) => listeners.push(fn) },
  };

  const catalog = [
    ["anthropic", "claude-haiku-5-5", "Claude Haiku 5.5", "fast", 0.1, 0.01, 0.5, true, true],
    ["anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", "balanced", 2, 0.2, 10, true, true],
    ["anthropic", "claude-opus-5-5", "Claude Opus 5.5", "best", 4, 0.2, 20, true, true],
    ["openai", "gpt-6-luna", "GPT-6 Luna", "fast", 0.1, 0.01, 0.5, true, true],
    ["openai", "gpt-6.1-sol", "GPT-6.1 Sol", "balanced", 2, 0.1, 10, true, true],
    ["openai", "gpt-6-astra", "GPT-6 Astra", "best", 10, 1, 50, true, true],
  ].map(([provider, id, label, tier, inputPrice, cachedInputPrice, outputPrice, vision, webSearch]) => ({ provider, id, label, tier, inputPrice, cachedInputPrice, outputPrice, vision, webSearch, priceKnown: true }));

  const config = {
    enabled: true,
    lang,
    actions: ["verify", "research", "summarize", "translate", "explain", "reply", "ask"],
    route: { mode: "auto" },
    strategy: "balanced",
    models: catalog,
    hasKey: params.get("nokey") !== "1",
    shortcuts: true,
    includeThread: true,
    wallets: params.get("wallets") !== "0",
  };

  const decisionFor = (action) => {
    const deep = action === "verify" || action === "research";
    const model = deep ? catalog[1] : catalog[0];
    return {
      provider: model.provider,
      model: model.id,
      modelLabel: model.label,
      tier: model.tier,
      score: deep ? 62 : 20,
      useWeb: deep,
      useVision: false,
      auto: true,
      reasons: deep ? ["reason.deep", "reason.web"] : ["reason.light"],
      skipped: [],
    };
  };
  const costs = { verify: 0.041, research: 0.063, summarize: 0.0002, translate: 0.0001, explain: 0.0003, reply: 0.0002, ask: 0.0004 };

  async function respond(req) {
    switch (req.type) {
      case "config":
        return structuredClone(config);
      case "estimate":
        return { ok: true, decision: decisionFor(req.action), estimate: { inputTokens: req.action === "verify" ? 7900 : 520, outputTokens: 400, webSearches: 2, costUsd: costs[req.action] } };
      case "test-key":
        return { ok: true, models: ["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"] };
      case "balance":
        return { ok: false, error: "no_key" };
      default:
        return { ok: true };
    }
  }

  /** Wallet cards stream from the harness server, which runs the extension's real lookup. */
  function walletPort() {
    const handlers = [];
    const controller = new AbortController();
    const emit = (e) => !controller.signal.aborted && handlers.forEach((fn) => fn(e));
    return {
      onMessage: { addListener: (fn) => handlers.push(fn) },
      onDisconnect: { addListener() {} },
      disconnect: () => controller.abort(),
      async postMessage({ query }) {
        try {
          const res = await fetch(`/wallet?query=${encodeURIComponent(query)}`, { signal: controller.signal });
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop();
            for (const line of lines) if (line.trim()) emit(JSON.parse(line));
          }
        } catch {
          emit({ type: "error", code: "unknown" });
        }
      },
    };
  }

  function connect(info) {
    if (info?.name === "postsight-wallet") return walletPort();
    const handlers = [];
    const disconnects = [];
    let closed = false;
    const emit = (e) => !closed && handlers.forEach((fn) => fn(e));
    return {
      onMessage: { addListener: (fn) => handlers.push(fn) },
      onDisconnect: { addListener: (fn) => disconnects.push(fn) },
      disconnect() {
        closed = true;
      },
      postMessage(job) {
        const decision = decisionFor(job.action);
        const parts = sample[job.action] ?? ["**TL;DR:** A short sample answer for the harness.\n", "- First point\n", "- Second point"];
        const instant = params.get("instant") === "1";
        setTimeout(() => emit({ type: "route", decision }), 10);
        setTimeout(() => emit({ type: "status", status: decision.useWeb ? "searching" : "writing" }), 20);
        let delay = 40;
        if (params.get("hold") === "1") return;
        parts.forEach((p, i) => {
          delay += instant ? 1 : 260;
          setTimeout(() => {
            if (i === 0) emit({ type: "status", status: "writing" });
            emit({ type: "delta", text: p });
          }, delay);
        });
        if (decision.useWeb) sources.forEach((s) => setTimeout(() => emit({ type: "source", source: s }), delay));
        setTimeout(() => {
          emit({
            type: "done",
            result: { action: job.action, text: parts.join(""), sources: decision.useWeb ? sources : [], provider: decision.provider, model: decision.model, modelLabel: decision.modelLabel, usage: { inputTokens: 9400, cachedInputTokens: 0, outputTokens: 610, webSearches: decision.useWeb ? 2 : 0 }, costUsd: costs[job.action], ms: 8400, ts: Date.now(), cached: false, useWeb: decision.useWeb, auto: true },
          });
        }, delay + 30);
      },
    };
  }

  window.chrome = {
    runtime: {
      id: "harness",
      getURL: (p) => `/dist/${p}`,
      sendMessage: respond,
      connect,
      onMessage: { addListener() {} },
      openOptionsPage() {},
      getPlatformInfo: async () => ({}),
    },
    storage,
    tabs: { create: async () => ({}), query: async () => [] },
    permissions: { contains: async () => false, request: async () => true },
  };
})();
