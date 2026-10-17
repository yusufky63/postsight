import { describe, expect, it } from "vitest";
import { formatAge, formatCompactUsd, formatEth, formatMonthYear, formatPrice, formatTokens, isUrlText, shortUrl } from "./format";
import { parseInline } from "./markdown";

const LONG =
  "https://example.com/el-gr/recipes/%CF%83%CF%85%CE%BD%CF%84%CE%B1%CE%B3%CE%AE-%CE%B3%CE%B9%CE%B1-%CF%83%CF%80%CE%B1%CE%BD%CE%B1%CE%BA%CF%8C%CF%80%CE%B9%CF%84%CE%B1-%CE%BC%CE%B5-%CF%86%CF%81%CE%AD%CF%83%CE%BA%CE%BF-%CF%83%CF%80%CE%B1%CE%BD%CE%AC%CE%BA%CE%B9-%CE%BA%CE%B1%CE%B9-%CF%86%CE%AD%CF%84%CE%B1-%CF%83%CF%84%CE%BF%CE%BD-%CF%86%CE%BF%CF%8D%CF%81%CE%BD%CE%BF/r-AA2ej0J2?ocid=newsletter&pc=U531&cvid=6ad0647a45b747358f747590950bea6a";

describe("shortUrl", () => {
  it("decodes, drops scheme and query, and cuts long addresses", () => {
    const short = shortUrl(LONG);
    expect(short.startsWith("example.com/el-gr/recipes/συνταγή-για-σπανακόπιτα")).toBe(true);
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
    expect(isUrlText("example.com/el-gr/recipes")).toBe(true);
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
    expect(link.href).toContain("ocid=newsletter");
    expect(link.children).toEqual([{ type: "text", text: shortUrl(LONG) }]);
  });

  it("shortens a markdown label that is itself an address", () => {
    const [link] = parseInline(`[${LONG}](${LONG})`);
    expect(link?.type === "link" && link.children).toEqual([{ type: "text", text: shortUrl(LONG) }]);
  });
});

describe("wallet card numbers", () => {
  it("keeps tiny token prices readable", () => {
    expect(formatPrice(0.000003969, "en")).toBe("$0.00000397");
    expect(formatPrice(1.5, "en")).toBe("$1.50");
    expect(formatPrice(0.25, "en")).toBe("$0.25");
  });

  it("shortens large amounts and ether", () => {
    expect(formatCompactUsd(28_883_227, "en")).toBe("$28.9M");
    // Turkish keeps its decimal comma but writes K/M/B, as crypto sites do.
    expect(formatCompactUsd(1_700_000_000, "tr")).toBe("$1,7B");
    expect(formatCompactUsd(31_700_000, "tr")).toBe("$31,7M");
    expect(formatTokens(595_128, "tr")).toBe("595,1K");
    expect(formatTokens(999_960, "tr")).toBe("1M");
    expect(formatTokens(820, "tr")).toBe("820");
    expect(formatTokens(595_128, "de")).toBe("595.128");
    expect(formatEth(5.76972533, false, "en")).toBe("5.7697 ETH");
    expect(formatEth(1234.56, false, "en")).toBe("1,234.6 ETH");
    expect(formatEth(0, true, "en")).toBe("<0.0001 ETH");
  });

  it("says how long ago a token was listed", () => {
    const now = Date.UTC(2026, 9, 16);
    expect(formatAge(now - 3 * 365 * 86_400_000, "en", now)).toBe("3 years ago");
    expect(formatAge(now - 2 * 86_400_000, "en", now)).toBe("2 days ago");
    expect(formatAge(now - 3 * 3_600_000, "en", now)).toBe("3 hours ago");
    expect(formatMonthYear(Date.UTC(2017, 2, 15), "en")).toBe("Mar 2017");
  });
});
