import { isUrlText, shortUrl } from "../shared/format";
import type { QuotedPost, ThreadItem, TweetData } from "../shared/types";

export const ARTICLE = 'article[data-testid="tweet"]';
const QUOTE = 'div[role="link"]';

/**
 * Reads text the way a person sees it: emoji images become their alt text. X shows
 * links shortened but keeps the full, often percent-encoded address in hidden spans;
 * by default links come back short (see shortUrl), and `fullLinks` keeps the whole
 * address for copying.
 */
export function readText(node: Node, fullLinks = false): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
    } else if (child instanceof HTMLImageElement) {
      out += child.alt;
    } else if (child instanceof HTMLBRElement) {
      out += "\n";
    } else if (child instanceof HTMLAnchorElement) {
      const text = (child.textContent ?? "").replace(/…$/, "");
      out += !fullLinks && isUrlText(text) ? shortUrl(text) : text;
    } else {
      out += readText(child, fullLinks);
    }
  });
  return out;
}

function outsideQuote(el: Element, article: Element): boolean {
  const quote = el.closest(QUOTE);
  return !quote || !article.contains(quote) || quote === article;
}

/** The status link next to the timestamp gives both the handle and the post id. */
function statusLink(scope: Element): { handle: string; id: string } | null {
  const time = scope.querySelector("time");
  const anchor = time?.closest('a[href*="/status/"]') ?? scope.querySelector('a[href*="/status/"]');
  const match = anchor?.getAttribute("href")?.match(/^\/([^/]+)\/status\/(\d+)/);
  return match ? { handle: match[1] ?? "", id: match[2] ?? "" } : null;
}

function readName(scope: Element): { name: string; handle: string } {
  const block = scope.querySelector('[data-testid="User-Name"]');
  if (!block) return { name: "", handle: "" };
  const all = block.textContent ?? "";
  const handle = all.match(/@([A-Za-z0-9_]{1,15})/)?.[1] ?? "";
  // The first link holds the display name; emoji in names are images, so read alt text too.
  const nameEl = block.querySelector("a") ?? block;
  const name = readText(nameEl).split(/\s*@[A-Za-z0-9_]{1,15}/)[0]?.trim() ?? "";
  return { name, handle };
}

function mainTextEl(article: Element): HTMLElement | null {
  for (const el of article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]')) {
    if (outsideQuote(el, article)) return el;
  }
  return null;
}

/** The post's own text with links left whole, for copying. */
export function postText(article: Element): string {
  const el = mainTextEl(article);
  return el ? readText(el, true).trim() : "";
}

/** pbs.twimg.com serves several sizes; medium is plenty for a model and keeps image tokens down. */
export function imageUrl(src: string): string | null {
  try {
    const url = new URL(src);
    if (url.hostname !== "pbs.twimg.com" || !url.pathname.startsWith("/media/")) return null;
    url.searchParams.set("name", "medium");
    if (!url.searchParams.has("format")) url.searchParams.set("format", "jpg");
    return url.href;
  } catch {
    return null;
  }
}

function readQuote(article: Element): QuotedPost | null {
  for (const box of article.querySelectorAll(QUOTE)) {
    if (!box.querySelector('[data-testid="User-Name"]')) continue;
    const text = box.querySelector('[data-testid="tweetText"]');
    const { name, handle } = readName(box);
    return { authorName: name, handle, text: text ? readText(text).trim() : "" };
  }
  return null;
}

export function postIdOf(article: Element): string | null {
  return statusLink(article)?.id ?? null;
}

const ARTICLE_LINK = /(?:^|\/\/|\.)(?:x|twitter)\.com\/(?:i|[A-Za-z0-9_]{1,15})\/article\/\d+/;
const X_HOST = /^https?:\/\/(?:[a-z]+\.)?(?:x|twitter)\.com\//i;

