import { formatAge, formatCompactUsd, formatEth, formatInt, formatMonthYear, formatPercent, formatPrice, formatTokens, regionName, shortUrl } from "../shared/format";
import type { MessageKey } from "../shared/i18n";
import { translator } from "../shared/i18n";
import type { UiLang } from "../shared/types";
import type { ProfileLink, Signal, WalletCard, WalletEvent, WalletRequest } from "../shared/wallet";
import { WALLET_PORT, authorLink, emptyCard, failedSources, isAddress, profileChips, profileUrl, shortAddress, tokenAuthorLink, tokenChips, tokenSignals, walletKind, weiToEth } from "../shared/wallet";
import type { Child } from "../ui/dom";
import { copyText, h, icon } from "../ui/dom";
import type { IconName } from "../ui/dom";
import { adoptStyles } from "./styles";

export interface WalletTarget {
  query: string;
  /** Handle of the post, or quoted post, the address was written in. */
  author: string | null;
  /** Where the card points; null once that text has left the page. */
  anchor(): DOMRect | null;
  article: Element;
}

export interface WalletEnv {
  lang(): UiLang;
  canResearch(): boolean;
  onResearch(target: WalletTarget, card: WalletCard): void;
  onSettings(): void;
  toast(text: string, tone?: "positive" | "danger"): void;
  onClose?(): void;
}

const CHAIN_LABEL: Record<string, string> = {
  ethereum: "Ethereum",
  base: "Base",
  bsc: "BNB Chain",
  arbitrum: "Arbitrum",
  polygon: "Polygon",
  optimism: "OP Mainnet",
  avalanche: "Avalanche",
  linea: "Linea",
  scroll: "Scroll",
  blast: "Blast",
  zksync: "ZKsync",
  mantle: "Mantle",
  sonic: "Sonic",
  solana: "Solana",
};
const chainLabel = (slug: string) => CHAIN_LABEL[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);

const PLATFORM_LABEL: Record<string, string> = {
  twitter: "X",
  farcaster: "Farcaster",
  github: "GitHub",
  lens: "Lens",
  telegram: "Telegram",
  discord: "Discord",
};

const TONE: Record<Signal["level"], string> = { danger: "danger", warning: "warning", ok: "positive", info: "neutral" };

const FINISHED_LIMIT = 60;

/**
 * The hover card for one address or name. It lives in its own fixed layer outside
 * X's DOM, asks the worker over a port and redraws as each source answers.
 */
export class WalletPopover {
  readonly host: HTMLDivElement;
  private readonly root: ShadowRoot;
  private panel: HTMLElement | null = null;
  private port: chrome.runtime.Port | null = null;
  private target: WalletTarget | null = null;
  private card: WalletCard | null = null;
  private error: "permission" | "unknown" | null = null;
  private side: "below" | "above" | null = null;
  /** Cards opened from this one (the token's creator), for the back button. */
  private trail: string[] = [];
  /** Finished cards, so hovering an address again on this page is instant. */
  private readonly finished = new Map<string, WalletCard>();

