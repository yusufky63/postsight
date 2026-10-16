import type { WalletMatch } from "../shared/wallet";
import { findWallets } from "../shared/wallet";

/*
 * Finds addresses and .eth names in post text and marks them without touching X's
 * DOM: each one is a Range in a CSS Custom Highlight, and hovering is worked out from
 * the pointer position against those ranges. X keeps re-rendering posts, so nothing
 * Postsight inserted could survive there anyway.
 */

export const HIGHLIGHT = "postsight-wallet";
const TEXT = '[data-testid="tweetText"]';
const QUOTE = 'div[role="link"]';

export interface Spot {
  range: Range;
  /** What is looked up: the address, or the name in lower case. */
  value: string;
  /** The text as it stands on the page, to notice when X replaced it. */
  written: string;
  kind: WalletMatch["kind"];
  /** Author of the post, or quoted post, the text belongs to. */
  author: string | null;
  article: Element;
}

interface Marked {
  text: string;
  spots: Spot[];
}

/** The address under the pointer, or whose card is open, drawn stronger on top. */
export const HIGHLIGHT_ACTIVE = "postsight-wallet-active";

const marked = new WeakMap<Element, Marked>();
let highlight: Highlight | null = null;
let active: Highlight | null = null;
let sheet: CSSStyleSheet | null = null;
let theme: "light" | "dark" = "light";

/** A tint behind the text plus a thick dashed line, so an address reads as something to hover on any X theme. */
function highlightCss(t: "light" | "dark"): string {
  const c = t === "dark" ? { line: "#8f84ff", tint: "rgba(143, 132, 255, 0.18)", strong: "rgba(143, 132, 255, 0.34)" } : { line: "#5b4bff", tint: "rgba(91, 75, 255, 0.10)", strong: "rgba(91, 75, 255, 0.22)" };
  return [
    `::highlight(${HIGHLIGHT}) { background-color: ${c.tint}; text-decoration: underline dashed ${c.line}; text-decoration-thickness: 2px; text-underline-offset: 3px; }`,
    `::highlight(${HIGHLIGHT_ACTIVE}) { background-color: ${c.strong}; text-decoration: underline solid ${c.line}; text-decoration-thickness: 2px; text-underline-offset: 3px; }`,
  ].join("\n");
}

export function highlightSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
}

function ensureHighlight(): Highlight | null {
  if (!highlightSupported()) return null;
  if (!highlight) {
    highlight = new Highlight();
    active = new Highlight();
    // Above the plain marks where the two overlap.
    active.priority = 1;
    CSS.highlights.set(HIGHLIGHT, highlight);
    CSS.highlights.set(HIGHLIGHT_ACTIVE, active);
    // ::highlight() rules have to live in the page's own stylesheets.
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(highlightCss(theme));
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {
      // No marks then; hovering still works.
    }
  }
  return highlight;
}

/** X's light, dim and lights-out themes need different strengths of the same violet. */
export function setHighlightTheme(next: "light" | "dark"): void {
  if (next === theme) return;
  theme = next;
  try {
    sheet?.replaceSync(highlightCss(theme));
  } catch {
    // Keep the previous colours.
  }
}

/** Draws one spot stronger: the one under the pointer or with its card open. */
export function setActiveSpot(spot: Spot | null): void {
  if (!active) return;
  active.clear();
  if (spot?.range.startContainer.isConnected) active.add(spot.range);
}

/** The handle of whoever wrote this text: the quoted post's author inside a quote, the post's author outside it. */
function authorOf(textEl: Element, article: Element): string | null {
  const quote = textEl.closest(QUOTE);
  const scope = quote && article.contains(quote) && quote !== article && quote.querySelector('[data-testid="User-Name"]') ? quote : article;
  const name = scope.querySelector('[data-testid="User-Name"]')?.textContent ?? "";
  return name.match(/@([A-Za-z0-9_]{1,15})/)?.[1] ?? null;
}

const stillValid = (s: Spot) => s.range.startContainer.isConnected && s.range.toString() === s.written;

/** Marks every address and name in one post; cheap to call again on every page change. */
export function markPost(article: Element): void {
  const hl = ensureHighlight();
  if (!hl) return;
  for (const textEl of article.querySelectorAll(TEXT)) {
    const text = textEl.textContent ?? "";
    const known = marked.get(textEl);
    if (known && known.text === text && known.spots.every(stillValid)) continue;
    for (const s of known?.spots ?? []) hl.delete(s.range);
    const spots: Spot[] = [];
    if (/0x[0-9a-fA-F]{40}|\.eth\b/i.test(text)) {
      const author = authorOf(textEl, article);
      // Text inside links (mentions, hashtags, URLs) is left alone.
      const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest("a") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
        for (const m of findWallets(node.data)) {
          const range = document.createRange();
          range.setStart(node, m.start);
          range.setEnd(node, m.end);
          hl.add(range);
          spots.push({ range, value: m.value, written: node.data.slice(m.start, m.end), kind: m.kind, author, article });
        }
      }
    }
    marked.set(textEl, { text, spots });
  }
}

/** Drops ranges whose text X has thrown away, so the highlight does not keep them alive. */
export function pruneHighlights(): void {
  for (const hl of [highlight, active]) {
    if (!hl) continue;
    for (const range of hl) {
      if (!(range as Range).startContainer.isConnected) hl.delete(range);
    }
  }
}

export function clearHighlights(): void {
  highlight?.clear();
  active?.clear();
}

/** The spot under the pointer, if any. */
export function spotAt(target: Element | null, x: number, y: number): Spot | null {
  const textEl = target?.closest(TEXT);
  if (!textEl) return null;
  for (const spot of marked.get(textEl)?.spots ?? []) {
    for (const r of spot.range.getClientRects()) {
      if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1) return spot;
    }
  }
  return null;
}

/** Distinct addresses and names in a post, for the menu. */
export function spotsIn(article: Element): Spot[] {
  const out: Spot[] = [];
  for (const textEl of article.querySelectorAll(TEXT)) {
    for (const spot of marked.get(textEl)?.spots ?? []) {
      if (!out.some((o) => o.value.toLowerCase() === spot.value.toLowerCase())) out.push(spot);
    }
  }
  return out;
}
