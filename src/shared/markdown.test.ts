import { describe, expect, it } from "vitest";
import { markdownToText, parseInline, parseMarkdown, safeHref } from "./markdown";

describe("parseInline", () => {
  it("handles bold, emphasis and code", () => {
    expect(parseInline("a **b** *c* `d`")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "code", text: "d" },
    ]);
  });

  it("keeps snake_case words intact", () => {
    expect(parseInline("mostly_accurate value")).toEqual([{ type: "text", text: "mostly_accurate value" }]);
  });

  it("links markdown links and bare URLs", () => {
    const nodes = parseInline("see [Reuters](https://reuters.com/a) or https://apnews.com/b.");
    expect(nodes[1]).toEqual({ type: "link", href: "https://reuters.com/a", children: [{ type: "text", text: "Reuters" }] });
    expect(nodes[3]).toEqual({ type: "link", href: "https://apnews.com/b", children: [{ type: "text", text: "apnews.com/b" }] });
    expect(nodes[4]).toEqual({ type: "text", text: "." });
  });

  it("drops script URLs but keeps their label", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ type: "text", text: "click" }]);
    expect(safeHref("data:text/html,x")).toBeNull();
  });
});

describe("parseMarkdown", () => {
  it("builds headings, lists and paragraphs", () => {
    const blocks = parseMarkdown("## Claims\n- one\n- two\n\nPlain text\ncontinues.\n\n1. first\n2. second");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "list", "paragraph", "list"]);
    const ordered = blocks[3];
    expect(ordered?.type === "list" && ordered.ordered).toBe(true);
    const para = blocks[2];
    expect(para?.type === "paragraph" && para.children).toEqual([{ type: "text", text: "Plain text continues." }]);
  });

  it("joins indented continuation lines into the list item", () => {
    const [list] = parseMarkdown("- first line\n  wraps here");
    expect(list?.type === "list" && list.items[0]).toEqual([{ type: "text", text: "first line wraps here" }]);
  });

  it("keeps fenced code verbatim", () => {
    expect(parseMarkdown("```\n**not bold**\n```")).toEqual([{ type: "code", text: "**not bold**" }]);
  });

  it("flattens to plain text for copying", () => {
    expect(markdownToText("## Bottom line\n**True**, see [x](https://x.com)")).toBe("BOTTOM LINE\n\nTrue, see x");
  });
});
