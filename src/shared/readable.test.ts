import { describe, expect, it } from "vitest";
import { cap, decodeEntities, extractReadable, parseXArticle, tcoTarget } from "./readable";

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("Tom &amp; Jerry &#8220;hi&#x201D; &hellip;")).toBe("Tom & Jerry “hi” …");
  });
});

describe("extractReadable", () => {
  const page = `<!doctype html><html><head>
    <title>Fallback title</title>
    <meta property="og:title" content="Port reopens after storm">
    <meta property="og:site_name" content="Harbor News">
    <meta property="article:published_time" content="2026-10-15T09:00:00Z">
    <meta name="description" content="The port reopened on Wednesday.">
    <script>var tracking = "do not read";</script></head>
    <body><nav><p>Home News Sport and a menu long enough to look like a paragraph here</p></nav>
    <article><p>The port reopened on Wednesday after three days of closures caused by the storm.</p>
    <p>Officials said cargo traffic would return to normal by the weekend &amp; ferries resume today.</p></article>
    <footer><p>Copyright notice that is long enough to pass the paragraph length filter</p></footer></body></html>`;

  it("keeps the article text and metadata, drops scripts, navigation and footers", () => {
    const r = extractReadable(page);
    expect(r.title).toBe("Port reopens after storm");
    expect(r.site).toBe("Harbor News");
    expect(r.published).toBe("2026-10-15T09:00:00Z");
    expect(r.description).toBe("The port reopened on Wednesday.");
    expect(r.text).toContain("cargo traffic would return to normal by the weekend & ferries");
    expect(r.text).not.toContain("tracking");
    expect(r.text).not.toContain("menu long enough");
    expect(r.text).not.toContain("Copyright");
  });

  it("falls back to the body text for pages built from divs and line breaks", () => {
    const r = extractReadable(`<html><body><div class="post">First line of a blog post that has no paragraph tags at all.<br>Second line keeps going with more detail about the event and its causes, long enough to count.<br>${"More words. ".repeat(40)}</div></body></html>`);
    expect(r.text).toContain("First line of a blog post");
    expect(r.text).toContain("Second line keeps going");
  });

  it("caps long text at a sentence or line boundary", () => {
    const text = cap("One sentence here. ".repeat(100), 200);
    expect(text.length).toBeLessThanOrEqual(201);
    expect(text.endsWith("…")).toBe(true);
  });
});

describe("parseXArticle", () => {
  // Same shape as X's logged-out post page: blocks of [key, type, text] JSON inside a JS string.
  const blocks = [
    ["a1", "unstyled", "The city library opens a new reading room on Monday"],
    ["a2", "header-two", "What changes"],
    ["a3", "unstyled", 'It has "quiet" desks and long opening hours.'],
    ["a4", "unordered-list-item", "Open until 22:00"],
  ];
  const html = `<meta property="og:description" content="A new reading room at the city library" />
    <script>$_TSR.router=($R=>$R[0]={l:$R[7]={articleDocument:$R[8]={contentKey:${JSON.stringify(JSON.stringify(blocks))},entityMap:[]}}})</script>`;

  it("rebuilds the article text from the embedded blocks", () => {
    const article = parseXArticle(html);
    expect(article?.title).toBe("A new reading room at the city library");
    expect(article?.site).toBe("X Article");
    expect(article?.text).toBe(
      'The city library opens a new reading room on Monday\n\n## What changes\n\nIt has "quiet" desks and long opening hours.\n\n- Open until 22:00',
    );
  });

  it("returns null for pages without an article", () => {
    expect(parseXArticle("<html><meta property='og:description' content='just a post'></html>")).toBeNull();
  });
});

describe("tcoTarget", () => {
  it("reads the destination from t.co's redirect page", () => {
    const html = `<head><noscript><META http-equiv="refresh" content="0;URL=https://x.com/i/article/1900000000000000001"></noscript><title>https://x.com/i/article/1900000000000000001</title></head>`;
    expect(tcoTarget(html)).toBe("https://x.com/i/article/1900000000000000001");
  });
});
