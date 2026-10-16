import { translator } from "../shared/i18n";
import type { ContentConfig } from "../shared/messages";
import { sendRequest } from "../shared/messages";
import { postFeatures } from "../shared/router";
import type { ActionId, RouteChoice, TweetData } from "../shared/types";
import { shortAddress, walletFacts } from "../shared/wallet";
import { copyText, h, icon } from "../ui/dom";
import { Card } from "./card";
import type { CopyKind } from "./overlay";
import { Overlay } from "./overlay";
import { iconBox, iconRow, TRIGGER, X_ICON } from "./layout";
import { adoptStyles, loadFonts } from "./styles";
import { ARTICLE, extractTweet, postIdOf, postText, readThread } from "./tweet";
import type { WalletTarget } from "./wallet-card";
import { WalletPopover } from "./wallet-card";
import type { Spot } from "./wallets";
import { clearHighlights, markPost, pruneHighlights, spotAt, spotsIn } from "./wallets";

let config: ContentConfig | null = null;
let theme: "light" | "dark" = "light";
let hovered: Element | null = null;
const cards = new Map<string, Card>();
/** Each badge host, with the post it belongs to and its button. */
const triggers = new WeakMap<Element, { article: Element; button: HTMLButtonElement }>();
const overlay = new Overlay();

const t = () => translator(config?.lang ?? "en");

/** X paints the body in white, dim blue or black; anything dark gets the dark tokens. */
function pageTheme(): "light" | "dark" {
  const match = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return "light";
  const [r, g, b] = match.slice(0, 3).map(Number) as [number, number, number];
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5 ? "dark" : "light";
}

function syncTheme(): void {
  const next = pageTheme();
  if (next === theme) return;
  theme = next;
  overlay.setTheme(theme);
  for (const card of cards.values()) card.setTheme(theme);
  walletCard.setTheme(theme);
  document.querySelectorAll<HTMLElement>(`[${TRIGGER}]`).forEach((el) => (el.dataset.theme = theme));
}

function readPost(article: Element): TweetData | null {
  const tweet = extractTweet(article);
  if (!tweet) return null;
  if (config?.includeThread) tweet.thread = readThread(article, tweet.handle);
  return tweet;
}

function runAction(article: Element, action: ActionId, route: RouteChoice, question?: string, facts?: string): void {
  const tweet = readPost(article);
  if (!tweet) {
    overlay.toast(t()("error.noPost"), "danger");
    return;
  }
  let card = cards.get(tweet.id);
  if (!card) {
    card = new Card(tweet.id, {
      lang: () => config?.lang ?? "en",
      models: () => config?.models ?? [],
      theme: () => theme,
      overlay,
      onClose: (c) => {
        cards.delete(c.postId);
        markActive(c.postId, false);
      },
      onActivity: (c) => markActive(c.postId, true),
    });
    cards.set(tweet.id, card);
  }
  if (!article.contains(card.host)) card.attach(article);
  card.run({ action, tweet, route, question, facts });
}

function markActive(postId: string, active: boolean): void {
  for (const article of document.querySelectorAll(ARTICLE)) {
    if (postIdOf(article) !== postId) continue;
    const button = article.querySelector(`[${TRIGGER}]`)?.shadowRoot?.querySelector("button");
    button?.setAttribute("data-active", String(active));
  }
}

function copyPost(article: Element, kind: CopyKind): void {
  const tweet = readPost(article);
  if (!tweet) return;
  // Copies keep links whole; only what goes to the model is shortened.
  const full = postText(article) || tweet.text;
  const text =
    kind === "text"
      ? full
      : kind === "link"
        ? tweet.url
        : `${full
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n")}\n>\n> ${tweet.authorName} (@${tweet.handle}) ${tweet.url}`;
  void copyText(text).then((ok) => overlay.toast(t()(ok ? "copy.done" : "copy.failed"), ok ? "positive" : "danger"));
}

function openMenu(article: Element, button: HTMLButtonElement): void {
  if (!config) return;
  if (overlay.isOpenFor(button)) {
    overlay.close();
    return;
  }
  const tweet = readPost(article);
  if (!tweet) {
    overlay.toast(t()("error.noPost"), "danger");
    return;
  }
  overlay.openMenu(button, {
    config,
    features: postFeatures(tweet),
    onAction: (action, route, question) => runAction(article, action, route, question),
    onCopy: (kind) => copyPost(article, kind),
    // The keyboard way to a wallet card: hover cards cannot be reached with Tab.
    wallets: config.wallets
      ? spotsIn(article)
          .slice(0, 4)
          .map((spot) => ({ label: spot.kind === "name" ? spot.value : shortAddress(spot.value), onOpen: () => showWallet(spot, true) }))
      : [],
  });
}

