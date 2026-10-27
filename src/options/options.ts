import { formatDateTime, formatInt, formatTokens, formatUsd } from "../shared/format";
import { translator } from "../shared/i18n";
import type { MessageKey, Translate } from "../shared/i18n";
import type { BalanceResponse, TestKeyResponse } from "../shared/messages";
import { sendRequest } from "../shared/messages";
import { allModels, CATALOG, findModel, guessModel, PRICES_CHECKED, PROVIDER_KEY_URL, PROVIDER_LABEL } from "../shared/models";
import { estimateRun } from "../shared/pricing";
import { decideRoute } from "../shared/router";
import type { PostFeatures } from "../shared/router";
import { mergeSettings, resolveUiLang } from "../shared/settings";
import {
  keyedProviders,
  loadExplorerKeys,
  loadHistory,
  loadSecrets,
  loadSettings,
  loadUsage,
  saveExplorerKey,
  saveHistory,
  saveSecret,
  saveSettings,
  saveUsage,
} from "../shared/storage";
import type { ExplorerName } from "../shared/storage";
import { ACTIONS, PROVIDERS, TIERS } from "../shared/types";
import type {
  ActionId,
  BudgetMode,
  Detail,
  HistoryEntry,
  ModelInfo,
  OutputLang,
  ProviderId,
  Secrets,
  Settings,
  Strategy,
  Tier,
  UiLang,
  UiLangSetting,
  UsageEntry,
} from "../shared/types";
import { spentByProvider, summarizeUsage } from "../shared/usage";
import { parseVerdict } from "../shared/verdict";
import { CORE_ORIGINS, TOKEN_ORIGINS, WALLET_HOSTS, WALLET_ORIGINS } from "../shared/wallet";
import { tokensLeft } from "../ui/budget";
import { budgetBar, languageSelect, segmented, select, toggle, toast } from "../ui/controls";
import { h, icon, replace } from "../ui/dom";
import type { Child } from "../ui/dom";
import { linkify, renderMarkdown } from "../ui/render";
import { loadUpdateStatus, updateBanner } from "../ui/update";
import type { UpdateStatus } from "../shared/update";

type SectionId = "providers" | "routing" | "budget" | "models" | "features" | "history" | "help";
const SECTION_IDS: SectionId[] = ["providers", "routing", "budget", "models", "features", "history", "help"];

interface TestState {
  state: "testing" | "ok" | "fail";
  text: string;
}

const state = {
  settings: null as unknown as Settings,
  secrets: null as unknown as Secrets,
  usage: [] as UsageEntry[],
  history: [] as HistoryEntry[],
  lang: "en" as UiLang,
  fetched: {} as Partial<Record<ProviderId, string[]>>,
  tests: {} as Partial<Record<ProviderId, TestState>>,
  drafts: {} as Partial<Record<ProviderId, string>>,
  revealed: new Set<ProviderId>(),
  openHistory: new Set<string>(),
  balance: "",
  lastSaved: "",
  canReadLinks: false,
  canWallets: false,
  /** The token sources added in 1.1 are allowed too; older grants cover only the core hosts. */
  canTokenSources: false,
  /** Whether a newer version is out; loaded after the first paint. */
  update: null as UpdateStatus | null,
  checkingUpdate: false,
  /** The reader's own explorer keys for wallet cards, and each field's state. */
  explorers: {
    etherscan: { saved: "", draft: "", reveal: false, test: undefined as TestState | undefined },
    blockscout: { saved: "", draft: "", reveal: false, test: undefined as TestState | undefined },
  },
};

const app = document.getElementById("app")!;
const containers = new Map<SectionId, HTMLElement>();
/** The new-version notice above the sections, so it shows whichever section is open. */
const updateSlot = h("div");
let t: Translate = translator("en");

// ---------- persistence ----------

async function save(change: (s: Settings) => void, refresh: SectionId[] = []): Promise<void> {
  change(state.settings);
  state.lastSaved = JSON.stringify(state.settings);
  await saveSettings(state.settings);
  toast(t("saved"));
  for (const id of refresh) renderSection(id);
}

function numberField(value: number, onCommit: (v: number) => void, opts: { unit?: string; step?: string; label: string; small?: boolean }): HTMLElement {
  const input = h("input", { type: "number", min: "0", step: opts.step ?? "1", inputmode: "decimal", "aria-label": opts.label });
  input.value = String(value);
  input.addEventListener("change", () => {
    const v = Math.max(0, Number(input.value) || 0);
    input.value = String(v);
    onCommit(v);
  });
  return h("label", { class: `field${opts.small ? " field-sm" : ""}` }, input, opts.unit ? h("span", { class: "unit" }, opts.unit) : null);
}

