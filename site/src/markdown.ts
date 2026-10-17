/**
 * Renders repo Markdown (PRIVACY.md) with the extension's own parser, so the site and the
 * extension agree on what the syntax means and links stay limited to http and https.
 */
import { inlineToText, parseInline, parseMarkdown } from "../../src/shared/markdown";
import type { Block, Inline } from "../../src/shared/markdown";
import { html } from "./html";
import type { Markup } from "./html";

function inline(nodes: readonly Inline[]): Markup[] {
  return nodes.map((n) => {
    switch (n.type) {
      case "text":
        return html`${n.text}`;
      case "strong":
        return html`<strong>${inline(n.children)}</strong>`;
      case "em":
        return html`<em>${inline(n.children)}</em>`;
      case "code":
        return html`<code>${n.text}</code>`;
      case "link":
        return n.href.startsWith("https://postsight.xyz/")
          ? html`<a href="${n.href}">${inline(n.children)}</a>`
          : html`<a href="${n.href}" rel="noreferrer noopener">${inline(n.children)}</a>`;
    }
  });
}

/** Inline Markdown in site copy: `code`, **bold** and [links](https://…). */
export function md(text: string): Markup {
  return html`${inline(parseInline(text))}`;
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function block(b: Block): Markup {
  switch (b.type) {
    case "heading": {
      const id = slug(inlineToText(b.children));
      return b.level === 2 ? html`<h2 id="${id}">${inline(b.children)}</h2>` : html`<h3 id="${id}">${inline(b.children)}</h3>`;
    }
    case "paragraph":
      return html`<p>${inline(b.children)}</p>`;
    case "list": {
      const items = b.items.map((item) => html`<li>${inline(item)}</li>`);
      return b.ordered ? html`<ol>${items}</ol>` : html`<ul>${items}</ul>`;
    }
    case "quote":
      return html`<blockquote>${inline(b.children)}</blockquote>`;
    case "code":
      return html`<pre><code>${b.text}</code></pre>`;
    case "rule":
      return html`<hr>`;
  }
}

export type Policy = {
  /** Text of the leading `# ` heading. */
  title: string;
  /** ISO date from the "Last updated: YYYY-MM-DD" line, if present. */
  updated: string | null;
  /** Second-level headings, for the page's table of contents. */
  sections: { id: string; title: string }[];
  body: Markup;
};

/**
 * Splits the policy into its title, its "Last updated" date and the rest, so the page can
 * show the first two in its own header instead of repeating them in the body.
 */
export function renderPolicy(src: string): Policy {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let title = "";
  let updated: string | null = null;
  const rest: string[] = [];
  for (const line of lines) {
    const heading = !title && line.match(/^#\s+(.+)$/);
    if (heading) {
      title = (heading[1] ?? "").trim();
      continue;
    }
    const date: RegExpMatchArray | null | false = !updated && line.match(/^Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/);
    if (date) {
      updated = date[1] ?? null;
      continue;
    }
    rest.push(line);
  }
  if (!title) throw new Error("PRIVACY.md must start with a '# ' title");
  const blocks = parseMarkdown(rest.join("\n"));
  const sections = blocks.flatMap((b) => {
    if (b.type !== "heading" || b.level !== 2) return [];
    const text = inlineToText(b.children);
    return [{ id: slug(text), title: text }];
  });
  return { title, updated, sections, body: html`${blocks.map(block)}` };
}
