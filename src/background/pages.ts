import { extractReadable, parseXArticle, tcoTarget } from "../shared/readable";
import type { LinkedPage, TweetData } from "../shared/types";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000;
const ALL_SITES = { origins: ["<all_urls>"] };

/** Reads at most `max` bytes of a response as text, so a huge page cannot stall the worker. */
async function readCapped(res: Response, max = MAX_BYTES): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (bytes >= max) break;
    }
  } finally {
    void reader.cancel().catch(() => undefined);
  }
  return out + decoder.decode();
}

/** Fetches a page as a logged-out visitor: no cookies, no credentials. */
async function getHtml(url: string, signal: AbortSignal): Promise<{ html: string; finalUrl: string } | null> {
  try {
    const res = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      headers: { accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
    if (!res.ok || !/html|xml/i.test(res.headers.get("content-type") ?? "")) return null;
    return { html: await readCapped(res), finalUrl: res.url || url };
  } catch {
    return null;
  }
}

const isXUrl = (url: string) => /^https?:\/\/(?:[a-z]+\.)?(?:x|twitter)\.com\//i.test(url);

/**
 * X Articles are not in the timeline's markup. X's logged-out post page carries the
 * article text in its server-rendered state, so that page is read instead.
 */
export async function fetchXArticle(tweet: TweetData, signal: AbortSignal): Promise<LinkedPage | null> {
  const url = `https://x.com/${tweet.handle}/status/${tweet.id}`;
  const page = await getHtml(url, signal);
  const article = page ? parseXArticle(page.html) : null;
  return article ? { url, kind: "x-article", ...article } : null;
}

export async function canReadAllSites(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(ALL_SITES);
  } catch {
    return false;
  }
}

/** Resolves a t.co address to where it points; other addresses come back unchanged. */
async function resolve(url: string, signal: AbortSignal): Promise<string | null> {
  if (!/^https:\/\/t\.co\//.test(url)) return url;
  const page = await getHtml(url, signal);
  if (!page) return null;
  if (!/^https:\/\/t\.co\//.test(page.finalUrl)) return page.finalUrl;
  return tcoTarget(page.html);
}

export async function fetchWebPage(url: string, signal: AbortSignal): Promise<LinkedPage | null> {
  const target = await resolve(url, signal);
  if (!target || isXUrl(target)) return null;
  const page = await getHtml(target, signal);
  if (!page) return null;
  const readable = extractReadable(page.html);
  if (readable.text.length < 80 && !readable.description) return null;
  return { url: page.finalUrl, kind: "web", ...readable };
}