  constructor(private readonly env: WalletEnv) {
    this.host = h("div", { "data-postsight-wallet": "" });
    Object.assign(this.host.style, { position: "fixed", top: "0", left: "0", width: "0", height: "0", zIndex: "2147483001" });
    this.root = this.host.attachShadow({ mode: "open" });
    adoptStyles(this.root);
    document.documentElement.appendChild(this.host);
    // X has page-wide keyboard shortcuts; keys pressed inside the card stay here.
    for (const type of ["keydown", "keyup", "keypress"]) this.host.addEventListener(type, (e) => e.stopPropagation());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.panel) this.close();
    });
  }

  setTheme(theme: "light" | "dark"): void {
    this.host.dataset.theme = theme;
  }

  get query(): string | null {
    return this.panel ? (this.target?.query ?? null) : null;
  }

  /** True when the event happened inside the card. */
  contains(path: EventTarget[]): boolean {
    return path.includes(this.host);
  }

  open(target: WalletTarget, focus = false): void {
    if (this.panel && this.target?.query === target.query) {
      this.target = target;
      this.place();
      return;
    }
    this.close();
    this.target = target;
    this.panel = h("div", { class: "panel wcard", role: "dialog", "aria-label": translator(this.env.lang())("wallet.label") });
    this.root.appendChild(this.panel);
    this.load(target.query);
    if (focus) requestAnimationFrame(() => this.panel?.querySelector<HTMLElement>("button, a")?.focus());
  }

  /** Shows another address in the same card, at the same place, such as a token's creator. */
  private follow(query: string): void {
    if (!this.target || this.target.query === query) return;
    this.trail.push(this.target.query);
    this.target = { ...this.target, query };
    this.load(query);
  }

  private back(): void {
    const previous = this.trail.pop();
    if (!previous || !this.target) return;
    this.target = { ...this.target, query: previous };
    this.load(previous);
  }

  private load(query: string): void {
    const port = this.port;
    this.port = null;
    port?.disconnect();
    this.error = null;
    const done = this.finished.get(query);
    this.card = done ? structuredClone(done) : emptyCard(query);
    this.render();
    if (!done) this.connect(query);
  }

  close(): void {
    const port = this.port;
    this.port = null;
    port?.disconnect();
    if (this.panel) this.env.onClose?.();
    this.panel?.remove();
    this.panel = null;
    this.target = null;
    this.card = null;
    this.error = null;
    this.side = null;
    this.trail = [];
  }

  /** Follows the text while the page scrolls; closes once the text is off screen. */
  place(): void {
    const panel = this.panel;
    const rect = this.target?.anchor();
    if (!panel) return;
    if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) {
      this.close();
      return;
    }
    const gap = 8;
    const edge = 8;
    const below = window.innerHeight - rect.bottom - gap - edge;
    const above = rect.top - gap - edge;
    // The side is chosen once: the card grows as sources answer, and it must never
    // slide over the address it belongs to. It scrolls inside instead.
    this.side ??= below >= 360 || below >= above ? "below" : "above";
    panel.style.maxHeight = `${Math.max(160, this.side === "below" ? below : above)}px`;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    panel.style.left = `${Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge))}px`;
    panel.style.top = `${this.side === "below" ? rect.bottom + gap : Math.max(edge, rect.top - height - gap)}px`;
  }

  private connect(query: string): void {
    let port: chrome.runtime.Port;
    try {
      port = chrome.runtime.connect({ name: WALLET_PORT });
    } catch {
      // The extension was reloaded under this page; it needs a refresh.
      this.error = "unknown";
      this.render();
      return;
    }
    this.port = port;
    port.onMessage.addListener((event: WalletEvent) => {
      if (this.port !== port) return;
      if (event.type === "card") {
        this.card = event.card;
        if (!event.card.pending.length) {
          this.remember(query, event.card);
          this.port = null;
          port.disconnect();
        }
      } else {
        this.error = event.code;
      }
      this.render();
    });
    port.onDisconnect.addListener(() => {
      if (this.port !== port) return;
      this.port = null;
      if (this.card?.pending.length) {
        this.error ??= "unknown";
        this.render();
      }
    });
    port.postMessage({ query } satisfies WalletRequest);
  }

  private remember(query: string, card: WalletCard): void {
    // Cards with sources that did not answer are asked again next time.
    if (card.failed.length) return;
    this.finished.delete(query);
    this.finished.set(query, card);
    if (this.finished.size > FINISHED_LIMIT) this.finished.delete(this.finished.keys().next().value!);
  }

  private render(): void {
    const panel = this.panel;
    const target = this.target;
    const card = this.card;
    if (!panel || !target || !card) return;
    const lang = this.env.lang();
    const t = translator(lang);
    const pending = (s: WalletCard["pending"][number]) => card.pending.includes(s);
    const skeleton = () => h("div", { class: "skeleton wc-skel" }, h("span"), h("span"));
    const row = (label: string, ...children: Child[]) => h("div", { class: "wc-row" }, h("span", { class: "label" }, label), h("div", { class: "wc-value" }, ...children));
    const muted = (text: string) => h("span", { class: "muted" }, text);
    const badge = (tone: string, text: string) => h("span", { class: "badge", "data-tone": tone }, text);

    const isName = !isAddress(card.query);
    const primary = card.names[0]?.name;
    const tokenName = card.token ? [card.token.name, card.token.symbol ? `(${card.token.symbol})` : ""].filter(Boolean).join(" ") : "";
    const short = shortAddress(card.address ?? card.query);
    const title = isName ? card.query : (primary ?? (tokenName || short));
    const titleVerified = card.names.some((n) => n.name === title);
    const kind = walletKind(card);
    const isContract = kind === "contract" || kind === "token";
    const smart = kind === "wallet" && card.chains.some((c) => c.code === "delegated" || c.code === "smart");
    const kindLabel = kind ? t(smart ? "wallet.kind.smart" : (`wallet.kind.${kind}` as MessageKey)) : null;

    const button = (name: IconName, label: string, onClick: () => void) =>
      h("button", { class: "icon-btn", type: "button", title: label, "aria-label": label, onClick }, icon(name, 16));

    const head = h(
      "div",
      { class: "wc-head" },
      this.trail.length ? button("chevronLeft", t("wallet.back"), () => this.back()) : h("span", { class: "wc-mark", "aria-hidden": "true" }, icon("wallet", 18)),
      h(
        "div",
        { class: "wc-id" },
        h(
          "div",
          { class: "wc-title", title: card.address ?? card.query },
          h("span", null, title),
          titleVerified ? h("span", { class: "wc-check", title: t("wallet.verifiedName"), "aria-label": t("wallet.verifiedName") }, icon("check", 14)) : null,
        ),
        h("div", { class: "wc-sub" }, card.address && title !== short ? h("span", { class: "mono" }, short) : null, kindLabel ? h("span", { class: "tag" }, kindLabel) : null),
      ),
      card.address
        ? button("copy", t("wallet.copy"), () => {
            void copyText(card.address ?? "").then((ok) => this.env.toast(t(ok ? "copy.done" : "copy.failed"), ok ? "positive" : "danger"));
          })
        : null,
      button("close", t("card.close"), () => this.close()),
    );

    const body: Child[] = [];
    const notes: Child[] = [];
    if (card.checksumMismatch) notes.push(h("div", { class: "note wc-danger" }, icon("alert", 16), h("span", null, t("wallet.checksum"))));

    if (this.error === "permission") {
      body.push(
        h(
          "div",
          { class: "wc-empty" },
          t("wallet.permission"),
          h(
            "button",
            {
              class: "btn",
              type: "button",
              onClick: () => {
                this.close();
                this.env.onSettings();
              },
            },
            t("menu.openSettings"),
          ),
        ),
      );
    } else if (card.unresolved) {
      body.push(h("div", { class: "wc-empty" }, t("wallet.unresolved", { name: card.query })));
    } else if (!card.address && (this.error || card.failed.length)) {
      body.push(h("div", { class: "wc-empty" }, t("wallet.failed")));
    } else if (!card.address) {
      body.push(skeleton());
    } else {
      if (card.texts.description) body.push(h("p", { class: "wc-bio" }, card.texts.description));

      // A token is measured by its team's listed X account and its creator; a wallet by its own records.
      const tokenLink = card.token ? tokenAuthorLink(card, target.author) : null;
      const link = !card.token && !pending("names") && !pending("profiles") ? authorLink(card, target.author) : null;
      const authorNote = (tone: string, name: IconName, text: string) => h("div", { class: "wc-author", "data-tone": tone }, icon(name, 16), h("span", null, text));
      if (tokenLink?.kind === "token-own") notes.push(authorNote("positive", "check", t("wallet.token.own", { handle: tokenLink.handle })));
      else if (tokenLink?.kind === "creator-own") notes.push(authorNote("positive", "check", t("wallet.creator.own", { handle: tokenLink.handle })));
      else if (tokenLink) notes.push(authorNote("neutral", "link", t("wallet.token.other", { handle: tokenLink.handle })));
      else if (link) notes.push(authorNote(link.own ? "positive" : "warning", link.own ? "check" : "alert", t(link.own ? "wallet.author.own" : "wallet.author.other", { handle: link.handle })));

      // Names other than the one in the title.
      const others = card.names.filter((n) => n.name !== title);
      if (pending("names")) body.push(row(t("wallet.names"), skeleton()));
      else if (others.length)
        body.push(
          row(
            t("wallet.names"),
            others.map((n) =>
              h(
                "div",
                { class: "wc-name" },
                h("span", null, n.name),
                h("span", { class: "wc-check", title: t("wallet.verifiedName"), "aria-label": t("wallet.verifiedName") }, icon("check", 14)),
                h("span", { class: "tag" }, n.source === "basename" ? "Basename" : "ENS"),
              ),
            ),
          ),
        );
      else if (!card.names.length && !isContract && !card.failed.includes("names")) body.push(row(t("wallet.names"), muted(t("wallet.noName"))));

      if (pending("chains")) body.push(row(t("wallet.chains"), skeleton()));
      else if (card.chains.length) {
        // A contract's nonce counts the contracts it created, not transactions it sent.
        const counts = (c: (typeof card.chains)[number]) => c.code !== "contract";
        const active = card.chains.filter((c) => c.balanceWei !== "0" || (counts(c) && c.txCount > 0));
        const lines = active.map((c) => {
          const eth = weiToEth(c.balanceWei);
          const since = card.firstSeen?.find((s) => s.chain === c.chain);
          return h(
            "div",
            { class: "wc-chain" },
            h("span", { class: "wc-chain-name" }, chainLabel(c.chain)),
            h("span", { class: "mono" }, formatEth(eth.value, eth.tiny, lang)),
            counts(c) && c.txCount > 0 ? muted(t("wallet.sent", { count: formatInt(c.txCount, lang) })) : null,
            since ? muted(t("wallet.since", { date: formatMonthYear(since.ts, lang) })) : null,
          );
        });
        // An idle contract has nothing to say here; an idle wallet is worth saying so.
        if (lines.length) body.push(row(t("wallet.chains"), lines));
        else if (!isContract) body.push(row(t("wallet.chains"), muted(t("wallet.noActivity"))));
      }

      // A token's links are the ones its team listed; a wallet's come from its names and web3.bio.
      const chips = card.token ? tokenChips(card.token.socials) : profileChips(card);
      const chipsLoading = card.token ? pending("market") || pending("launchpad") : pending("profiles") || pending("names");
      if (chips.length) body.push(row(t("wallet.profiles"), h("div", { class: "wc-chips" }, chips.map((p) => this.chip(p, lang)))));
      else if (chipsLoading) body.push(row(t("wallet.profiles"), skeleton()));

      const ethos = card.ethos && (card.ethos.profiled || card.ethos.reviews.positive + card.ethos.reviews.negative + card.ethos.reviews.neutral > 0 || card.ethos.vouches > 0) ? card.ethos : undefined;
      const reputation: Child[] = [];
      if (ethos) {
        const detail = [
          t("wallet.ethosReviews", { positive: formatInt(ethos.reviews.positive, lang), negative: formatInt(ethos.reviews.negative, lang) }),
          ethos.vouches ? t("wallet.ethosVouches", { count: formatInt(ethos.vouches, lang) }) : "",
          ethos.humanVerified ? t("wallet.ethosHuman") : "",
        ].filter(Boolean);
        const label = t("wallet.ethos", { score: formatInt(ethos.score, lang) });
        reputation.push(
          h(
            "div",
            { class: "wc-line" },
            ethos.url ? h("a", { href: ethos.url, target: "_blank", rel: "noopener noreferrer" }, label) : h("span", null, label),
            muted(detail.join(" · ")),
          ),
        );
      }
      if (card.coinbase) {
        reputation.push(badge("positive", card.coinbase.country ? t("wallet.coinbaseCountry", { country: regionName(card.coinbase.country, lang) }) : t("wallet.coinbase")));
      }
      if (reputation.length) body.push(row(t("wallet.reputation"), reputation));
      else if (pending("ethos") || pending("coinbase")) body.push(row(t("wallet.reputation"), skeleton()));
      else if (!isContract && !card.failed.includes("ethos") && !card.failed.includes("coinbase")) body.push(row(t("wallet.reputation"), muted(t("wallet.noReputation"))));

      if (pending("flags")) body.push(row(t("wallet.security"), skeleton()));
      else if (card.flags) {
        body.push(
          row(
            t("wallet.security"),
            h(
              "div",
              { class: "wc-badges" },
              card.flags.length ? card.flags.map((f) => badge("danger", t(`flag.${f.key}` as MessageKey, { value: f.value ?? "" }))) : badge("positive", t("wallet.clean")),
            ),
          ),
        );
      }

      if (card.contract) {
        const c = card.contract;
        body.push(
          row(
            t("wallet.contract"),
            h("div", { class: "wc-badges" }, c.verified ? badge("positive", c.name ? t("wallet.contractVerified", { name: c.name }) : t("sig.open_source")) : badge("warning", t("sig.closed_source")), c.proxy ? badge("neutral", t("sig.proxy")) : null),
          ),
        );
      }

      if (card.token) body.push(this.tokenBlock(card, lang, ["token", "security", "market", "simulation", "orders"].some((s) => pending(s as WalletCard["pending"][number]))));
      else if (pending("token") && kind === "contract") body.push(row(t("wallet.token"), skeleton()));

      // The creator shows as soon as it is known; the share it holds may follow.
      if (pending("creator") && !card.creator) body.push(row(t("wallet.creator"), skeleton()));
      else if (card.creator) {
        const c = card.creator;
        const name = c.names[0]?.name;
        const details = [
          c.factory ? t("wallet.creatorFactory") : "",
          c.via ? t("wallet.creatorThrough") : "",
          c.x ? `@${c.x}` : "",
          c.percent !== undefined ? t("wallet.creatorHolds", { percent: formatPercent(c.percent, lang) }) : "",
          t("wallet.creatorVia", { source: c.source }),
        ].filter(Boolean);
        body.push(
          row(
            t("wallet.creator"),
            h(
              "button",
              { class: "wc-follow", type: "button", title: t("wallet.creatorOpen"), onClick: () => this.follow(c.address) },
              h("span", { class: name ? "" : "mono" }, name ?? shortAddress(c.address)),
              name ? h("span", { class: "wc-check", "aria-hidden": "true" }, icon("check", 14)) : null,
              icon("chevronRight", 14),
            ),
            muted(details.join(" · ")),
          ),
        );
      }

      const silent = failedSources(card);
      if (silent.length) body.push(h("div", { class: "wc-quiet" }, t("wallet.noAnswer", { sources: silent.join(", ") })));
    }

    const links: Child[] = [];
    if (card.address) {
      links.push(this.extLink("Etherscan", `https://etherscan.io/address/${card.address}`));
      links.push(this.extLink("Basescan", `https://basescan.org/address/${card.address}`));
    }
    if (card.token?.url) links.push(this.extLink("DexScreener", card.token.url));
    const canResearch = this.env.canResearch() && !!card.address && !card.unresolved;
    const foot =
      links.length || canResearch
        ? h(
            "div",
            { class: "wc-foot" },
            h("div", { class: "wc-links" }, links),
            canResearch
              ? h(
                  "button",
                  {
                    class: "btn btn-primary wc-research",
                    type: "button",
                    disabled: card.pending.length > 0,
                    onClick: () => {
                      const current = this.card;
                      this.close();
                      if (current) this.env.onResearch(target, current);
                    },
                  },
                  icon("research", 14),
                  t("wallet.research"),
                )
              : null,
          )
        : null;

    const scrollTop = panel.querySelector(".wc-body")?.scrollTop ?? 0;
    panel.replaceChildren(
      head,
      ...(notes as Node[]),
      h("div", { class: "wc-body" }, body, card.address && !card.unresolved ? h("p", { class: "wc-claims" }, t("wallet.claims")) : null),
      ...(foot ? [foot] : []),
    );
    const scroller = panel.querySelector(".wc-body");
    if (scroller) scroller.scrollTop = scrollTop;
    this.place();
  }

  private chip(p: ProfileLink, lang: UiLang): HTMLElement {
    const t = translator(lang);
    const label = p.platform === "website" ? t("wallet.website") : (PLATFORM_LABEL[p.platform] ?? p.platform);
    const handle = p.platform === "website" ? shortUrl(p.handle, 32) : p.handle.length > 32 ? `${p.handle.slice(0, 31)}…` : p.handle;
    const parts = [h("span", { class: "wc-chip-platform" }, label), h("span", null, handle)];
    if (p.followers !== undefined && p.followers > 0) parts.push(h("span", { class: "muted", title: t("wallet.followers", { count: formatInt(p.followers, lang) }) }, formatTokens(p.followers, lang)));
    const url = profileUrl(p);
    return url ? h("a", { class: "wc-chip", href: url, target: "_blank", rel: "noopener noreferrer" }, parts) : h("span", { class: "wc-chip" }, parts);
  }

  private extLink(label: string, href: string): HTMLElement {
    return h("a", { class: "wc-ext", href, target: "_blank", rel: "noopener noreferrer" }, label, icon("external", 12));
  }

  private tokenBlock(card: WalletCard, lang: UiLang, loading: boolean): HTMLElement {
    const t = translator(lang);
    const tk = card.token!;
    const name = [tk.name, tk.symbol ? `(${tk.symbol})` : ""].filter(Boolean).join(" ");
    const stats: [string, string][] = [];
    if (tk.priceUsd !== undefined) stats.push([t("wallet.price"), formatPrice(tk.priceUsd, lang)]);
    if (tk.liquidityUsd !== undefined) stats.push([t("wallet.liquidity"), formatCompactUsd(tk.liquidityUsd, lang)]);
    if (tk.fdvUsd !== undefined) stats.push([t("wallet.fdv"), formatCompactUsd(tk.fdvUsd, lang)]);
    if (tk.volume24hUsd !== undefined) stats.push([t("wallet.volume"), formatCompactUsd(tk.volume24hUsd, lang)]);
    if (tk.createdAt !== undefined) stats.push([t("wallet.listed"), formatAge(tk.createdAt, lang)]);
    if (tk.top10 !== undefined) stats.push([t("wallet.top10"), formatPercent(tk.top10, lang)]);
    const meta = [
      chainLabel(tk.chain),
      t("wallet.pairs", { count: formatInt(tk.pairs, lang) }),
      tk.holders ? t("wallet.holders", { count: formatTokens(tk.holders, lang) }) : "",
      tk.gtScore !== undefined ? t("wallet.gtScore", { score: Math.round(tk.gtScore) }) : "",
    ]
      .filter(Boolean)
      .join(" · ");

    // Every warning is shown; the reassuring checks fill up the rest of eight places.
    // The contract row already says whether the source is verified and whether it is a proxy.
    const shownElsewhere = card.contract ? new Set(["open_source", "closed_source", "proxy"]) : new Set<string>();
    const signals = tokenSignals(tk, lang).filter((s) => !shownElsewhere.has(s.key));
    const serious = signals.filter((s) => s.level === "danger" || s.level === "warning");
    const shown = [...serious, ...signals.filter((s) => s.level !== "danger" && s.level !== "warning").slice(0, Math.max(0, 8 - serious.length))];
    return h(
      "div",
      { class: "wc-row wc-token" },
      h("span", { class: "label" }, t("wallet.token")),
      h(
        "div",
        { class: "wc-value" },
        // The title already carries the token's name.
        name ? null : h("div", { class: "wc-token-name" }, shortAddress(card.address ?? "")),
        h("div", { class: "muted" }, meta),
        tk.launchpad ? h("a", { class: "wc-ext", href: tk.launchpad.url, target: "_blank", rel: "noopener noreferrer" }, t("wallet.launchpad", { name: tk.launchpad.name }), icon("external", 12)) : null,
        stats.length ? h("dl", { class: "wc-stats" }, stats.map(([k, v]) => h("div", null, h("dt", null, k), h("dd", { class: "mono" }, v)))) : null,
        shown.length
          ? h(
              "div",
              { class: "wc-badges" },
              shown.map((s) => h("span", { class: "badge", "data-tone": TONE[s.level] }, t(`sig.${s.key}` as MessageKey, { value: s.value ?? "" }))),
            )
          : loading
            ? h("div", { class: "skeleton wc-skel" }, h("span"), h("span"))
            : null,
      ),
    );
  }
}
