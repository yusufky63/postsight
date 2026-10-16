import { formatSeconds, formatTokens, formatUsd, hostOf } from "../shared/format";
import { translator } from "../shared/i18n";
import type { MessageKey } from "../shared/i18n";
import { markdownToText } from "../shared/markdown";
import type { RunEvent, RunJob, RunStatus } from "../shared/messages";
import { RUN_PORT, sendRequest } from "../shared/messages";
import { parseReplies } from "../shared/prompts";
import type { ErrorCode, ModelInfo, RouteChoice, RouteDecision, RunResult, Source, UiLang } from "../shared/types";
import { parseVerdict, VERDICT_TONE } from "../shared/verdict";
import { copyText, h, icon, replace } from "../ui/dom";
import { linkify, renderMarkdown } from "../ui/render";
import { adoptStyles } from "./styles";
import type { Overlay } from "./overlay";

export interface CardEnv {
  lang(): UiLang;
  models(): ModelInfo[];
  theme(): "light" | "dark";
  overlay: Overlay;
  onClose(card: Card): void;
  onActivity(card: Card): void;
}

const SETTINGS_ERRORS: ReadonlySet<ErrorCode> = new Set(["no_key", "auth", "budget", "model_not_found", "no_provider", "billing"]);

/** Events that would otherwise bubble to the post and open it. */
const SWALLOW = ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "keydown", "keyup", "keypress", "touchstart", "touchend"];

export class Card {
  readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private readonly frame: HTMLElement;
  private port: chrome.runtime.Port | null = null;
  private job: RunJob | null = null;
  private decision: RouteDecision | null = null;
  private status: RunStatus | null = null;
  private text = "";
  private sources: Source[] = [];
  private result: RunResult | null = null;
  private error: { code: ErrorCode; detail?: string } | null = null;
  private linksBlocked = false;
  private frameRequested = false;

  constructor(
    readonly postId: string,
    private readonly env: CardEnv,
  ) {
    this.host = h("div", { "data-postsight-card": postId });
    this.root = this.host.attachShadow({ mode: "open" });
    this.frame = h("section", { class: "card", "aria-live": "polite" });
    adoptStyles(this.root);
    this.root.append(this.frame);
    for (const type of SWALLOW) this.host.addEventListener(type, (e) => e.stopPropagation());
  }

  get running(): boolean {
    return this.port !== null;
  }

  /** Puts the card above the post's action bar, or at the end of the post if the layout is unfamiliar. */
  attach(article: Element): void {
    this.host.dataset.theme = this.env.theme();
    const bar = [...article.querySelectorAll('[role="group"]')].pop();
    const text = article.querySelector('[data-testid="tweetText"], [data-testid="User-Name"]');
    if (bar && text) {
      let anchor: Element = bar;
      while (anchor.parentElement && anchor.parentElement !== article && !anchor.parentElement.contains(text)) {
        anchor = anchor.parentElement;
      }
      if (anchor.parentElement) {
        anchor.parentElement.insertBefore(this.host, anchor);
        return;
      }
    }
    article.appendChild(this.host);
  }

  setTheme(theme: "light" | "dark"): void {
    this.host.dataset.theme = theme;
  }