function maskKey(key: string): string {
  if (key.length < 12) return "••••";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

function errorText(code: string | undefined, detail?: string): string {
  const base = code ? t(`error.${code}` as MessageKey) : t("error.unknown");
  return detail ? `${base} ${detail}` : base;
}

function sectionShell(id: SectionId, index: number, titleKey: MessageKey, intro?: Child): HTMLElement {
  const body = h("div", { class: "stack" });
  containers.set(id, body);
  return h(
    "section",
    { class: "section", id },
    h(
      "header",
      null,
      h("span", { class: "eyebrow" }, `${String(index + 1).padStart(2, "0")} — ${t(titleKey)}`),
      h("h2", { class: "display-medium" }, t(titleKey)),
      intro ?? null,
    ),
    body,
  );
}

// ---------- 01 providers ----------

function modelOptions(provider: ProviderId): ModelInfo[] {
  const known = allModels(state.settings.customModels).filter((m) => m.provider === provider);
  const extra = (state.fetched[provider] ?? []).filter((id) => !known.some((m) => m.id === id)).map((id) => guessModel(provider, id));
  return [...known, ...extra];
}

async function testProvider(provider: ProviderId): Promise<void> {
  state.tests[provider] = { state: "testing", text: t("prov.testing") };
  renderSection("providers");
  const res = await sendRequest<TestKeyResponse>({ type: "test-key", provider });
  if (res.ok) {
    state.fetched[provider] = res.models ?? [];
    state.tests[provider] = { state: "ok", text: t("prov.ok", { n: res.models?.length ?? 0 }) };
  } else {
    state.tests[provider] = { state: "fail", text: t("prov.fail", { msg: errorText(res.error, res.detail) }) };
  }
  renderSection("providers");
}

function providerModule(provider: ProviderId): HTMLElement {
  const saved = state.secrets[provider];
  const p = state.settings.providers[provider];
  const reveal = state.revealed.has(provider);

  const input = h("input", {
    type: reveal ? "text" : "password",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: saved ? maskKey(saved) : t("prov.keyPlaceholder"),
    "aria-label": `${PROVIDER_LABEL[provider]} ${t("prov.key")}`,
  });
  input.value = state.drafts[provider] ?? "";
  input.addEventListener("input", () => (state.drafts[provider] = input.value));
  const commit = async () => {
    const value = (state.drafts[provider] ?? "").trim();
    if (!value) return;
    await saveSecret(provider, value);
    state.secrets[provider] = value;
    state.drafts[provider] = "";
    toast(t("prov.set"));
    void testProvider(provider);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void commit();
  });

  const test = state.tests[provider];
  const tone = test?.state === "ok" ? "positive-fg" : test?.state === "fail" ? "danger-fg" : "text-muted";

  const tierSelects = TIERS.map((tier) => {
    const options = modelOptions(provider);
    const current = p.tiers[tier];
    if (!options.some((m) => m.id === current)) options.push(guessModel(provider, current));
    return h(
      "div",
      { class: "kv" },
      h("span", { class: "label" }, t(`tier.${tier}` as MessageKey)),
      select(
        t(`tier.${tier}` as MessageKey),
        [{ options: options.map((m) => ({ value: m.id, label: m.priceKnown ? m.label : `${m.label} (${t("models.unpriced")})` })) }],
        current,
        (id) =>
          void save((s) => {
            s.providers[provider].tiers[tier] = id;
            if (!findModel(allModels(s.customModels), provider, id)) s.customModels.push(guessModel(provider, id));
          }, ["routing", "models"]),
      ),
    );
  });

  return h(
    "article",
    { class: "module" },
    h(
      "div",
      { class: "module-head" },
      h("h3", { class: "provider-title display-medium" }, PROVIDER_LABEL[provider]),
      h("span", { class: "badge", "data-tone": saved ? "positive" : undefined }, saved ? t("prov.set") : t("prov.notSet")),
      h("span", { style: "flex:1" }),
      h("a", { class: "btn btn-ghost btn-sm", href: PROVIDER_KEY_URL[provider], target: "_blank", rel: "noopener noreferrer" }, t("prov.getKey"), icon("external", 14)),
    ),
    h(
      "div",
      { class: "module-body stack" },
      h(
        "div",
        { class: "kv" },
        h("span", { class: "label" }, t("prov.key")),
        h(
          "div",
          { class: "row" },
          h(
            "label",
            { class: "field", style: "flex:1;min-width:220px" },
            input,
            h(
              "button",
              {
                class: "icon-btn",
                type: "button",
                title: reveal ? t("prov.hide") : t("prov.show"),
                "aria-label": reveal ? t("prov.hide") : t("prov.show"),
                onClick: () => {
                  if (reveal) state.revealed.delete(provider);
                  else state.revealed.add(provider);
                  renderSection("providers");
                },
              },
              icon(reveal ? "eyeOff" : "eye", 16),
            ),
          ),
          h("button", { class: "btn btn-primary", type: "button", onClick: () => void commit() }, t("prov.save")),
          h("button", { class: "btn", type: "button", disabled: !saved, onClick: () => void testProvider(provider) }, t("prov.test")),
          saved
            ? h(
                "button",
                {
                  class: "btn btn-ghost btn-danger",
                  type: "button",
                  onClick: async () => {
                    await saveSecret(provider, "");
                    state.secrets[provider] = "";
                    delete state.tests[provider];
                    renderSection("providers");
                    renderSection("routing");
                  },
                },
                t("prov.remove"),
              )
            : null,
        ),
        h("div", { class: "status-line", style: `color:var(--${tone})` }, test?.text ?? ""),
      ),
      h(
        "div",
        { class: "grid-2" },
        h("div", { class: "kv", style: "align-content:center" }, toggle(t("prov.enabled"), p.enabled, (v) => void save((s) => (s.providers[provider].enabled = v), ["routing"]))),
        h(
          "div",
          { class: "kv" },
          h("span", { class: "label" }, t("prov.budget")),
          numberField(p.monthlyBudgetUsd, (v) => void save((s) => (s.providers[provider].monthlyBudgetUsd = v), ["budget"]), {
            unit: "USD",
            step: "0.5",
            label: t("prov.budget"),
          }),
          h("span", { class: "xs muted" }, t("prov.budgetHint")),
        ),
      ),
      h(
        "div",
        { class: "kv" },
        h(
          "div",
          { class: "row", style: "justify-content:space-between" },
          h("span", { class: "label" }, t("prov.tiers")),
          saved ? h("button", { class: "btn btn-ghost btn-sm", type: "button", onClick: () => void testProvider(provider) }, icon("retry", 14), t("prov.fetchModels")) : null,
        ),
        h("div", { class: "grid-3" }, tierSelects),
      ),
      provider === "deepseek" && state.balance ? h("div", { class: "mono small secondary" }, t("prov.balance", { amount: state.balance })) : null,
    ),
  );
}

function renderProviders(): Child {
  return [h("p", { class: "intro secondary small", style: "margin:0" }, t("prov.storage")), PROVIDERS.map(providerModule)];
}

