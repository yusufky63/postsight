/**
 * A small Markdown subset parsed into plain data. Model output is rendered from this
 * tree with textContent only, so nothing a model writes can become live HTML.
 */
import { isUrlText, shortUrl } from "./format";

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "rule" };

export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** Index of the `)` that closes a link target, allowing balanced parentheses inside URLs. */
function closingParen(src: string, from: number): number {
  let depth = 0;
  for (let j = from; j < src.length; j++) {
    const c = src[j];
    if (c === "(") depth += 1;
    else if (c === ")") {
      if (depth === 0) return j;
      depth -= 1;
    } else if (c === " " || c === "\n") return -1;
  }
  return -1;
}

const BARE_URL =/https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"]/y;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const rest = src.slice(i);

    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**") || rest.startsWith("__")) {
      const marker = rest.slice(0, 2);
      const end = src.indexOf(marker, i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" && src[i + 1] !== " ") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[end - 1] !== " ") {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const close = src.indexOf("](", i);
      const end = close === -1 ? -1 : closingParen(src, close + 2);
      if (close > i && end > close) {
        const href = safeHref(src.slice(close + 2, end));
        const rawLabel = src.slice(i + 1, close);
        // A label that is itself an address gets the same short form as a bare link.
        const label: Inline[] = isUrlText(rawLabel) ? [{ type: "text", text: shortUrl(rawLabel) }] : parseInline(rawLabel);
        flush();
        if (href) out.push({ type: "link", href, children: label });
        else out.push(...label);
        i = end + 1;
        continue;
      }
    }
    if (ch === "h") {
      BARE_URL.lastIndex = i;
      const match = BARE_URL.exec(src);
      if (match) {
        const href = safeHref(match[0]);
        if (href) {
          flush();
          out.push({ type: "link", href, children: [{ type: "text", text: shortUrl(match[0]) }] });
          i += match[0].length;
          continue;
        }
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

const LIST_ITEM = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const endPara = () => {
    if (para.length) blocks.push({ type: "paragraph", children: parseInline(para.join(" ")) });
    para = [];
  };
  const endList = () => {
    if (list) blocks.push({ type: "list", ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      endPara();
      endList();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) body.push(lines[i++] ?? "");
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    if (!trimmed) {
      endPara();
      endList();
      continue;
    }
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      endPara();
      endList();
      const level = (heading[1] ?? "").length <= 2 ? 2 : 3;
      blocks.push({ type: "heading", level, children: parseInline((heading[2] ?? "").replace(/\s#+$/, "")) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      endPara();
      endList();
      blocks.push({ type: "rule" });
      continue;
    }
    if (trimmed.startsWith(">")) {
      endPara();
      endList();
      blocks.push({ type: "quote", children: parseInline(trimmed.replace(/^>\s?/, "")) });
      continue;
    }
    const item = line.match(LIST_ITEM);
    if (item) {
      endPara();
      const ordered = item[2] !== undefined;
      if (list && list.ordered !== ordered) endList();
      if (!list) list = { ordered, items: [] };
      list.items.push(item[3] ?? "");
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) {
      // Indented continuation of the previous list item.
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]} ${trimmed}`;
      continue;
    }
    endList();
    para.push(trimmed);
  }
  endPara();
  endList();
  return blocks;
}

export function inlineToText(nodes: readonly Inline[]): string {
  return nodes
    .map((n) => (n.type === "text" || n.type === "code" ? n.text : inlineToText(n.children)))
    .join("");
}

/** Markdown reduced to readable plain text, for copying. */
export function markdownToText(src: string): string {
  return parseMarkdown(src)
    .map((b) => {
      switch (b.type) {
        case "heading":
          return inlineToText(b.children).toUpperCase();
        case "paragraph":
          return inlineToText(b.children);
        case "quote":
          return `> ${inlineToText(b.children)}`;
        case "list":
          return b.items.map((it, n) => `${b.ordered ? `${n + 1}.` : "-"} ${inlineToText(it)}`).join("\n");
        case "code":
          return b.text;
        case "rule":
          return "---";
      }
    })
    .join("\n\n");
}
