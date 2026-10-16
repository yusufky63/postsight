// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { linkify } from "../ui/render";
import { extractTweet, postText, readText } from "./tweet";

// How X renders a link inside a post: the scheme and the tail are hidden spans,
// the visible part ends in an ellipsis.
const POST = `
  <article data-testid="tweet">
    <div data-testid="User-Name"><a href="/news"><span>News Desk</span></a><a href="/news"><span>@news</span></a></div>
    <a href="/news/status/42"><time datetime="2026-10-16T08:00:00.000Z">Oct 16</time></a>
    <div data-testid="tweetText" lang="el">Σκηνές χάους <a href="https://t.co/abc"><span>https://</span><span>msn.com/el-gr/news/other/</span><span>%CF%83%CE%BA%CE%B7%CE%BD%CE%AD%CF%82-%CF%87%CE%AC%CE%BF%CF%85%CF%82-%CF%83%CF%84%CE%B7%CE%BD-%CE%B1%CE%BB%CE%B2%CE%B1%CE%BD%CE%AF%CE%B1-%CF%80%CE%B5%CF%84%CF%81%CE%BF%CF%80%CF%8C%CE%BB%CE%B5%CE%BC%CE%BF%CF%82/ar-AA2ej0J2?ocid=msedgdhp&amp;pc=U531</span><span>…</span></a> via <a href="/someone">@someone</a></div>
  </article>`;

describe("reading links from a post", () => {
  it("sends a short, decoded link to the model and leaves mentions alone", () => {
    document.body.innerHTML = POST;
    const tweet = extractTweet(document.querySelector("article")!)!;
    expect(tweet.text).toContain("msn.com/el-gr/news/other/σκηνές-χάους");
    expect(tweet.text).not.toContain("%CF");
    expect(tweet.text).not.toContain("ocid=");
    expect(tweet.text).toContain("@someone");
    expect(tweet.text.length).toBeLessThan(110);
  });

  it("keeps the whole address when copying", () => {
    document.body.innerHTML = POST;
    const article = document.querySelector("article")!;
    expect(postText(article)).toContain("ocid=msedgdhp");
    expect(readText(article.querySelector('[data-testid="tweetText"]')!, true)).toContain("https://msn.com");
  });
});

describe("other kinds of posts", () => {
  it("recognises an X Article and leaves x.com out of the links to fetch", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/writer"><span>Writer</span></a><span>@writer</span></div>
        <a href="/writer/status/7"><time datetime="2026-10-16T08:00:00.000Z">Oct 16</time></a>
        <div data-testid="tweetText"><a href="https://t.co/xyz"><span>https://</span><span>x.com/i/article/2110261256766566403</span></a></div>
      </article>`;
    const tweet = extractTweet(document.querySelector("article")!)!;
    expect(tweet.isArticle).toBe(true);
    expect(tweet.links).toEqual([]);
  });

  it("collects outside links, polls and community notes", () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <div data-testid="User-Name"><a href="/poller"><span>Poller</span></a><span>@poller</span></div>
        <a href="/poller/status/8"><time datetime="2026-10-16T08:00:00.000Z">Oct 16</time></a>
        <div data-testid="tweetText">Vote <a href="https://t.co/a1"><span>https://</span><span>example.org/report</span></a></div>
        <div data-testid="card.wrapper"><a href="https://t.co/card1">example.org</a></div>
        <div data-testid="cardPoll">Yes 60%\nNo 40%</div>
        <div data-testid="birdwatch-pivot">Readers added context: the report is from 2019.</div>
      </article>`;
    const tweet = extractTweet(document.querySelector("article")!)!;
    expect(tweet.isArticle).toBe(false);
    expect(tweet.links).toEqual(["https://example.org/report", "https://t.co/card1"]);
    expect(tweet.poll).toContain("Yes 60%");
    expect(tweet.note).toContain("from 2019");
  });
});

describe("linkify", () => {
  it("turns addresses in plain text into short links with the full target", () => {
    const nodes = linkify("Read https://example.com/very/long/path?utm_source=x now.");
    const link = nodes[1] as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.textContent).toBe("example.com/very/long/path");
    expect(link.getAttribute("href")).toBe("https://example.com/very/long/path?utm_source=x");
    expect(nodes[2]?.textContent).toBe(" now.");
  });
});