// ---------- 02 routing ----------

const SHORT_POST: PostFeatures = { chars: 180, threadCount: 0, images: 0, hasQuote: false };
const LONG_POST: PostFeatures = { chars: 1600, threadCount: 4, images: 2, hasQuote: true };

function previewCell(action: ActionId, features: PostFeatures): Child {
  const models = allModels(state.settings.customModels);
  const out = decideRoute(
    {
      action,
      features,
      settings: state.settings,
      models,
      keyed: keyedProviders(state.secrets),
      spent: spentByProvider(state.usage, Date.now()),
    },
    { mode: "auto" },
  );
  if (!out.ok) return h("span", { class: "muted small" }, t(`error.${out.error}` as MessageKey));
  const d = out.decision;
  const model = findModel(models, d.provider, d.model) ?? guessModel(d.provider, d.model);
  const est = estimateRun(model, action, features.chars, d.useVision ? features.images : 0, d.useWeb, new Date());
  return h(
    "div",
    null,
    h("div", { class: "small" }, d.modelLabel),
    h(
      "div",
      { class: "row", style: "gap:4px;margin-top:2px" },
      h("span", { class: "tag" }, t(`tier.${d.tier}` as MessageKey)),
      d.useWeb ? h("span", { class: "tag" }, "web") : null,
      h("span", { class: "mono xs muted" }, est.costUsd === null ? t("models.unpriced") : `~${formatUsd(est.costUsd, state.lang)}`),
    ),
  );
}

function renderRouting(): Child {
  const s = state.settings;
  const strategies: Strategy[] = ["economy", "balanced", "quality"];
  const order = s.providerOrder;
  const keyed = keyedProviders(state.secrets);

  const orderRows = order.map((provider, i) =>
    h(
      "div",
      { class: "order-row" },
      h("span", { class: "mono xs muted" }, String(i + 1).padStart(2, "0")),
      h("span", { class: "grow" }, PROVIDER_LABEL[provider]),
      h("span", { class: "badge", "data-tone": keyed.has(provider) ? "positive" : undefined }, keyed.has(provider) ? t("prov.set") : t("prov.notSet")),
      h(
        "button",
        {
          class: "icon-btn",
          type: "button",
          title: t("routing.up"),
          "aria-label": `${t("routing.up")}: ${PROVIDER_LABEL[provider]}`,
          disabled: i === 0,
          onClick: () =>
            void save((st) => {
              const o = st.providerOrder;
              [o[i - 1], o[i]] = [o[i]!, o[i - 1]!];
            }, ["routing"]),
        },
        icon("up", 16),
      ),
      h(
        "button",
        {
          class: "icon-btn",
          type: "button",
          title: t("routing.down"),
          "aria-label": `${t("routing.down")}: ${PROVIDER_LABEL[provider]}`,
          disabled: i === order.length - 1,
          onClick: () =>
            void save((st) => {
              const o = st.providerOrder;
              [o[i + 1], o[i]] = [o[i]!, o[i + 1]!];
            }, ["routing"]),
        },
        icon("down", 16),
      ),
    ),
  );

  const preview =
    keyed.size === 0
      ? h("div", { class: "empty-state" }, t("routing.noKeys"))
      : h(
          "div",
          { class: "table-wrap" },
          h(
            "table",
            { class: "table" },
            h("thead", null, h("tr", null, h("th", null, t("col.action")), h("th", null, t("routing.short")), h("th", null, t("routing.long")))),
            h(
              "tbody",
              null,
              ACTIONS.map((a) => h("tr", null, h("td", null, t(`action.${a}` as MessageKey)), h("td", null, previewCell(a, SHORT_POST)), h("td", null, previewCell(a, LONG_POST)))),
            ),
          ),
        );

  return [
    h(
      "div",
      { class: "grid-2" },
      h(
        "div",
        { class: "module" },
        h("div", { class: "module-head" }, h("span", { class: "label" }, t("routing.strategy"))),
        h(
          "div",
          { class: "module-body stack" },
          segmented(
            t("routing.strategy"),
            strategies.map((v) => ({ value: v, label: t(`strategy.${v}` as MessageKey) })),
            s.strategy,
            (v) => void save((st) => (st.strategy = v), ["routing"]),
            true,
          ),
          h("span", { class: "xs muted" }, t("routing.strategyHint")),
          toggle(t("routing.web"), s.webSearch, (v) => void save((st) => (st.webSearch = v), ["routing"])),
          h("span", { class: "xs muted" }, t("routing.webHint")),
          toggle(t("routing.images"), s.includeImages, (v) => void save((st) => (st.includeImages = v), ["routing"])),
          toggle(t("routing.thread"), s.includeThread, (v) => void save((st) => (st.includeThread = v))),
        ),
      ),
      h("div", { class: "module" }, h("div", { class: "module-head" }, h("span", { class: "label" }, t("routing.order"))), h("div", { class: "module-grid", style: "border:0;border-radius:0" }, orderRows)),
    ),
    h("div", { class: "module ticks" }, h("div", { class: "module-head" }, h("span", { class: "eyebrow" }, t("routing.preview"))), preview),
  ];
}

// ---------- 03 budget ----------

