import { translator } from "../shared/i18n";
import type { MessageKey } from "../shared/i18n";
import type { ContentConfig, EstimateResponse } from "../shared/messages";
import { sendRequest } from "../shared/messages";
import { PROVIDER_LABEL } from "../shared/models";
import type { PostFeatures } from "../shared/router";
import type { ActionId, ModelInfo, ProviderId, RouteChoice, UiLang } from "../shared/types";
import { formatTokens, formatUsd } from "../shared/format";
import { h, icon, replace } from "../ui/dom";
import type { IconName } from "../ui/dom";
import { adoptStyles } from "./styles";

export type CopyKind = "text" | "link" | "quote";

export interface MenuOptions {
  config: ContentConfig;
  features: PostFeatures;
  onAction(action: ActionId, route: RouteChoice, question?: string): void;
  onCopy(kind: CopyKind): void;
  /** Addresses and names in the post, each opening its wallet card. */
  wallets?: { label: string; onOpen(): void }[];
}

const ACTION_ICON: Record<ActionId, IconName> = {
  verify: "verify",
  research: "research",
  summarize: "summarize",
  translate: "translate",
  explain: "explain",
  reply: "reply",
  ask: "ask",
};

const SHORTCUT: Partial<Record<ActionId, string>> = {
  verify: "Alt+V",
  research: "Alt+R",
  summarize: "Alt+S",
  translate: "Alt+T",
  explain: "Alt+E",
};

export function routeLabel(route: RouteChoice, models: readonly ModelInfo[], lang: UiLang): string {
  if (route.mode === "auto") return translator(lang)("route.auto");
  return models.find((m) => m.provider === route.provider && m.id === route.model)?.label ?? route.model;
}

function routeKey(route: RouteChoice): string {
  return route.mode === "auto" ? "auto" : `${route.provider}:${route.model}`;
}

/**
 * One fixed-position layer for menus, pickers and toasts, outside X's own DOM so
 * timeline re-renders cannot remove it.
 */
export class Overlay {
  readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private panel: HTMLElement | null = null;
  private anchor: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.host = h("div", { "data-postsight-overlay": "" });
    Object.assign(this.host.style, { position: "fixed", top: "0", left: "0", width: "0", height: "0", zIndex: "2147483000" });
    this.root = this.host.attachShadow({ mode: "open" });
    adoptStyles(this.root);
    document.documentElement.appendChild(this.host);