function visibleText(el: Element): string {
  const text = el instanceof HTMLElement && typeof el.innerText === "string" ? el.innerText : (el.textContent ?? "");
  return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Web pages the post points to. Link text holds the full address in hidden spans;
 * when it does not, the t.co address is kept and resolved by the service worker.
 */
function readLinks(article: Element, textEl: Element | null): string[] {
  const found: string[] = [];
  const add = (raw: string) => {
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    if (X_HOST.test(url) || found.includes(url)) return;
    try {
      new URL(url);
      found.push(url);
    } catch {
      // not an address
    }
  };
  for (const a of textEl?.querySelectorAll("a") ?? []) {
    const text = (a.textContent ?? "").replace(/…$/, "").trim();
    if (isUrlText(text)) add(text);
    else if (/^https:\/\/t\.co\//.test(a.href)) add(a.href);
  }
  for (const a of article.querySelectorAll<HTMLAnchorElement>('[data-testid="card.wrapper"] a[href]')) {
    if (outsideQuote(a, article) && /^https?:\/\//.test(a.href)) add(a.href);
  }
  return found.slice(0, 3);
}

/** An X Article (long-form post) links to /i/article/ or shows X's article views. */
function readArticle(article: Element, textEl: Element | null): { isArticle: boolean; body: string | null } {
  const linkHit = [...article.querySelectorAll("a")].some(
    (a) => outsideQuote(a, article) && (ARTICLE_LINK.test(a.getAttribute("href") ?? "") || ARTICLE_LINK.test(a.textContent ?? "")),
  );
  const view = [...article.querySelectorAll("[data-testid]")].find((el) => /article|longform/i.test(el.getAttribute("data-testid") ?? ""));
  const isArticle = linkHit || view !== undefined || (textEl ? ARTICLE_LINK.test(textEl.textContent ?? "") : false);
  const body = view ? visibleText(view).slice(0, 15000) : null;
  return { isArticle, body: body && body.length > 40 ? body : null };
}

export function extractTweet(article: Element): TweetData | null {
  const link = statusLink(article);
  if (!link) return null;
  const { name, handle } = readName(article);
  const textEl = mainTextEl(article);
  const images: string[] = [];
  for (const img of article.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img')) {
    if (!outsideQuote(img, article) || img.closest('[data-testid="videoPlayer"]')) continue;
    const url = imageUrl(img.src);
    if (url && !images.includes(url)) images.push(url);
  }
  const card = article.querySelector('[data-testid="card.wrapper"]');
  const author = handle || link.handle;
  const poll = article.querySelector('[data-testid="cardPoll"]');
  const note = article.querySelector('[data-testid="birdwatch-pivot"]');
  const { isArticle, body } = readArticle(article, textEl);
  return {
    id: link.id,
    url: `https://x.com/${author}/status/${link.id}`,
    authorName: name || author,
    handle: author,
    text: textEl ? readText(textEl).trim() : "",
    lang: textEl?.getAttribute("lang") ?? null,
    createdAt: article.querySelector("time")?.getAttribute("datetime") ?? null,
    images,
    hasVideo: article.querySelector('[data-testid="videoPlayer"], [data-testid="videoComponent"]') !== null,
    quote: readQuote(article),
    card: card ? (card.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || null : null,
    thread: [],
    links: readLinks(article, textEl),
    poll: poll ? visibleText(poll).slice(0, 800) || null : null,
    note: note ? visibleText(note).slice(0, 1500) || null : null,
    isArticle,
    body,
  };
}

const THREAD_LIMIT = 12;

/**
 * On a post page, the author's own posts directly above and below the one in
 * question form its thread.
 */
export function readThread(article: Element, handle: string, root: ParentNode = document): ThreadItem[] {
  if (!/\/status\/\d+/.test(location.pathname)) return [];
  const all = [...root.querySelectorAll(ARTICLE)];
  const index = all.indexOf(article);
  if (index === -1) return [];
  const take = (from: number, step: number, position: ThreadItem["position"]) => {
    const items: ThreadItem[] = [];
    for (let i = from; i >= 0 && i < all.length && items.length < THREAD_LIMIT; i += step) {
      const el = all[i];
      if (!el) break;
      const { handle: h } = readName(el);
      const text = mainTextEl(el);
      if (h.toLowerCase() !== handle.toLowerCase() || !text) break;
      items.push({ handle: h, text: readText(text).trim(), position });
    }
    return items;
  };
  return [...take(index - 1, -1, "before").reverse(), ...take(index + 1, 1, "after")];
}