function renderBudget(): Child {
  const s = state.settings;
  const now = Date.now();
  const summary = summarizeUsage(state.usage, now);
  const lang = state.lang;
  const modes: BudgetMode[] = ["warn", "block"];

  const rows = PROVIDERS.map((p) => {
    const m = summary.month[p];
    const budget = s.providers[p].monthlyBudgetUsd;
    const left = tokensLeft(s, state.usage, p, m.costUsd, now);
    return h(
      "tr",
      null,
      h("td", null, PROVIDER_LABEL[p]),
      h("td", { class: "num" }, formatInt(m.requests, lang)),
      h("td", { class: "num" }, `${formatTokens(m.inputTokens, lang)} / ${formatTokens(m.outputTokens, lang)}`),
      h("td", { class: "num" }, formatInt(m.webSearches, lang)),
      h("td", { class: "num" }, formatUsd(m.costUsd, lang)),
      h("td", { class: "num" }, budget > 0 ? formatUsd(budget, lang) : "-"),
      h(
        "td",
        { class: "num", style: "min-width:120px" },
        budget > 0 ? [h("div", null, formatUsd(Math.max(0, budget - m.costUsd), lang)), budgetBar(m.costUsd, budget)] : "-",
      ),
      h("td", { class: "num" }, left ? h("span", { title: left.model.label }, formatTokens(left.tokens, lang)) : "-"),
    );
  });

  const recent = [...state.usage].reverse().slice(0, 25);
  const models = allModels(s.customModels);

  return [
    h(
      "div",
      { class: "grid-2" },
      h(
        "div",
        { class: "kv" },
        h("span", { class: "label" }, t("budget.global")),
        numberField(s.globalMonthlyBudgetUsd, (v) => void save((st) => (st.globalMonthlyBudgetUsd = v), ["budget"]), { unit: "USD", step: "1", label: t("budget.global") }),
        h("span", { class: "xs muted" }, t("prov.budgetHint")),
      ),
      h(
        "div",
        { class: "kv" },
        h("span", { class: "label" }, t("budget.mode")),
        segmented(t("budget.mode"), modes.map((v) => ({ value: v, label: t(`budget.${v}` as MessageKey) })), s.budgetMode, (v) => void save((st) => (st.budgetMode = v), ["routing"]), true),
      ),
    ),
    s.globalMonthlyBudgetUsd > 0
      ? h(
          "div",
          { class: "module module-body stack" },
          h(
            "div",
            { class: "row", style: "justify-content:space-between" },
            h("span", { class: "eyebrow" }, t("budget.month")),
            h("span", { class: "mono small" }, `${formatUsd(summary.monthTotal.costUsd, lang)} / ${formatUsd(s.globalMonthlyBudgetUsd, lang)}`),
          ),
          budgetBar(summary.monthTotal.costUsd, s.globalMonthlyBudgetUsd),
        )
      : null,
    h(
      "div",
      { class: "module" },
      h("div", { class: "module-head" }, h("span", { class: "eyebrow" }, t("budget.byProvider"))),
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "table" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, t("col.provider")),
              h("th", { class: "num" }, t("col.requests")),
              h("th", { class: "num" }, t("col.tokens")),
              h("th", { class: "num" }, t("col.searches")),
              h("th", { class: "num" }, t("col.spent")),
              h("th", { class: "num" }, t("col.budget")),
              h("th", { class: "num" }, t("col.left")),
              h("th", { class: "num" }, t("budget.tokensLeft")),
            ),
          ),
          h("tbody", null, rows),
          h(
            "tfoot",
            null,
            h(
              "tr",
              null,
              h("td", null, t("total")),
              h("td", { class: "num" }, formatInt(summary.monthTotal.requests, lang)),
              h("td", { class: "num" }, `${formatTokens(summary.monthTotal.inputTokens, lang)} / ${formatTokens(summary.monthTotal.outputTokens, lang)}`),
              h("td", { class: "num" }, formatInt(summary.monthTotal.webSearches, lang)),
              h("td", { class: "num" }, formatUsd(summary.monthTotal.costUsd, lang)),
              h("td", { class: "num" }, s.globalMonthlyBudgetUsd > 0 ? formatUsd(s.globalMonthlyBudgetUsd, lang) : "-"),
              h("td", { class: "num" }, s.globalMonthlyBudgetUsd > 0 ? formatUsd(Math.max(0, s.globalMonthlyBudgetUsd - summary.monthTotal.costUsd), lang) : "-"),
              h("td"),
            ),
          ),
        ),
      ),
    ),
    h("p", { class: "xs muted", style: "margin:0;max-width:72ch" }, t("budget.note")),
    h(
      "div",
      { class: "module" },
      h(
        "div",
        { class: "module-head" },
        h("span", { class: "eyebrow" }, t("budget.recent")),
        h("span", { style: "flex:1" }),
        state.usage.length
          ? h(
              "button",
              {
                class: "btn btn-ghost btn-sm btn-danger",
                type: "button",
                onClick: async () => {
                  if (!confirm(t("budget.resetConfirm"))) return;
                  state.usage = [];
                  await saveUsage([]);
                  renderSection("budget");
                  renderSection("routing");
                },
              },
              t("budget.reset"),
            )
          : null,
      ),
      recent.length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              { class: "table" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", null, t("col.time")),
                  h("th", null, t("col.action")),
                  h("th", null, t("col.model")),
                  h("th", { class: "num" }, t("col.tokens")),
                  h("th", { class: "num" }, t("col.cost")),
                ),
              ),
              h(
                "tbody",
                null,
                recent.map((e) =>
                  h(
                    "tr",
                    null,
                    h("td", { class: "mono xs" }, formatDateTime(e.ts, lang)),
                    h("td", null, t(`action.${e.action}` as MessageKey)),
                    h("td", { class: "small" }, findModel(models, e.provider, e.model)?.label ?? e.model),
                    h("td", { class: "num mono xs" }, `${formatTokens(e.inputTokens, lang)} / ${formatTokens(e.outputTokens, lang)}`),
                    h("td", { class: "num mono xs" }, e.costUsd === null ? t("models.unpriced") : formatUsd(e.costUsd, lang)),
                  ),
                ),
              ),
            ),
          )
        : h("div", { class: "empty-state" }, t("budget.empty")),
    ),
  ];
}

// ---------- 04 models ----------

function upsertModel(s: Settings, model: ModelInfo): void {
  const i = s.customModels.findIndex((m) => m.provider === model.provider && m.id === model.id);
  if (i === -1) s.customModels.push(model);
  else s.customModels[i] = model;
}