    // X has page-wide keyboard shortcuts; keystrokes typed into Postsight must not reach them.
    for (const type of ["keydown", "keyup", "keypress"]) this.host.addEventListener(type, (e) => e.stopPropagation());
    document.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.panel) return;
        const path = e.composedPath();
        if (!path.includes(this.host) && !(this.anchor && path.includes(this.anchor))) this.close();
      },
      true,
    );
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.panel) this.close();
    });
    window.addEventListener("resize", () => this.close());
    window.addEventListener("scroll", (e) => {
      if (this.panel && (e.target === document || e.target === document.documentElement)) this.close();
    }, true);
  }

  setTheme(theme: "light" | "dark"): void {
    this.host.dataset.theme = theme;
  }

  isOpenFor(anchor: HTMLElement): boolean {
    return this.panel !== null && this.anchor === anchor;
  }

  close(): void {
    this.panel?.remove();
    this.anchor?.setAttribute("aria-expanded", "false");
    this.panel = null;
    this.anchor = null;
  }

  private show(panel: HTMLElement, anchor: HTMLElement): void {
    this.close();
    this.panel = panel;
    this.anchor = anchor;
    anchor.setAttribute("aria-expanded", "true");
    this.root.appendChild(panel);
    this.place();
  }

  /** Keeps the panel next to its anchor and inside the viewport. */
  private place(): void {
    if (!this.panel || !this.anchor) return;
    const rect = this.anchor.getBoundingClientRect();
    const width = this.panel.offsetWidth;
    const height = this.panel.offsetHeight;
    const gap = 6;
    let left = rect.right - width;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.bottom + gap;
    if (top + height > window.innerHeight - 8) {
      const above = rect.top - height - gap;
      top = above >= 8 ? above : Math.max(8, window.innerHeight - height - 8);
    }
    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }

  toast(text: string, tone: "positive" | "danger" = "positive"): void {
    this.root.querySelector(".toast")?.remove();
    clearTimeout(this.toastTimer);
    const el = h("div", { class: "toast", role: "status", "data-tone": tone }, icon(tone === "danger" ? "alert" : "check", 16), text);
    this.root.appendChild(el);
    this.toastTimer = setTimeout(() => el.remove(), 1800);
  }

  openMenu(anchor: HTMLElement, opts: MenuOptions): void {
    const { config } = opts;
    const t = translator(config.lang);
    let route: RouteChoice = config.route;
    const estimates = new Map<string, EstimateResponse>();

    const panel = h("div", { class: "panel", role: "menu", "aria-label": "Postsight" });
    const body = h("div");
    const foot = h("div", { class: "panel-foot" });

    const describe = (action: ActionId): string => {
      const est = estimates.get(`${routeKey(route)}|${action}`);
      if (!est) return "";
      if (!est.ok) return t(`error.${est.error}` as MessageKey);
      const d = est.decision;
      const parts = [`${d.auto ? `${t("route.auto")} → ` : ""}${d.modelLabel}`];
      if (d.useWeb) parts.push("web");
      const cost = est.estimate.costUsd === null ? t("menu.priceUnknown") : formatUsd(est.estimate.costUsd, config.lang);
      parts.push(t("menu.estimate", { tokens: formatTokens(est.estimate.inputTokens + est.estimate.outputTokens, config.lang), cost }));
      return parts.join(" · ");
    };

    const setFoot = (action: ActionId | null) => {
      replace(foot, h("span", null, action ? describe(action) : t("route.autoHint")));
    };

    const costCell = (action: ActionId) => {
      const est = estimates.get(`${routeKey(route)}|${action}`);
      if (!est?.ok || est.estimate.costUsd === null) return "";
      return `~${formatUsd(est.estimate.costUsd, config.lang)}`;
    };

    const loadEstimates = async () => {
      const key = routeKey(route);
      await Promise.all(
        config.actions.map(async (action) => {
          if (estimates.has(`${key}|${action}`)) return;
          const res = await sendRequest<EstimateResponse>({ type: "estimate", action, features: opts.features, route });
          estimates.set(`${key}|${action}`, res);
        }),
      );
      if (this.panel === panel && view === "actions") renderActions();
    };

    let view: "actions" | "models" | "ask" = "actions";

    const head = (title: Node) => {
      const chip = h(
        "button",
        { class: "chip", type: "button", title: t("menu.model"), onClick: () => ((view = "models"), render()) },
        h("span", null, routeLabel(route, config.models, config.lang)),
        icon("chevronDown", 14),
      );
      return h(
        "div",
        { class: "panel-head" },
        title,
        config.hasKey ? chip : null,
        h(
          "button",
          {
            class: "icon-btn",
            type: "button",
            title: t("menu.openSettings"),
            "aria-label": t("menu.openSettings"),
            onClick: () => {
              this.close();
              void sendRequest({ type: "open-options" });
            },
          },
          icon("settings", 16),
        ),
      );
    };

    const copyRow = () =>
      h(
        "div",
        { class: "copy-row" },
        (
          [
            ["text", "copy", "copy.text"],
            ["link", "link", "copy.link"],
            ["quote", "quote", "copy.quote"],
          ] as const
        ).map(([kind, ic, label]) =>
          h(
            "button",
            {
              class: "copy-btn",
              type: "button",
              onClick: () => {
                opts.onCopy(kind);
                this.close();
              },
            },
            icon(ic, 16),
            t(label),
          ),
        ),
      );

    const walletRows = () =>
      opts.wallets?.length
        ? [
            h("div", { class: "section-label label" }, t("wallet.inPost")),
            h(
              "div",
              { class: "list" },
              opts.wallets.map((w) =>
                h(
                  "button",
                  {
                    class: "item",
                    type: "button",
                    role: "menuitem",
                    onClick: () => {
                      this.close();
                      w.onOpen();
                    },
                  },
                  icon("wallet", 18),
                  h("span", { class: "item-title mono" }, w.label),
                ),
              ),
            ),
          ]
        : null;

    const renderActions = () => {
      if (!config.hasKey) {
        replace(
          body,
          head(h("span", { class: "eyebrow" }, "Postsight")),
          h(
            "div",
            { class: "empty" },
            t("menu.noKey"),
            h(
              "button",
              {
                class: "btn btn-primary",
                type: "button",
                onClick: () => {
                  this.close();
                  void sendRequest({ type: "open-options", section: "providers" });
                },
              },
              t("menu.openSettings"),
            ),
          ),
          h("div", { class: "section-label label" }, t("menu.copy")),
          copyRow(),
          walletRows(),
        );
        foot.remove();
        return;
      }
      const items = config.actions.map((action) =>
        h(
          "button",
          {
            class: "item",
            type: "button",
            role: "menuitem",
            title: SHORTCUT[action] ?? "",
            onMouseenter: () => setFoot(action),
            onFocus: () => setFoot(action),
            onClick: () => {
              if (action === "ask") {
                view = "ask";
                render();
                return;
              }
              this.close();
              opts.onAction(action, route);
            },
          },
          icon(ACTION_ICON[action], 18),
          h(
            "span",
            null,
            h("span", { class: "item-title" }, t(`action.${action}` as MessageKey)),
            h("span", { class: "item-hint" }, t(`action.${action}.hint` as MessageKey)),
          ),
          h("span", { class: "item-cost" }, costCell(action)),
        ),
      );
      replace(
        body,
        head(h("span", { class: "eyebrow" }, "Postsight")),
        h("div", { class: "section-label label" }, t("menu.analyze")),
        h("div", { class: "list" }, items),
        h("div", { class: "section-label label" }, t("menu.copy")),
        copyRow(),
        walletRows(),
      );
      setFoot(null);
      panel.appendChild(foot);
    };

    const renderAsk = () => {
      const input = h("input", { type: "text", placeholder: t("ask.placeholder"), maxlength: 500, "aria-label": t("action.ask") });
      const submit = () => {
        const q = input.value.trim();
        if (!q) return;
        this.close();
        opts.onAction("ask", route, q);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") {
          e.stopPropagation();
          view = "actions";
          render();
        }
      });
      const back = h(
        "button",
        { class: "icon-btn", type: "button", "aria-label": t("menu.back"), onClick: () => ((view = "actions"), render()) },
        icon("chevronLeft", 16),
      );
      replace(
        body,
        h("div", { class: "panel-head" }, back, h("span", { class: "eyebrow" }, t("action.ask"))),
        h(
          "div",
          { class: "ask-form" },
          h("label", { class: "field" }, input),
          h("button", { class: "btn btn-primary", type: "button", onClick: submit, "aria-label": t("ask.send") }, icon("send", 16)),
        ),
      );
      setFoot("ask");
      panel.appendChild(foot);
      requestAnimationFrame(() => input.focus());
    };

    const renderModels = () => {
      const back = h(
        "button",
        { class: "icon-btn", type: "button", "aria-label": t("menu.back"), onClick: () => ((view = "actions"), render()) },
        icon("chevronLeft", 16),
      );
      replace(
        body,
        h("div", { class: "panel-head" }, back, h("span", { class: "eyebrow" }, t("menu.model"))),
        modelList(config.models, route, config.lang, (next) => {
          route = next;
          view = "actions";
          render();
          void loadEstimates();
        }),
      );
      foot.remove();
    };

    const render = () => {
      if (view === "models") renderModels();
      else if (view === "ask") renderAsk();
      else renderActions();
      this.place();
    };

    panel.appendChild(body);
    this.show(panel, anchor);
    render();
    if (config.hasKey) void loadEstimates();
  }

  openPicker(anchor: HTMLElement, lang: UiLang, models: readonly ModelInfo[], current: RouteChoice, onPick: (route: RouteChoice) => void): void {
    const t = translator(lang);
    const panel = h(
      "div",
      { class: "panel", role: "menu" },
      h("div", { class: "panel-head" }, h("span", { class: "eyebrow" }, t("card.retryWith"))),
      modelList(models, current, lang, (route) => {
        this.close();
        onPick(route);
      }),
    );
    this.show(panel, anchor);
  }
}

