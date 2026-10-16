import { formatTokens, formatUsd } from "../shared/format";
import { translator } from "../shared/i18n";
import type { MessageKey } from "../shared/i18n";
import type { BalanceResponse } from "../shared/messages";
import { sendRequest } from "../shared/messages";
import { allModels, PROVIDER_LABEL } from "../shared/models";
import { resolveUiLang } from "../shared/settings";
import { keyedProviders, loadSecrets, loadSettings, loadUsage, updateSettings } from "../shared/storage";
import { PROVIDERS } from "../shared/types";
import type { OutputLang, ProviderId, RouteChoice, Strategy, UiLangSetting } from "../shared/types";
import { summarizeUsage } from "../shared/usage";
import { tokensLeft } from "../ui/budget";
import { budgetBar, languageSelect, segmented, select, toggle } from "../ui/controls";
import { h, icon, replace } from "../ui/dom";

const app = document.getElementById("app")!;
let balanceLine: HTMLElement | null = null;

function openOptions(section?: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html${section ? `#${section}` : ""}`) });
  window.close();
}

async function render(): Promise<void> {
  const [settings, secrets, usage] = await Promise.all([loadSettings(), loadSecrets(), loadUsage()]);
  const lang = resolveUiLang(settings.uiLang, navigator.language);
  const t = translator(lang);
  document.documentElement.lang = lang;
  const keyed = keyedProviders(secrets);
  const now = Date.now();
  const summary = summarizeUsage(usage, now);

  const head = h(
    "header",
    { class: "pop-head" },
    h("span", { class: "mark", "aria-hidden": "true" }, icon("lens", 18)),
    h("span", { class: "title display-medium" }, "Postsight"),
    toggle("", settings.enabled, (enabled) => void updateSettings((s) => (s.enabled = enabled))),
  );
  head.querySelector("input")?.setAttribute("aria-label", t("popup.toggle"));
  head.querySelector(".switch")?.setAttribute("title", t("popup.toggle"));

  if (keyed.size === 0) {
    replace(
      app,
      head,
      h(
        "section",
        { class: "pop-section" },
        h("span", { class: "eyebrow" }, t("nav.providers")),
        h("p", { class: "secondary", style: "margin:0" }, t("popup.noKeys")),
        h("button", { class: "btn btn-primary", type: "button", onClick: () => openOptions("providers") }, t("popup.addKey")),
      ),
      languageSection(),
      footer(),
    );
    return;
  }

  // Model picker
  const models = allModels(settings.customModels).filter((m) => keyed.has(m.provider));
  const routeValue = settings.route.mode === "auto" ? "auto" : `${settings.route.provider}:${settings.route.model}`;
  const modelSelect = select(
    t("popup.defaultModel"),
    [
      { options: [{ value: "auto", label: t("route.auto") }] },
      ...PROVIDERS.filter((p) => keyed.has(p)).map((p) => ({
        label: PROVIDER_LABEL[p],
        options: models.filter((m) => m.provider === p).map((m) => ({ value: `${p}:${m.id}`, label: m.label })),
      })),
    ],
    routeValue,
    (value) => {
      const [provider, ...rest] = value.split(":");
      const route: RouteChoice =
        value === "auto" ? { mode: "auto" } : { mode: "manual", provider: provider as ProviderId, model: rest.join(":") };
      void updateSettings((s) => (s.route = route));
    },
  );
  const strategies: Strategy[] = ["economy", "balanced", "quality"];
  const modelSection = h(
    "section",
    { class: "pop-section" },
    h("label", { class: "label", for: "model" }, t("popup.defaultModel")),
    modelSelect,
    settings.route.mode === "auto"
      ? segmented(
          t("popup.strategy"),
          strategies.map((s) => ({ value: s, label: t(`strategy.${s}` as MessageKey) })),
          settings.strategy,
          (strategy) => void updateSettings((s) => (s.strategy = strategy)),
          true,
        )
      : null,
  );
  modelSelect.id = "model";

  // Usage
  const total = summary.monthTotal.costUsd;
  const budget = settings.globalMonthlyBudgetUsd;
  const usageSection = h(
    "section",
    { class: "pop-section" },
    h(
      "div",
      { class: "pop-row" },
      h("span", { class: "eyebrow" }, t("popup.month")),
      h("span", { class: "mono xs muted" }, t("popup.requests", { n: summary.monthTotal.requests })),
    ),
    h("div", { class: "pop-row" }, h("span", { class: "big display num" }, formatUsd(total, lang)), budget > 0 ? null : h("span", { class: "xs muted" }, t("popup.noBudget"))),
    budget > 0 ? budgetBar(total, budget) : null,
    budget > 0
      ? h("span", { class: "xs secondary" }, t("popup.left", { amount: formatUsd(Math.max(0, budget - total), lang), budget: formatUsd(budget, lang) }))
      : null,
    summary.monthTotal.unpriced ? h("span", { class: "xs muted" }, t("popup.unpriced", { n: summary.monthTotal.unpriced })) : null,
    h(
      "div",
      null,
      PROVIDERS.filter((p) => keyed.has(p) || summary.month[p].requests > 0).map((p) => {
        const spent = summary.month[p].costUsd;
        const pBudget = settings.providers[p].monthlyBudgetUsd;
        const left = tokensLeft(settings, usage, p, spent, now);
        const row = h(
          "div",
          { class: "provider-row" },
          h(
            "div",
            { class: "pop-row" },
            h("span", { class: "small" }, PROVIDER_LABEL[p]),
            h("span", { class: "mono small" }, pBudget > 0 ? `${formatUsd(spent, lang)} / ${formatUsd(pBudget, lang)}` : formatUsd(spent, lang)),
          ),
          pBudget > 0 ? budgetBar(spent, pBudget) : null,
          left ? h("span", { class: "xs muted" }, t("popup.tokensLeft", { tokens: formatTokens(left.tokens, lang), model: left.model.label })) : null,
        );
        if (p === "deepseek" && keyed.has("deepseek")) {
          balanceLine = h("span", { class: "xs muted mono" });
          row.appendChild(balanceLine);
        }
        return row;
      }),
    ),
  );

  replace(app, head, modelSection, usageSection, languageSection(), footer());
  if (balanceLine) void showBalance(balanceLine, t);

  function languageSection(): HTMLElement {
    return h(
      "section",
      { class: "pop-section" },
      h(
        "div",
        { class: "pop-langs" },
        h(
          "label",
          { class: "kv" },
          h("span", { class: "label" }, t("popup.uiLang")),
          languageSelect(t("popup.uiLang"), { value: "auto", label: t("lang.auto") }, settings.uiLang, (v) => void updateSettings((s) => (s.uiLang = v as UiLangSetting))),
        ),
        h(
          "label",
          { class: "kv" },
          h("span", { class: "label" }, t("popup.outputLang")),
          languageSelect(t("popup.outputLang"), { value: "ui", label: t("out.ui") }, settings.outputLang, (v) => void updateSettings((s) => (s.outputLang = v as OutputLang))),
        ),
      ),
    );
  }

  function footer(): HTMLElement {
    return h(
      "footer",
      { class: "pop-foot" },
      h("button", { class: "btn", type: "button", onClick: () => openOptions() }, icon("settings", 16), t("popup.settings")),
      h("button", { class: "btn", type: "button", onClick: () => openOptions("history") }, icon("history", 16), t("popup.history")),
    );
  }
}

async function showBalance(el: HTMLElement, t: ReturnType<typeof translator>): Promise<void> {
  const res = await sendRequest<BalanceResponse>({ type: "balance" });
  if (res.ok && res.balances?.length) {
    el.textContent = `${t("popup.balance")}: ${res.balances.map((b) => `${b.total} ${b.currency}`).join(" · ")}`;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.settings || changes.secrets || changes.usage)) void render();
});

void render();