function priceInput(model: ModelInfo, field: "inputPrice" | "cachedInputPrice" | "outputPrice", label: string): HTMLElement {
  const input = h("input", { type: "number", min: "0", step: "0.001", inputmode: "decimal", "aria-label": `${model.label} ${label}` });
  input.value = model.priceKnown ? String(model[field]) : "";
  input.placeholder = "-";
  input.addEventListener("change", () => {
    const v = Math.max(0, Number(input.value) || 0);
    void save((s) => upsertModel(s, { ...model, [field]: v, priceKnown: true }), ["routing", "budget"]);
  });
  return h("label", { class: "field field-sm price-input" }, input);
}

function renderModels(): Child {
  const s = state.settings;
  const models = allModels(s.customModels);
  const catalogIds = new Set(CATALOG.map((m) => `${m.provider}:${m.id}`));
  const providerSel = select(
    t("col.provider"),
    [{ options: PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABEL[p] })) }],
    "anthropic",
    () => undefined,
  );
  const idInput = h("input", { type: "text", placeholder: "model-id", spellcheck: "false", "aria-label": t("models.addHint") });

  return [
    h("div", { class: "banner", "data-tone": "neutral" }, t("models.peak")),
    h(
      "div",
      { class: "module" },
      h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "table" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, t("col.provider")),
              h("th", null, t("col.id")),
              h("th", null, t("col.tier")),
              h("th", null, t("col.input")),
              h("th", null, t("col.cached")),
              h("th", null, t("col.output")),
              h("th", null, t("col.vision")),
              h("th", null, t("col.web")),
              h("th"),
            ),
          ),
          h(
            "tbody",
            null,
            models.map((m) => {
              const isCustom = !catalogIds.has(`${m.provider}:${m.id}`);
              const capability = (field: "vision" | "webSearch") =>
                isCustom
                  ? toggle("", m[field], (v) => void save((st) => upsertModel(st, { ...m, [field]: v }), ["routing"]))
                  : h("span", { class: "small secondary" }, m[field] ? t("yes") : t("no"));
              return h(
                "tr",
                null,
                h("td", { class: "small" }, PROVIDER_LABEL[m.provider]),
                h(
                  "td",
                  null,
                  h("div", { class: "small" }, m.label),
                  h("div", { class: "row", style: "gap:6px" }, h("span", { class: "mono xs muted" }, m.id), isCustom ? h("span", { class: "tag" }, t("models.custom")) : null),
                ),
                h(
                  "td",
                  null,
                  select(
                    t("col.tier"),
                    [{ options: TIERS.map((tier) => ({ value: tier, label: t(`tier.${tier}` as MessageKey) })) }],
                    m.tier,
                    (tier) => void save((st) => upsertModel(st, { ...m, tier: tier as Tier }), ["routing"]),
                  ),
                ),
                h("td", null, priceInput(m, "inputPrice", t("col.input"))),
                h("td", null, priceInput(m, "cachedInputPrice", t("col.cached"))),
                h("td", null, priceInput(m, "outputPrice", t("col.output"))),
                h("td", null, capability("vision")),
                h("td", null, capability("webSearch")),
                h(
                  "td",
                  null,
                  isCustom
                    ? h(
                        "button",
                        {
                          class: "icon-btn",
                          type: "button",
                          title: t("models.remove"),
                          "aria-label": `${t("models.remove")}: ${m.id}`,
                          onClick: () => void save((st) => (st.customModels = st.customModels.filter((x) => !(x.provider === m.provider && x.id === m.id))), ["models", "providers", "routing"]),
                        },
                        icon("close", 16),
                      )
                    : null,
                ),
              );
            }),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "row" },
      h("div", { style: "width:160px" }, providerSel),
      h("label", { class: "field", style: "flex:1;min-width:200px" }, idInput),
      h(
        "button",
        {
          class: "btn btn-primary",
          type: "button",
          onClick: () => {
            const id = idInput.value.trim();
            const provider = providerSel.value as ProviderId;
            if (!id || findModel(models, provider, id)) return;
            void save((st) => st.customModels.push(guessModel(provider, id)), ["models", "providers"]);
          },
        },
        t("models.add"),
      ),
      h(
        "button",
        {
          class: "btn btn-ghost",
          type: "button",
          onClick: () => void save((st) => (st.customModels = st.customModels.filter((m) => !catalogIds.has(`${m.provider}:${m.id}`))), ["models", "routing", "budget"]),
        },
        t("models.reset"),
      ),
    ),
  ];
}

// ---------- 05 features ----------

function renderFeatures(): Child {
  const s = state.settings;
  const details: Detail[] = ["brief", "standard", "detailed"];
  return [
    h(
      "div",
      { class: "module" },
      h("div", { class: "module-head" }, h("span", { class: "label" }, t("features.actions"))),
      h(
        "div",
        { class: "module-body grid-2" },
        ACTIONS.map((a) => toggle(t(`action.${a}` as MessageKey), s.actions[a], (v) => void save((st) => (st.actions[a] = v)))),
      ),
    ),
    h(
      "div",
      { class: "grid-2" },
      h(
        "div",
        { class: "kv" },
        h("span", { class: "label" }, t("features.detail")),
        segmented(t("features.detail"), details.map((v) => ({ value: v, label: t(`detail.${v}` as MessageKey) })), s.detail, (v) => void save((st) => (st.detail = v)), true),
      ),
      h(
        "div",
        { class: "kv" },
        h("span", { class: "label" }, t("features.outputLang")),
        languageSelect(t("features.outputLang"), { value: "ui", label: t("out.ui") }, s.outputLang, (v) => void save((st) => (st.outputLang = v as OutputLang))),
      ),
      h(
        "div",
        { class: "kv" },
        h("span", { class: "label" }, t("features.uiLang")),
        languageSelect(t("features.uiLang"), { value: "auto", label: t("lang.auto") }, s.uiLang, (v) => void changeUiLang(v as UiLangSetting)),
      ),
    ),
    h(
      "div",
      { class: "module module-body stack" },
      toggle(t("features.shortcuts"), s.shortcuts, (v) => void save((st) => (st.shortcuts = v))),
      h("span", { class: "mono xs muted" }, t("features.shortcutList")),
      toggle(t("features.cache"), s.cacheResults, (v) => void save((st) => (st.cacheResults = v))),
      toggle(t("features.readLinks"), s.readLinks && state.canReadLinks, (v) => void setReadLinks(v)),
      h("span", { class: "xs muted" }, t("features.readLinksHint")),
      toggle(t("features.wallets"), s.walletCards && state.canWallets, (v) => void setWalletCards(v)),
      h("span", { class: "xs muted" }, t("features.walletsHint", { hosts: WALLET_HOSTS.join(", ") })),
      s.walletCards && state.canWallets && !state.canTokenSources
        ? h(
            "div",
            { class: "row" },
            h("span", { class: "xs" }, t("features.walletsMore")),
            h("button", { class: "btn btn-sm", type: "button", onClick: () => void allowTokenSources() }, t("features.walletsAllow")),
          )
        : null,
      s.walletCards && state.canWallets ? explorerField("etherscan") : null,
      s.walletCards && state.canWallets ? explorerField("blockscout") : null,
    ),
  ];
}