/** Badge height bounds: readable at the low end, never taller than a header line at the top. */
const BADGE_MIN = 18;
const BADGE_MAX = 22;

/**
 * Puts the badge in the post header: as tall as the header line already is (so the
 * row does not grow and the name and icons stay put), with the same visible gap X
 * leaves between Grok and the caret. When Grok sits next to the caret, the badge
 * goes before Grok so those two stay together.
 */
function placeTrigger(host: HTMLElement, article: Element, caret: Element, row: Element, item: Element): void {
  const px = (v: string) => parseFloat(v) || 0;
  const caretIcon = iconBox(caret);
  const nameLine = article.querySelector('[data-testid="User-Name"]')?.getBoundingClientRect().height ?? 0;
  const room = Math.max(row.getBoundingClientRect().height, nameLine, caretIcon?.height ?? X_ICON);
  const size = Math.max(BADGE_MIN, Math.min(BADGE_MAX, Math.floor(room)));

  const prev = item.previousElementSibling;
  const prevIcon = prev ? iconBox(prev) : undefined;
  const prevIsIcon = !!prev && !!prevIcon && prev.getBoundingClientRect().width <= 48;
  // Gap between the visible icons. Hover circles overflow by 8px each, so 16px is the floor.
  let visibleGap = 16;
  if (prevIsIcon && prevIcon && caretIcon) {
    const measured = caretIcon.left - prevIcon.right;
    if (measured >= 8 && measured < 48) visibleGap = measured;
  }
  const anchor = prevIsIcon ? prev : item;
  const anchorIcon = iconBox(anchor);
  // Space inside the anchor's box before its icon also counts towards the gap.
  const inset = anchorIcon ? Math.max(0, anchorIcon.left - anchor.getBoundingClientRect().left) : 0;
  const margin = Math.max(0, visibleGap - inset - px(getComputedStyle(row).columnGap) - px(getComputedStyle(anchor).marginLeft));

  host.style.cssText = `display:flex;align-items:center;justify-content:center;flex:none;align-self:center;height:${size}px;margin:0 ${margin}px 0 0;`;
  row.insertBefore(host, anchor);
}

function addTrigger(article: Element): void {
  if (article.querySelector(`[${TRIGGER}]`)) return;
  // Sits next to the "more" caret in the post header. Without the caret (still
  // rendering, or an unfamiliar layout) nothing is added; the next scan retries.
  const caret = article.querySelector('[data-testid="caret"]');
  const place = caret ? iconRow(caret, article) : null;
  if (!caret || !place) return;

  const host = h("div", { [TRIGGER]: "" });
  host.dataset.theme = theme;
  const root = host.attachShadow({ mode: "open" });
  adoptStyles(root);
  const label = t()("menu.open");
  const button = h("button", { class: "trigger", type: "button", title: label, "aria-label": label, "aria-haspopup": "menu", "aria-expanded": "false" }, icon("lens", 15), h("span", null, "AI"));
  if (cards.get(postIdOf(article) ?? "")) button.setAttribute("data-active", "true");
  root.appendChild(button);
  triggers.set(host, { article, button });

  placeTrigger(host, article, caret, place.row, place.item);
}


/**
 * X handles pointer and click events high up the page, and the header the badge sits
 * in can belong to a link or a menu. Events on the badge are therefore taken at the
 * window in the capture phase, before any of X's listeners run, and the menu is
 * opened from here rather than from a listener on the button itself.
 */
function onBadgeEvent(e: Event): void {
  const host = e.composedPath().find((n): n is Element => n instanceof Element && n.hasAttribute(TRIGGER));
  if (!host) return;
  e.stopPropagation();
  if (e.type !== "click") return;
  e.preventDefault();
  const entry = triggers.get(host);
  if (entry?.article.isConnected) openMenu(entry.article, entry.button);
}

for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click", "auxclick", "dblclick", "touchstart", "touchend"]) {
  window.addEventListener(type, onBadgeEvent, true);
}

function scan(): void {
  syncTheme();
  if (!config?.enabled) return;
  for (const article of document.querySelectorAll(ARTICLE)) {
    addTrigger(article);
    if (config.wallets) markPost(article);
    // Timeline cells are recycled as you scroll; put an open card back when its post returns.
    const id = postIdOf(article);
    const card = id ? cards.get(id) : undefined;
    if (card && !card.host.isConnected) card.attach(article);
  }
  if (config.wallets) pruneHighlights();
}

let scheduled = false;
function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    scan();
  });
}

function removeAll(): void {
  overlay.close();
  walletCard.close();
  clearHighlights();
  document.querySelectorAll(`[${TRIGGER}]`).forEach((el) => el.remove());
  for (const card of [...cards.values()]) card.close();
}

