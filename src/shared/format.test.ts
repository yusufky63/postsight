import { describe, expect, it } from "vitest";
import { isUrlText, shortUrl } from "./format";
import { parseInline } from "./markdown";

const LONG =
  "https://msn.com/el-gr/news/other/%CF%83%CE%BA%CE%B7%CE%BD%CE%AD%CF%82-%CF%87%CE%AC%CE%BF%CF%85%CF%82-%CF%83%CF%84%CE%B7%CE%BD-%CE%B1%CE%BB%CE%B2%CE%B1%CE%BD%CE%AF%CE%B1/ar-AA2ej0J2?ocid=msedgdhp&pc=U531&cvid=6ad0647a45b747358f747590950bea6a";

describe("shortUrl", () => {
  it("decodes, drops scheme and query, and cuts long addresses", () => {
    const short = shortUrl(LONG);
    expect(short.startsWith("msn.com/el-gr/news/other/σκηνές-χάους")).toBe(true);
    expect(short).not.toContain("%");
    expect(short).not.toContain("?");
    expect([...short].length).toBeLessThanOrEqual(60);
    expect(short.endsWith("…")).toBe(true);
  });

  it("leaves short addresses readable and whole", () => {
    expect(shortUrl("https://www.example.com/a/b/")).toBe("example.com/a/b");
    expect(shortUrl("github.com/owner/repo")).toBe("github.com/owner/repo");
  });

  it("survives malformed escapes", () => {
    expect(shortUrl("https://x.org/%E0%A4%A")).toBe("x.org/%E0%A4%A");
  });
});

describe("isUrlText", () => {
  it("tells addresses from mentions, hashtags and cashtags", () => {
    expect(isUrlText("msn.com/el-gr/news")).toBe(true);
    expect(isUrlText("https://github.com/owner/repo")).toBe(true);
    expect(isUrlText("@someone")).toBe(false);
    expect(isUrlText("#news")).toBe(false);
    expect(isUrlText("$BTC")).toBe(false);
    expect(isUrlText("hello world")).toBe(false);
  });
});

describe("links in answers", () => {
  it("shows a long link short but keeps the full address as the target", () => {
    const [link] = parseInline(LONG);
    expect(link?.type).toBe("link");
    if (link?.type !== "link") return;
    expect(link.href).toContain("ocid=msedgdhp");
    expect(link.children).toEqual([{ type: "text", text: shortUrl(LONG) }]);
  });

  it("shortens a markdown label that is itself an address", () => {
    const [link] = parseInline(`[${LONG}](${LONG})`);
    expect(link?.type === "link" && link.children).toEqual([{ type: "text", text: shortUrl(LONG) }]);
  });
});