interface ExplorerInfo {
  origin: string;
  keyUrl: string;
  label: MessageKey;
  hint: MessageKey;
  ok: MessageKey;
}

/** The two optional explorer keys: each reader brings their own, used only in the service worker. */
const EXPLORERS: Record<ExplorerName, ExplorerInfo> = {
  etherscan: { origin: "https://api.etherscan.io/*", keyUrl: "https://etherscan.io/apidashboard", label: "features.etherscanKey", hint: "features.etherscanHint", ok: "features.etherscanOk" },
  blockscout: { origin: "https://api.blockscout.com/*", keyUrl: "https://dev.blockscout.com", label: "features.blockscoutKey", hint: "features.blockscoutHint", ok: "features.blockscoutOk" },
};

function explorerField(name: ExplorerName): HTMLElement {
  const e = state.explorers[name];
  const info = EXPLORERS[name];
  const input = h("input", {
    type: e.reveal ? "text" : "password",
    autocomplete: "off",
    spellcheck: "false",
    placeholder: e.saved ? maskKey(e.saved) : t("prov.keyPlaceholder"),
    "aria-label": t(info.label),
  });
  input.value = e.draft;
  input.addEventListener("input", () => (e.draft = input.value));
  const commit = async () => {
    const value = e.draft.trim();
    if (!value) return;
    // The permission prompt has to come first, while the click still counts as the reader's gesture.
    const granted = await chrome.permissions.request({ origins: [info.origin] }).catch(() => false);
    if (!granted) {
      toast(t("features.readLinksDenied"));
      return;
    }
    await saveExplorerKey(name, value);
    e.saved = value;
    e.draft = "";
    await testExplorer(name);
  };
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") void commit();
  });
  const tone = e.test?.state === "ok" ? "positive-fg" : e.test?.state === "fail" ? "danger-fg" : "text-muted";
  return h(
    "div",
    { class: "kv" },
    h("span", { class: "label" }, t(info.label)),
    h(
      "div",
      { class: "row" },
      h(
        "label",
        { class: "field", style: "flex:1;min-width:220px" },
        input,
        h(
          "button",
          {
            class: "icon-btn",
            type: "button",
            title: e.reveal ? t("prov.hide") : t("prov.show"),
            "aria-label": e.reveal ? t("prov.hide") : t("prov.show"),
            onClick: () => {
              e.reveal = !e.reveal;
              renderSection("features");
            },
          },
          icon(e.reveal ? "eyeOff" : "eye", 16),
        ),
      ),
      h("button", { class: "btn btn-primary", type: "button", onClick: () => void commit() }, t("prov.save")),
      e.saved ? h("button", { class: "btn", type: "button", onClick: () => void testExplorer(name) }, t("prov.test")) : null,
      e.saved
        ? h(
            "button",
            {
              class: "btn btn-ghost btn-danger",
              type: "button",
              onClick: async () => {
                await saveExplorerKey(name, "");
                e.saved = "";
                e.test = undefined;
                renderSection("features");
              },
            },
            t("prov.remove"),
          )
        : null,
      h("a", { class: "btn btn-ghost btn-sm", href: info.keyUrl, target: "_blank", rel: "noopener noreferrer" }, t("prov.getKey"), icon("external", 14)),
    ),
    e.test ? h("div", { class: "status-line", style: `color:var(--${tone})` }, e.test.text) : null,
    h("span", { class: "xs muted" }, t(info.hint)),
  );
}

async function testExplorer(name: ExplorerName): Promise<void> {
  const e = state.explorers[name];
  e.test = { state: "testing", text: t("prov.testing") };
  renderSection("features");
  // A worker that does not know the request answers with nothing: this page is newer than
  // the running extension, which happens until the extension is reloaded.
  const res = await sendRequest<{ ok: boolean; detail?: string } | null | undefined>({ type: "test-explorer", explorer: name }).catch(() => null);
  if (!res) e.test = { state: "fail", text: t("features.reloadNeeded") };
  else if (res.ok) e.test = { state: "ok", text: t(EXPLORERS[name].ok) };
  else e.test = { state: "fail", text: res.detail === "permission" ? t("features.readLinksDenied") : t("prov.fail", { msg: res.detail ?? t("error.unknown") }) };
  renderSection("features");
}

async function changeUiLang(value: UiLangSetting): Promise<void> {
  await save((st) => (st.uiLang = value));
  state.lang = resolveUiLang(value, navigator.language);
  renderAll();
}