async function loadConfig(): Promise<void> {
  try {
    config = await sendRequest<ContentConfig>({ type: "config" });
  } catch {
    // The worker was restarting; the next storage change or page load retries.
    return;
  }
  if (!config.enabled) {
    removeAll();
    return;
  }
  // Labels are baked into triggers, so rebuild them when the language changes.
  document.querySelectorAll(`[${TRIGGER}]`).forEach((el) => el.remove());
  if (!config.wallets) {
    walletCard.close();
    clearHighlights();
  }
  schedule();
}

// ---------- Wallet cards ----------

const walletCard = new WalletPopover({
  lang: () => config?.lang ?? "en",
  canResearch: () => !!config?.hasKey,
  onResearch: (target, card) => {
    if (!config || !card.address) return;
    const question = t()("wallet.researchQuestion", { address: card.address });
    runAction(target.article, "ask", config.route, question, walletFacts(card, target.author));
  },
  onSettings: () => void sendRequest({ type: "open-options", section: "features" }),
  toast: (text, tone) => overlay.toast(text, tone),
});

const SHOW_DELAY_MS = 350;
const SWITCH_DELAY_MS = 120;
const HIDE_DELAY_MS = 300;
let showTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let waitingFor: Spot | null = null;
/** A card opened from the menu, or clicked into, stays until it is closed. */
let pinned = false;
const pointer = { x: 0, y: 0, target: null as Element | null, overCard: false };
let pointerFrame = 0;

function walletTarget(spot: Spot): WalletTarget {
  return {
    query: spot.value,
    author: spot.author,
    article: spot.article,
    anchor: () => (spot.range.startContainer.isConnected ? (spot.range.getClientRects()[0] ?? null) : null),
  };
}

function showWallet(spot: Spot, fromMenu = false): void {
  clearTimeout(hideTimer);
  hideTimer = undefined;
  pinned = fromMenu;
  walletCard.open(walletTarget(spot), fromMenu);
}

function hideWalletSoon(): void {
  if (pinned || hideTimer || !walletCard.query) return;
  hideTimer = setTimeout(() => {
    hideTimer = undefined;
    walletCard.close();
  }, HIDE_DELAY_MS);
}

function onPointer(): void {
  if (pointer.overCard) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    return;
  }
  const spot = spotAt(pointer.target, pointer.x, pointer.y);
  if (!spot) {
    clearTimeout(showTimer);
    showTimer = undefined;
    waitingFor = null;
    hideWalletSoon();
    return;
  }
  clearTimeout(hideTimer);
  hideTimer = undefined;
  if (walletCard.query === spot.value || waitingFor?.range === spot.range) return;
  waitingFor = spot;
  clearTimeout(showTimer);
  // Moving from one address to the next should not wait as long as the first hover.
  showTimer = setTimeout(
    () => {
      showTimer = undefined;
      const next = waitingFor;
      waitingFor = null;
      if (next?.range.startContainer.isConnected) showWallet(next);
    },
    walletCard.query ? SWITCH_DELAY_MS : SHOW_DELAY_MS,
  );
}

document.addEventListener(
  "pointermove",
  (e) => {
    if (!config?.wallets || e.pointerType === "touch") return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.target = e.target instanceof Element ? e.target : null;
    pointer.overCard = walletCard.contains(e.composedPath());
    pointerFrame ||= requestAnimationFrame(() => {
      pointerFrame = 0;
      onPointer();
    });
  },
  { passive: true },
);

document.addEventListener(
  "pointerdown",
  (e) => {
    if (!walletCard.query) return;
    if (walletCard.contains(e.composedPath())) pinned = true;
    else {
      pinned = false;
      walletCard.close();
    }
  },
  true,
);

window.addEventListener(
  "scroll",
  () => {
    if (walletCard.query) requestAnimationFrame(() => walletCard.place());
  },
  { capture: true, passive: true },
);

const SHORTCUTS: Record<string, ActionId> = {
  KeyV: "verify",
  KeyR: "research",
  KeyS: "summarize",
  KeyT: "translate",
  KeyE: "explain",
};

function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

document.addEventListener("keydown", (e) => {
  if (!config?.enabled || !config.shortcuts || !config.hasKey) return;
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target)) return;
  const action = SHORTCUTS[e.code];
  if (!action || !config.actions.includes(action)) return;
  const article = hovered?.isConnected ? hovered : document.activeElement?.closest(ARTICLE);
  if (!article) return;
  e.preventDefault();
  runAction(article, action, config.route);
});

document.addEventListener(
  "mouseover",
  (e) => {
    const el = e.target instanceof Element ? e.target.closest(ARTICLE) : null;
    if (el) hovered = el;
  },
  { passive: true },
);

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type === "config-changed") void loadConfig();
});

new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ["style", "class"] });

loadFonts();
theme = pageTheme();
overlay.setTheme(theme);
walletCard.setTheme(theme);
void loadConfig();