  run(job: RunJob): void {
    this.stop();
    this.job = job;
    this.decision = null;
    this.status = null;
    this.text = "";
    this.sources = [];
    this.result = null;
    this.error = null;
    this.linksBlocked = false;

    const port = chrome.runtime.connect({ name: RUN_PORT });
    this.port = port;
    port.onMessage.addListener((event: RunEvent) => this.onEvent(event));
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      if (!this.result && !this.error) this.error = { code: "network" };
      this.paint();
    });
    port.postMessage(job);
    this.env.onActivity(this);
    this.paint();
  }

  stop(): void {
    const port = this.port;
    this.port = null;
    if (port) {
      port.disconnect();
      if (!this.result && !this.error) this.error = { code: "aborted" };
      this.paint();
    }
  }

  close(): void {
    this.stop();
    this.host.remove();
    this.env.onClose(this);
  }

  private finish(): void {
    const port = this.port;
    this.port = null;
    port?.disconnect();
    this.env.onActivity(this);
  }

  private onEvent(event: RunEvent): void {
    switch (event.type) {
      case "route":
        this.decision = event.decision;
        break;
      case "status":
        this.status = event.status;
        break;
      case "delta":
        this.text += event.text;
        break;
      case "reset":
        this.text = "";
        break;
      case "notice":
        this.linksBlocked = true;
        break;
      case "source":
        this.sources.push(event.source);
        break;
      case "done":
        this.result = event.result;
        this.text = event.result.text;
        this.sources = event.result.sources;
        this.finish();
        break;
      case "error":
        this.error = { code: event.code, detail: event.detail };
        this.finish();
        break;
    }
    this.paint();
  }

  /** Streaming can deliver dozens of deltas per frame; render at most once per frame. */
  private paint(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.render();
    });
  }

  private copyResult(): void {
    if (!this.job) return;
    const t = translator(this.env.lang());
    let body = this.text;
    let head = "";
    if (this.job.action === "verify") {
      const v = parseVerdict(`${this.text}\n`);
      body = v.body;
      if (v.verdict) head = `${t(`verdict.${v.verdict}` as MessageKey)}${v.confidence !== null ? ` (${v.confidence}%)` : ""}\n\n`;
    }
    const sources = this.sources.length
      ? `\n\n${t("card.sources")}:\n${this.sources.map((s, i) => `${i + 1}. ${s.title} - ${s.url}`).join("\n")}`
      : "";
    const text = `${head}${this.job.action === "translate" ? body.trim() : markdownToText(body)}${sources}\n\n${this.job.tweet.url}`;
    void copyText(text).then((ok) => this.env.overlay.toast(t(ok ? "copy.done" : "copy.failed"), ok ? "positive" : "danger"));
  }

  private rerun(route: RouteChoice): void {
    if (this.job) this.run({ ...this.job, route, force: true });
  }

  private render(): void {
    const job = this.job;
    if (!job) return;
    const lang = this.env.lang();
    const t = translator(lang);
    const running = this.running;

    const retryBtn = h(
      "button",
      {
        class: "icon-btn",
        type: "button",
        title: t("card.retry"),
        "aria-label": t("card.retry"),
        onClick: (e: MouseEvent) => {
          // Shift-click reruns as is; a plain click lets the reader pick another model.
          if (e.shiftKey) this.rerun(job.route);
          else this.env.overlay.openPicker(retryBtn, lang, this.env.models(), job.route, (route) => this.rerun(route));
        },
      },
      icon("retry", 16),
    );

    const actions = h(
      "div",
      { class: "card-actions" },
      this.text && !running
        ? h(
            "button",
            { class: "icon-btn", type: "button", title: t("copy.result"), "aria-label": t("copy.result"), onClick: () => this.copyResult() },
            icon("copy", 16),
          )
        : null,
      running
        ? h("button", { class: "icon-btn", type: "button", title: t("card.stop"), "aria-label": t("card.stop"), onClick: () => this.stop() }, icon("stop", 16))
        : retryBtn,
      h("button", { class: "icon-btn", type: "button", title: t("card.close"), "aria-label": t("card.close"), onClick: () => this.close() }, icon("close", 16)),
    );

    const d = this.decision;
    const modelText = this.result?.modelLabel ?? d?.modelLabel ?? t("status.routing");
    const statusKey: MessageKey | null = running ? (this.status ? (`status.${this.status}` as MessageKey) : "status.routing") : null;

    const head = h(
      "header",
      { class: "card-head" },
      h("span", { class: "eyebrow" }, t(`action.${job.action}` as MessageKey)),
      h("span", { class: "card-model", title: modelText }, modelText),
      statusKey ? h("span", { class: "card-status" }, t(statusKey)) : null,
      actions,
    );

    const why = d
      ? h(
          "div",
          { class: "why", title: t("card.why") },
          [d.auto ? t("route.auto") : null, ...d.reasons.map((r) => t(r))].filter(Boolean).join(" · "),
        )
      : null;

    const noWeb = d && !d.useWeb && (job.action === "verify" || job.action === "research") ? h("div", { class: "note" }, t("card.noWeb")) : null;

    const blocked = this.linksBlocked
      ? h(
          "div",
          { class: "note note-action" },
          h("span", null, t("card.linksNeedPermission")),
          h("button", { class: "btn", type: "button", onClick: () => void sendRequest({ type: "open-options", section: "features" }) }, t("card.allowLinks")),
        )
      : null;

    replace(this.frame, head, running ? h("div", { class: "progress", "aria-hidden": "true" }) : null, why, noWeb, blocked, this.body(t), this.sourceList(t), this.foot(lang, t));
  }

  private body(t: ReturnType<typeof translator>): HTMLElement {
    const job = this.job!;
    const running = this.running;
    if (this.error && !(this.error.code === "aborted" && this.text)) {
      const code = this.error.code;
      const fix = SETTINGS_ERRORS.has(code)
        ? h(
            "button",
            { class: "btn", type: "button", onClick: () => void sendRequest({ type: "open-options", section: code === "budget" ? "budget" : "providers" }) },
            t("menu.openSettings"),
          )
        : h("button", { class: "btn", type: "button", onClick: () => this.rerun(job.route) }, icon("retry", 14), t("card.retry"));
      return h(
        "div",
        { class: "error", role: "alert" },
        t(`error.${code}` as MessageKey),
        this.error.detail ? h("small", null, this.error.detail) : null,
        code === "aborted" ? null : fix,
      );
    }

    const body = h("div", { class: "card-body" });
    if (!this.text) {
      body.appendChild(h("div", { class: "skeleton", "aria-hidden": "true" }, h("span"), h("span"), h("span")));
      return body;
    }

    if (job.action === "verify") {
      const v = parseVerdict(running ? this.text : `${this.text}\n`);
      if (v.verdict) {
        const tone = VERDICT_TONE[v.verdict];
        body.appendChild(
          h(
            "div",
            { class: "verdict" },
            h("span", { class: "badge", "data-tone": tone }, t(`verdict.${v.verdict}` as MessageKey)),
            v.confidence !== null
              ? h(
                  "div",
                  { class: "meter" },
                  h("span", { class: "label" }, t("card.confidence")),
                  h("div", { class: "meter-track" }, h("div", { class: "meter-fill", style: `width:${v.confidence}%` })),
                  h("span", { class: "mono", style: "font-size:12px" }, `${v.confidence}%`),
                )
              : null,
          ),
        );
      }
      const md = h("div", { class: `md${running ? " caret" : ""}` }, renderMarkdown(v.body));
      body.appendChild(md);
      return body;
    }

    if (job.action === "reply" && !running) {
      const replies = parseReplies(this.text);
      if (replies.length) {
        body.appendChild(
          h(
            "div",
            { class: "replies" },
            replies.map((r) =>
              h(
                "div",
                { class: "reply" },
                h("div", null, h("span", { class: "label" }, r.tone), r.text),
                h(
                  "button",
                  {
                    class: "icon-btn",
                    type: "button",
                    title: t("copy.reply"),
                    "aria-label": t("copy.reply"),
                    onClick: () =>
                      void copyText(r.text).then((ok) =>
                        this.env.overlay.toast(t(ok ? "copy.done" : "copy.failed"), ok ? "positive" : "danger"),
                      ),
                  },
                  icon("copy", 16),
                ),
              ),
            ),
          ),
        );
        return body;
      }
    }

    if (job.action === "translate") {
      const parts = this.text.trim().split(/\n-{3,}\n/);
      body.appendChild(
        h(
          "div",
          { class: `md${running ? " caret" : ""}` },
          parts.map((p, i) => [i > 0 ? h("hr") : null, h("p", { class: "translation" }, linkify(p.trim()))]),
        ),
      );
      return body;
    }

    body.appendChild(h("div", { class: `md${running ? " caret" : ""}` }, renderMarkdown(this.text)));
    return body;
  }

  private sourceList(t: ReturnType<typeof translator>): HTMLElement | null {
    if (!this.sources.length) return null;
    return h(
      "div",
      { class: "sources" },
      h("span", { class: "label" }, t("card.sources")),
      h(
        "ol",
        null,
        this.sources.slice(0, 8).map((s) =>
          h(
            "li",
            null,
            h("a", { href: s.url, target: "_blank", rel: "noopener noreferrer nofollow", title: s.url }, h("span", { class: "host" }, hostOf(s.url)), s.title),
          ),
        ),
      ),
    );
  }

  private foot(lang: UiLang, t: ReturnType<typeof translator>): HTMLElement | null {
    const r = this.result;
    if (!r) return null;
    return h(
      "footer",
      { class: "card-foot" },
      h("span", null, `${formatTokens(r.usage.inputTokens, lang)} ${t("card.in")} · ${formatTokens(r.usage.outputTokens, lang)} ${t("card.out")}`),
      r.usage.webSearches ? h("span", null, t("card.searches", { n: r.usage.webSearches })) : null,
      h("span", null, r.costUsd === null ? t("models.unpriced") : formatUsd(r.costUsd, lang)),
      h("span", null, formatSeconds(r.ms, lang)),
      r.cached ? h("span", { class: "tag" }, t("card.cached")) : null,
    );
  }
}