/** Turning link reading on asks Chrome for the all-sites permission; it must start inside the click. */
async function setReadLinks(on: boolean): Promise<void> {
  if (on) {
    const granted = await chrome.permissions.request({ origins: ["<all_urls>"] }).catch(() => false);
    state.canReadLinks = granted;
    if (!granted) {
      toast(t("features.readLinksDenied"));
      renderSection("features");
      return;
    }
  }
  await save((st) => (st.readLinks = on), ["features"]);
}

/** Wallet cards read a fixed list of public hosts, asked for in the same click that turns them on. */
async function setWalletCards(on: boolean): Promise<void> {
  if (on) {
    const granted = await chrome.permissions.request({ origins: WALLET_ORIGINS }).catch(() => false);
    state.canWallets = granted;
    state.canTokenSources = granted;
    if (!granted) {
      toast(t("features.readLinksDenied"));
      renderSection("features");
      return;
    }
  }
  await save((st) => (st.walletCards = on), ["features"]);
}

/** For a reader who allowed wallet cards before the token sources existed. */
async function allowTokenSources(): Promise<void> {
  state.canTokenSources = await chrome.permissions.request({ origins: TOKEN_ORIGINS }).catch(() => false);
  if (!state.canTokenSources) toast(t("features.readLinksDenied"));
  renderSection("features");
}

// ---------- 06 history ----------

function historyResult(entry: HistoryEntry): HTMLElement {
  const r = entry.result;
  const box = h("div", { class: "history-result prose" });
  if (r.action === "verify") {
    const v = parseVerdict(`${r.text}\n`);
    if (v.verdict) box.appendChild(h("p", null, h("strong", null, `${t(`verdict.${v.verdict}` as MessageKey)}${v.confidence !== null ? ` · ${v.confidence}%` : ""}`)));
    box.appendChild(renderMarkdown(v.body));
  } else if (r.action === "translate") {
    box.appendChild(h("p", { style: "white-space:pre-wrap" }, linkify(r.text)));
  } else {
    box.appendChild(renderMarkdown(r.text));
  }
  if (r.sources.length) {
    box.appendChild(h("h4", null, t("card.sources")));
    box.appendChild(h("ol", null, r.sources.slice(0, 8).map((s) => h("li", null, h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title)))));
  }
  return box;
}

function renderHistory(): Child {
  const items = [...state.history].reverse();
  if (!items.length) return h("div", { class: "module empty-state" }, t("history.empty"));
  return [
    h(
      "div",
      { class: "row", style: "justify-content:flex-end" },
      h(
        "button",
        {
          class: "btn btn-ghost btn-danger btn-sm",
          type: "button",
          onClick: async () => {
            if (!confirm(t("history.clearConfirm"))) return;
            state.history = [];
            await saveHistory([]);
            renderSection("history");
          },
        },
        t("history.clear"),
      ),
    ),
    h(
      "div",
      { class: "module-grid" },
      items.slice(0, 100).map((entry) => {
        const open = state.openHistory.has(entry.key);
        const r = entry.result;
        return h(
          "article",
          { class: `history-item rail${open ? " rail-active" : ""}` },
          h(
            "div",
            { class: "row", style: "justify-content:space-between" },
            h(
              "div",
              { class: "row", style: "gap:8px" },
              h("span", { class: "eyebrow" }, t(`action.${r.action}` as MessageKey)),
              h("span", { class: "small" }, `@${entry.tweet.handle}`),
            ),
            h("span", { class: "mono xs muted" }, `${formatDateTime(r.ts, state.lang)} · ${r.modelLabel} · ${formatUsd(r.costUsd, state.lang)}`),
          ),
          h("p", { class: "excerpt" }, entry.tweet.text),
          h(
            "div",
            { class: "row" },
            h(
              "button",
              {
                class: "btn btn-sm",
                type: "button",
                "aria-expanded": open ? "true" : "false",
                onClick: () => {
                  if (open) state.openHistory.delete(entry.key);
                  else state.openHistory.add(entry.key);
                  renderSection("history");
                },
              },
              open ? t("history.hide") : t("history.show"),
            ),
            h("a", { class: "btn btn-ghost btn-sm", href: entry.tweet.url, target: "_blank", rel: "noopener noreferrer" }, t("history.open"), icon("external", 14)),
          ),
          open ? historyResult(entry) : null,
        );
      }),
    ),
  ];
}

// ---------- 07 help ----------

function renderHelp(): Child {
  const faqs = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
    h("details", { class: "faq" }, h("summary", null, t(`help.q${n}` as MessageKey)), h("p", null, t(`help.a${n}` as MessageKey))),
  );
  return [
    updatesModule(),
    h("div", { class: "module" }, faqs),
    h("span", { class: "mono xs muted" }, `Postsight ${__POSTSIGHT_VERSION__} · ${t("models.intro", { date: PRICES_CHECKED })}`),
  ];
}

function updatesModule(): HTMLElement {
  const u = state.update;
  const github = u?.source !== "store";
  let status: string | null = null;
  if (state.checkingUpdate) status = t("update.checking");
  else if (u && github && !u.off) {
    const parts = [u.failed ? t("update.failed") : u.latest ? null : t("update.upToDate", { current: u.current })];
    if (u.checkedAt) parts.push(t("update.checked", { time: formatDateTime(u.checkedAt, state.lang) }));
    status = parts.filter(Boolean).join(" · ");
  }
  return h(
    "div",
    { class: "module" },
    h(
      "div",
      { class: "module-head" },
      h("span", { class: "label" }, t("update.title")),
      h("span", { class: "mono xs muted" }, t("update.version", { current: __POSTSIGHT_VERSION__ })),
    ),
    h(
      "div",
      { class: "module-body stack" },
      updateBanner(u, t),
      github
        ? [
            toggle(t("update.check"), state.settings.checkUpdates, (v) => void setCheckUpdates(v)),
            h("span", { class: "xs muted" }, t("update.checkHint")),
          ]
        : h("span", { class: "xs muted" }, t("update.store")),
      github && state.settings.checkUpdates
        ? h(
            "div",
            { class: "row" },
            h("button", { class: "btn btn-sm", type: "button", disabled: state.checkingUpdate, onClick: () => void refreshUpdate(true) }, t("update.checkNow")),
            status ? h("span", { class: "xs muted" }, status) : null,
          )
        : null,
    ),
  );
}