function modelList(models: readonly ModelInfo[], current: RouteChoice, lang: UiLang, onPick: (r: RouteChoice) => void): HTMLElement {
  const t = translator(lang);
  const currentKey = routeKey(current);
  const row = (route: RouteChoice, title: string, meta: Node | string, right: string) =>
    h(
      "button",
      {
        class: "item model-item",
        type: "button",
        role: "menuitemradio",
        "aria-checked": routeKey(route) === currentKey ? "true" : "false",
        onClick: () => onPick(route),
      },
      h("span", null, h("span", { class: "item-title" }, title), meta),
      h("span", { class: "item-cost", title: right ? t("menu.priceHint") : null }, right),
    );

  const groups: Node[] = [row({ mode: "auto" }, t("route.auto"), h("span", { class: "item-hint" }, t("route.autoHint")), "")];
  for (const provider of ["anthropic", "openai", "deepseek"] as ProviderId[]) {
    const list = models.filter((m) => m.provider === provider);
    if (!list.length) continue;
    groups.push(h("div", { class: "section-label label" }, PROVIDER_LABEL[provider]));
    for (const m of list) {
      const tags = h(
        "span",
        { class: "tags" },
        h("span", { class: "tag" }, t(`tier.${m.tier}` as MessageKey)),
        m.webSearch ? h("span", { class: "tag" }, "web") : null,
        m.vision ? h("span", { class: "tag" }, "img") : null,
      );
      const price = m.priceKnown ? `$${m.inputPrice.toFixed(2)} / $${m.outputPrice.toFixed(2)}` : t("models.unpriced");
      groups.push(row({ mode: "manual", provider, model: m.id }, m.label, tags, price));
    }
  }
  return h("div", { class: "list" }, groups);
}
