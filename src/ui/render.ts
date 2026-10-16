import { shortUrl } from "../shared/format";
import { parseMarkdown, safeHref } from "../shared/markdown";
import type { Inline } from "../shared/markdown";
import { h } from "./dom";

export function renderInline(nodes: readonly Inline[]): Node[] {
  return nodes.map((n) => {
    switch (n.type) {
      case "text":
        return document.createTextNode(n.text);
      case "code":
        return h("code", null, n.text);
      case "strong":
        return h("strong", null, renderInline(n.children));
      case "em":
        return h("em", null, renderInline(n.children));
      case "link":
        return h("a", { href: n.href, target: "_blank", rel: "noopener noreferrer nofollow", title: n.href }, renderInline(n.children));
    }
  });
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?'")\]]/g;

/** Plain text with web addresses turned into short, clickable links (the full address is in the tooltip). */
export function linkify(text: string): Node[] {
  const out: Node[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const start = match.index ?? 0;
    if (start > last) out.push(document.createTextNode(text.slice(last, start)));
    const href = safeHref(match[0]);
    out.push(
      href
        ? h("a", { href, target: "_blank", rel: "noopener noreferrer nofollow", title: href }, shortUrl(match[0]))
        : document.createTextNode(match[0]),
    );
    last = start + match[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

export function renderMarkdown(src: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const block of parseMarkdown(src)) {
    switch (block.type) {
      case "heading":
        frag.appendChild(h(block.level === 2 ? "h3" : "h4", null, renderInline(block.children)));
        break;
      case "paragraph":
        frag.appendChild(h("p", null, renderInline(block.children)));
        break;
      case "quote":
        frag.appendChild(h("blockquote", null, renderInline(block.children)));
        break;
      case "list":
        frag.appendChild(
          h(block.ordered ? "ol" : "ul", null, block.items.map((item) => h("li", null, renderInline(item)))),
        );
        break;
      case "code":
        frag.appendChild(h("pre", null, h("code", null, block.text)));
        break;
      case "rule":
        frag.appendChild(h("hr"));
        break;
    }
  }
  return frag;
}
