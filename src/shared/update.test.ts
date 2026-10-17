import { describe, expect, it } from "vitest";
import { checkIsStale, CHECK_EVERY_MS, compareVersions, installSource, isNewer, parseRelease, RETRY_AFTER_MS } from "./update";

describe("compareVersions", () => {
  it("compares each part as a number", () => {
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
    expect(compareVersions("1.1.0", "1.1.1")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
  });

  it("only calls a strictly higher version newer", () => {
    expect(isNewer("1.1.0", "1.2.0")).toBe(true);
    expect(isNewer("1.1.0", "1.1.0")).toBe(false);
    expect(isNewer("1.2.0", "1.1.0")).toBe(false);
    expect(isNewer("1.1.0", undefined)).toBe(false);
  });
});

describe("parseRelease", () => {
  it("reads the tag and the release page", () => {
    expect(parseRelease({ tag_name: "v1.2.0", html_url: "https://github.com/yusufky63/postsight/releases/tag/v1.2.0" })).toEqual({
      version: "1.2.0",
      url: "https://github.com/yusufky63/postsight/releases/tag/v1.2.0",
    });
    expect(parseRelease({ tag_name: "1.2" })?.version).toBe("1.2");
  });

  it("never links outside this repo's releases", () => {
    expect(parseRelease({ tag_name: "v1.2.0", html_url: "https://evil.example/download" })?.url).toBe("https://github.com/yusufky63/postsight/releases/latest");
  });

  it("ignores drafts, pre-releases and tags that are not versions", () => {
    expect(parseRelease({ tag_name: "v1.2.0", prerelease: true })).toBeNull();
    expect(parseRelease({ tag_name: "v1.2.0", draft: true })).toBeNull();
    expect(parseRelease({ tag_name: "nightly" })).toBeNull();
    expect(parseRelease({ tag_name: "v1.2.0-beta.1" })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ message: "Not Found" })).toBeNull();
  });
});

describe("checkIsStale", () => {
  const now = 10 * CHECK_EVERY_MS;
  it("asks once a day, and again within the hour after a failure", () => {
    expect(checkIsStale(undefined, now)).toBe(true);
    expect(checkIsStale({ checkedAt: now - CHECK_EVERY_MS + 1000 }, now)).toBe(false);
    expect(checkIsStale({ checkedAt: now - CHECK_EVERY_MS }, now)).toBe(true);
    expect(checkIsStale({ checkedAt: now - RETRY_AFTER_MS + 1000, failed: true }, now)).toBe(false);
    expect(checkIsStale({ checkedAt: now - RETRY_AFTER_MS, failed: true }, now)).toBe(true);
  });
});

describe("installSource", () => {
  it("treats store and policy installs as self-updating", () => {
    expect(installSource("normal")).toBe("store");
    expect(installSource("admin")).toBe("store");
    expect(installSource("development")).toBe("github");
    expect(installSource("sideload")).toBe("github");
    expect(installSource(undefined)).toBe("github");
  });
});
