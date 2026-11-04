/*
 * Where things are in a post on x.com. X rebuilt its web app in October 2026: the new
 * markup has no data-testid attributes, quoted posts are nested <article>s inside an
 * "embedded-tweet-frame", and buttons are tagged with data-slot and
 * data-engagement-action instead. Each selector here lists the new form and the old one,
 * so posts in either layout work while X rolls the change out.
 */

/** A quoted post inside a post. */
export const QUOTE = '[data-slot="embedded-tweet-frame"], div[role="link"]';
/** The text of a post or of a quoted post; article titles and summaries do not match. */
export const TEXT = '[data-testid="tweetText"], div[dir="auto"].whitespace-pre-wrap';
/** The old layout's author line; the new one has none, see authorLink. */
const OLD_NAME = '[data-testid="User-Name"]';

/** False for an element inside a quoted post of `scope`; a quote counts as its own scope. */
export function outsideQuote(el: Element, scope: Element): boolean {
  const quote = el.closest(QUOTE);
  return !quote || !scope.contains(quote) || quote === scope;
}

function firstOutside<T extends Element>(scope: Element, selector: string): T | null {
  for (const el of scope.querySelectorAll<T>(selector)) if (outsideQuote(el, scope)) return el;
  return null;
}

/** A post: the old layout tags it; in the new one it is an article not nested in another (a quote is). */
export function isPost(el: Element): boolean {
  return el.matches('article[data-testid="tweet"]') || (el.tagName === "ARTICLE" && !el.parentElement?.closest("article"));
}

/** The post an element belongs to; from inside a quoted post, the post that quotes it. */
export function postOf(el: Element | null | undefined): Element | null {
  for (let a = el?.closest("article") ?? null; a; a = a.parentElement?.closest("article") ?? null) {
    if (isPost(a)) return a;
  }
  return null;
}

/** Posts on the page in order, without the hidden copies X keeps for its own layout. */
export function posts(root: ParentNode = document): Element[] {
  return [...root.querySelectorAll("article")].filter((el) => isPost(el) && !el.closest("[hidden]"));
}

/** The status link of a post (or of a quoted post when `scope` is the quote), never one of a quote inside it. */
export function statusLink(scope: Element): { handle: string; id: string } | null {
  const time = firstOutside(scope, "time");
  const anchor = time?.closest('a[href*="/status/"]') ?? firstOutside(scope, 'a[href*="/status/"]');
  const match = anchor?.getAttribute("href")?.match(/^\/([^/]+)\/status\/(\d+)/);
  return match ? { handle: match[1] ?? "", id: match[2] ?? "" } : null;
}

/** The old layout's author line, or in the new one the link to the author's profile that holds the display name. */
export function authorLink(scope: Element): Element | null {
  const old = firstOutside(scope, OLD_NAME);
  if (old) return old;
  const handle = statusLink(scope)?.handle;
  if (!handle) return null;
  for (const a of scope.querySelectorAll(`a[href="/${CSS.escape(handle)}"]`)) {
    if (outsideQuote(a, scope) && a.querySelector(".font-bold")) return a;
  }
  return null;
}

/** The "more" button in the post header, which the badge sits next to. */
export function moreButton(post: Element): Element | null {
  const old = firstOutside(post, '[data-testid="caret"]');
  if (old) return old;
  for (const b of post.querySelectorAll('button[data-slot="xds-menu-trigger"][aria-haspopup="menu"]')) {
    if (outsideQuote(b, post) && !b.closest("[data-engagement-action]")) return b;
  }
  return null;
}

/** The row of reply, repost, like and share buttons under the post. */
export function actionBar(post: Element): Element | null {
  const old = [...post.querySelectorAll('[role="group"]')].pop();
  if (old) return old;
  return firstOutside(post, "[data-engagement-action]")?.parentElement ?? null;
}

/** The post's own text, not a quoted post's. */
export function mainText(post: Element): HTMLElement | null {
  return firstOutside<HTMLElement>(post, TEXT);
}

/** Photos in the post itself; link cards and videos have their own images and do not count. */
export function photos(post: Element): HTMLImageElement[] {
  return [...post.querySelectorAll<HTMLImageElement>('[data-testid="tweetPhoto"] img, img[src*="pbs.twimg.com/media/"]')].filter(
    (img) => outsideQuote(img, post) && !img.closest('[data-testid="videoPlayer"]'),
  );
}

export function hasVideo(post: Element): boolean {
  return firstOutside(post, '[data-testid="videoPlayer"], [data-testid="videoComponent"], video') !== null;
}

/** A link preview card: X's old wrapper, or in the new layout the box around a t.co link with a card image. */
export function linkCard(post: Element): Element | null {
  const old = firstOutside(post, '[data-testid="card.wrapper"]');
  if (old) return old;
  return firstOutside(post, 'img[src*="pbs.twimg.com/card_img/"]')?.closest("a")?.parentElement ?? null;
}

/** An X Article's card or view: old testids name it; the new card sets its text in the article font. */
export function articleView(post: Element): Element | null {
  const old = [...post.querySelectorAll("[data-testid]")].find((el) => /article|longform/i.test(el.getAttribute("data-testid") ?? ""));
  if (old) return old;
  const text = firstOutside(post, '[class*="font-article"]');
  return text ? (text.closest("a") ?? text.parentElement) : null;
}

/** X ids carry their creation time: milliseconds since X's epoch, shifted left by 22 bits. */
export function timeFromId(id: string): string | null {
  if (!/^\d{15,20}$/.test(id)) return null;
  const ms = Number(BigInt(id) >> 22n) + 1288834974657;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
