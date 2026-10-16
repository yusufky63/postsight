/**
 * Turns fetched HTML into plain text for the model. The service worker has no
 * DOMParser, so this works on the markup as text: enough for articles, blogs and
 * X's server-rendered post pages, and nothing in it ever runs the page.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section|article|blockquote|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function meta(html: string, names: string[]): string | null {
  for (const name of names) {
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content?.trim()) return decodeEntities(content.trim());
  }
  return null;
}

export interface Readable {
  title: string;
  site: string | null;
  published: string | null;
  description: string | null;
  text: string;
}

/** Title, metadata and main text of an ordinary web page, capped at `max` characters. */
export function extractReadable(html: string, max = 6000): Readable {
  const title =
    meta(html, ["og:title", "twitter:title"]) ?? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "");
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|head|nav|header|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, " ");
  // Article text usually sits in <p>; pages built from divs and <br> fall back to the whole body.
  const paragraphs = [...cleaned.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1] ?? ""))
    .filter((p) => p.length > 40);
  const main = cleaned.match(/<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i)?.[2];
  let text = paragraphs.join("\n\n");
  if (text.length < 400) text = stripTags(main ?? cleaned.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? cleaned);
  return {
    title,
    site: meta(html, ["og:site_name", "application-name"]),
    published: meta(html, ["article:published_time", "og:published_time", "date", "pubdate"]),
    description: meta(html, ["og:description", "description", "twitter:description"]),
    text: cap(text, max),
  };
}

export function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(". "));
  return `${end > max * 0.6 ? cut.slice(0, end + 1) : cut}…`;
}

/** Reads a JavaScript string literal starting at the opening quote; returns its value and end. */
function readJsString(src: string, start: number): string | null {
  const quote = src[start];
  if (quote !== '"' && quote !== "'") return null;
  let i = start + 1;
  let raw = "";
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      raw += src.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === quote) {
      try {
        // JSON understands every escape X emits except \' and \0; normalise those first.
        return JSON.parse(`"${raw.replace(/\\'/g, "'").replace(/\\0/g, "\\u0000").replace(/(?<!\\)"/g, '\\"')}"`) as string;
      } catch {
        return null;
      }
    }
    raw += ch;
    i += 1;
  }
  return null;
}

/**
 * X Articles: the logged-out post page embeds the article as a list of
 * `[key, blockType, text]` blocks in its router state (`articleDocument.contentKey`).
 * Returns null when the page has no article or the format has changed.
 */
export function parseXArticle(html: string, max = 15000): Readable | null {
  const at = html.indexOf("articleDocument");
  if (at === -1) return null;
  const keyAt = html.indexOf("contentKey:", at);
  if (keyAt === -1 || keyAt - at > 2000) return null;
  const literal = readJsString(html, keyAt + "contentKey:".length);
  if (!literal) return null;
  let blocks: unknown;
  try {
    blocks = JSON.parse(literal);
  } catch {
    return null;
  }
  if (!Array.isArray(blocks)) return null;
  const lines: string[] = [];
  for (const block of blocks) {
    if (!Array.isArray(block) || typeof block[2] !== "string") continue;
    const type = String(block[1] ?? "");
    const text = block[2].trim();
    if (!text) continue;
    if (type.startsWith("header")) lines.push(`## ${text}`);
    else if (type.includes("list-item")) lines.push(`- ${text}`);
    else if (type === "blockquote") lines.push(`> ${text}`);
    else lines.push(text);
  }
  if (!lines.length) return null;
  const description = meta(html, ["og:description", "description"]);
  return {
    title: description ?? lines[0] ?? "",
    site: "X Article",
    published: null,
    description: null,
    text: cap(lines.join("\n\n"), max),
  };
}

/** t.co answers browsers with a page that redirects by script; the target is in the markup. */
export function tcoTarget(html: string): string | null {
  const fromMeta = html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*URL=([^"']+)["']/i)?.[1];
  const fromTitle = html.match(/<title>\s*(https?:\/\/[^<\s]+)\s*<\/title>/i)?.[1];
  const target = fromMeta ?? fromTitle;
  return target ? decodeEntities(target) : null;
}