function renderUpdateSlot(): void {
  const banner = updateBanner(state.update, t);
  replace(updateSlot, banner);
  updateSlot.hidden = !banner;
}

async function refreshUpdate(force = false): Promise<void> {
  if (force) {
    state.checkingUpdate = true;
    renderSection("help");
  }
  state.update = await loadUpdateStatus(force);
  state.checkingUpdate = false;
  renderSection("help");
  renderUpdateSlot();
}

async function setCheckUpdates(on: boolean): Promise<void> {
  await save((s) => (s.checkUpdates = on));
  await refreshUpdate();
}

// ---------- layout ----------

const BUILDERS: Record<SectionId, () => Child> = {
  providers: renderProviders,
  routing: renderRouting,
  budget: renderBudget,
  models: renderModels,
  features: renderFeatures,
  history: renderHistory,
  help: renderHelp,
};

const TITLES: Record<SectionId, MessageKey> = {
  providers: "nav.providers",
  routing: "nav.routing",
  budget: "nav.budget",
  models: "nav.models",
  features: "nav.features",
  history: "nav.history",
  help: "nav.help",
};

function renderSection(id: SectionId): void {
  const el = containers.get(id);
  if (el) replace(el, BUILDERS[id]());
}

let observer: IntersectionObserver | null = null;

function renderAll(): void {
  t = translator(state.lang);
  document.documentElement.lang = state.lang;
  document.title = `Postsight · ${t("opt.title")}`;
  containers.clear();

  const intros: Partial<Record<SectionId, Child>> = {
    routing: h("p", { class: "intro" }, t("routing.intro")),
    models: h("p", { class: "intro" }, t("models.intro", { date: PRICES_CHECKED })),
  };
  const sections = SECTION_IDS.map((id, i) => sectionShell(id, i, TITLES[id], intros[id]));
  const navLinks = SECTION_IDS.map((id, i) =>
    h("a", { href: `#${id}`, "data-section": id }, h("span", { class: "num mono" }, String(i + 1).padStart(2, "0")), t(TITLES[id])),
  );
  replace(
    app,
    h(
      "header",
      { class: "topbar" },
      h(
        "div",
        { class: "topbar-inner" },
        h("span", { class: "mark", "aria-hidden": "true" }, icon("lens", 18)),
        h("span", { class: "title display-medium" }, "Postsight"),
        h("span", { class: "muted small subtitle" }, t("opt.title")),
        h("span", { class: "spacer" }),
        h(
          "div",
          { class: "topbar-lang" },
          languageSelect(t("features.uiLang"), { value: "auto", label: t("lang.auto") }, state.settings.uiLang, (v) => void changeUiLang(v as UiLangSetting)),
        ),
      ),
    ),
    h("div", { class: "shell" }, h("nav", { class: "nav", "aria-label": t("opt.title") }, navLinks), h("main", { class: "content" }, updateSlot, sections)),
  );
  for (const id of SECTION_IDS) renderSection(id);
  renderUpdateSlot();

  observer?.disconnect();
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of navLinks) link.setAttribute("aria-current", String(link.dataset.section === entry.target.id));
      }
    },
    { rootMargin: "-80px 0px -60% 0px" },
  );
  for (const s of sections) observer.observe(s);
}

async function loadBalance(): Promise<void> {
  if (!state.secrets.deepseek) return;
  const res = await sendRequest<BalanceResponse>({ type: "balance" });
  if (res.ok && res.balances?.length) {
    state.balance = res.balances.map((b) => `${b.total} ${b.currency}`).join(" · ");
    renderSection("providers");
  }
}

async function init(): Promise<void> {
  const [settings, secrets, usage, history] = await Promise.all([loadSettings(), loadSecrets(), loadUsage(), loadHistory()]);
  Object.assign(state, { settings, secrets, usage, history, lang: resolveUiLang(settings.uiLang, navigator.language), lastSaved: JSON.stringify(settings) });
  state.canReadLinks = await chrome.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
  state.canWallets = await chrome.permissions.contains({ origins: CORE_ORIGINS }).catch(() => false);
  state.canTokenSources = await chrome.permissions.contains({ origins: TOKEN_ORIGINS }).catch(() => false);
  const explorerKeys = await loadExplorerKeys();
  state.explorers.etherscan.saved = explorerKeys.etherscan;
  state.explorers.blockscout.saved = explorerKeys.blockscout;
  renderAll();
  const hash = location.hash.slice(1);
  if (hash) document.getElementById(hash)?.scrollIntoView();
  void loadBalance();
  void refreshUpdate();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) {
      const next = mergeSettings(changes.settings.newValue as Partial<Settings>);
      // Changes this page made itself are already on screen; re-rendering would steal focus.
      if (JSON.stringify(next) !== state.lastSaved) {
        state.settings = next;
        state.lastSaved = JSON.stringify(next);
        state.lang = resolveUiLang(next.uiLang, navigator.language);
        renderAll();
      }
    }
    if (changes.usage) {
      state.usage = (changes.usage.newValue as UsageEntry[] | undefined) ?? [];
      renderSection("budget");
    }
    if (changes.history) {
      state.history = (changes.history.newValue as HistoryEntry[] | undefined) ?? [];
      renderSection("history");
    }
    if (changes.secrets) {
      state.secrets = { ...state.secrets, ...((changes.secrets.newValue as Partial<Secrets> | undefined) ?? {}) };
      renderSection("providers");
      renderSection("routing");
    }
  });
}

void init();
