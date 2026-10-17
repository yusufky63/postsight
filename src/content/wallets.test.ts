// @vitest-environment happy-dom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { HIGHLIGHT, markPost, pruneHighlights, spotsIn } from "./wallets";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

// happy-dom has no CSS Custom Highlight API; a Set-backed stand-in is enough here.
class FakeHighlight extends Set<Range> {}
const registry = new Map<string, FakeHighlight>();

beforeAll(() => {
  vi.stubGlobal("Highlight", FakeHighlight);
  vi.stubGlobal("CSS", { highlights: registry });
});

const POST = `
  <article data-testid="tweet">
    <div data-testid="User-Name"><a href="/chainnotes"><span>Chain Notes</span></a><a href="/chainnotes"><span>@chainnotes</span></a></div>
    <div data-testid="tweetText">Send to <span>${VITALIK}</span> or vitalik.eth. Docs: <a href="https://t.co/x">app.ens.domains/nick.eth</a></div>
    <div role="link">
      <div data-testid="User-Name"><span>Quoted</span><span>@quoted_one</span></div>
      <div data-testid="tweetText">My name is jesse.base.eth</div>
    </div>
  </article>`;

describe("markPost", () => {
  it("marks addresses and names outside links, each with the author of its own text", () => {
    document.body.innerHTML = POST;
    const article = document.querySelector("article")!;
    markPost(article);
    const spots = spotsIn(article);
    expect(spots.map((s) => [s.value, s.author])).toEqual([
      [VITALIK, "chainnotes"],
      ["vitalik.eth", "chainnotes"],
      ["jesse.base.eth", "quoted_one"],
    ]);
    expect(registry.get(HIGHLIGHT)?.size).toBe(3);
    expect(spots[0]?.range.toString()).toBe(VITALIK);
  });

  it("rebuilds when X replaces the text, and drops ranges that left the page", () => {
    document.body.innerHTML = POST;
    const article = document.querySelector("article")!;
    markPost(article);
    const text = article.querySelector('[data-testid="tweetText"]')!;
    text.textContent = "Nothing here any more";
    markPost(article);
    pruneHighlights();
    expect(spotsIn(article).map((s) => s.value)).toEqual(["jesse.base.eth"]);
    document.body.innerHTML = "";
    pruneHighlights();
    expect(registry.get(HIGHLIGHT)?.size).toBe(0);
  });
});
