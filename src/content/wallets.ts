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

const marked = new WeakMap<Element, Marked>();
let highlight: Highlight | null = null;

export function highlightSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight === "function";
}

function ensureHighlight(): Highlight | null {
  if (!highlightSupported()) return null;
  if (!highlight) {
    highlight = new Highlight();
    CSS.highlights.set(HIGHLIGHT, highlight);
    // ::highlight() rules have to live in the page's own stylesheets.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(
        `::highlight(${HIGHLIGHT}) { text-decoration: underline dotted rgba(91, 75, 255, 0.85); text-decoration-thickness: 1.5px; text-underline-offset: 3px; }`,
      );
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } catch {
      // No underline then; hovering still works.
    }
  }
  return highlight;
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
  if (!highlight) return;
  for (const range of highlight) {
    if (!(range as Range).startContainer.isConnected) highlight.delete(range);
  }
}

export function clearHighlights(): void {
  highlight?.clear();
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
