import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileOf, pathOf } from "./config";
import { generate, icoFromPngs, pngSize } from "./generate";
import { html, raw } from "./html";
import { md, renderPolicy } from "./markdown";
import { THEME_BOOT } from "./theme";

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("html", () => {
  it("escapes interpolated text but keeps trusted markup", () => {
    const name = `<script>alert("x")</script>`;
    expect(html`<p>${name}${raw("<br>")}</p>`.value).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br></p>");
  });

  it("renders inline Markdown in copy without passing HTML through", () => {
    expect(md("Press **Save** in `chrome://extensions` <b>now</b>").value).toBe(
      "Press <strong>Save</strong> in <code>chrome://extensions</code> &lt;b&gt;now&lt;/b&gt;",
    );
    expect(md("[x](javascript:alert(1))").value).not.toContain("href");
  });
});

describe("renderPolicy", () => {
  const policy = renderPolicy(readFileSync(join(root, "PRIVACY.md"), "utf8"));

  it("takes the title and date out of PRIVACY.md", () => {
    expect(policy.title).toBe("Privacy policy");
    expect(policy.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(policy.body.value).not.toContain("Last updated");
  });

  it("keeps every section, with anchors for the table of contents", () => {
    expect(policy.sections.map((s) => s.id)).toEqual([
      "what-postsight-stores",
      "what-is-sent-and-to-whom",
      "pages-postsight-fetches",
      "wallet-cards-optional",
      "what-postsight-does-not-do",
      "contact",
    ]);
    for (const s of policy.sections) expect(policy.body.value).toContain(`id="${s.id}"`);
    expect(policy.body.value).toContain('<a href="https://github.com/yusufky63/postsight/issues"');
  });
});

describe("paths", () => {
  it("match how Cloudflare Pages serves the files", () => {
    expect([pathOf("home", "en"), fileOf("home", "en")]).toEqual(["/", "index.html"]);
    expect([pathOf("privacy", "en"), fileOf("privacy", "en")]).toEqual(["/privacy", "privacy.html"]);
    expect([pathOf("home", "tr"), fileOf("home", "tr")]).toEqual(["/tr/", "tr/index.html"]);
    expect([pathOf("support", "tr"), fileOf("support", "tr")]).toEqual(["/tr/support", "tr/support.html"]);
  });
});

describe("icoFromPngs", () => {
  it("wraps the PNG icons in an icon directory", () => {
    const png = readFileSync(join(root, "public/icons/icon-32.png"));
    const ico = icoFromPngs([png]);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico[6]).toBe(pngSize(png).width);
    expect(ico.readUInt32LE(18)).toBe(22);
    expect(ico.subarray(22).equals(png)).toBe(true);
  });
});

describe("generate", () => {
  let out: string;
  const read = (rel: string) => readFileSync(join(out, rel), "utf8");
  const pages = ["index.html", "privacy.html", "support.html", "tr/index.html", "tr/privacy.html", "tr/support.html"];

  beforeAll(async () => {
    out = mkdtempSync(join(tmpdir(), "postsight-site-test-"));
    await generate(root, out);
  }, 30000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("writes every page, a 404 per language and the crawler files", () => {
    for (const rel of [...pages, "404.html", "tr/404.html", "robots.txt", "sitemap.xml", "llms.txt", "_headers", "favicon.ico", "site.webmanifest"]) {
      expect(existsSync(join(out, rel)), rel).toBe(true);
    }
  });

  it("gives each page a canonical URL, language alternates and an absolute share image", () => {
    for (const rel of pages) {
      const page = read(rel);
      expect(page, rel).toMatch(/<link rel="canonical" href="https:\/\/postsight\.app\/[^"]*">/);
      expect(page, rel).toContain('hreflang="tr"');
      expect(page, rel).toContain('hreflang="x-default"');
      expect(page, rel).toMatch(/<meta property="og:image" content="https:\/\/postsight\.app\/assets\/og-(en|tr)\.[0-9a-f]{10}\.png">/);
      expect(page, rel).not.toMatch(/undefined|\[object Object\]/);
    }
    expect(read("privacy.html")).toContain('<link rel="canonical" href="https://postsight.app/privacy">');
    expect(read("tr/index.html")).toContain('<html lang="tr"');
    expect(read("404.html")).toContain('<meta name="robots" content="noindex">');
  });

  it("only links to files that exist", () => {
    for (const rel of [...pages, "404.html", "tr/404.html"]) {
      for (const [, href] of read(rel).matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
        const path = href ?? "";
        const candidates = path.endsWith("/") ? [`${path}index.html`] : [path, `${path}.html`];
        expect(
          candidates.some((c) => existsSync(join(out, c))),
          `${rel} -> ${path}`,
        ).toBe(true);
      }
    }
  });

  it("allows the inline theme script by its hash and nothing else inline", () => {
    const hash = createHash("sha256").update(THEME_BOOT).digest("base64");
    expect(read("_headers")).toContain(`'sha256-${hash}'`);
    for (const rel of pages) {
      const inline = [...read(rel).matchAll(/<script(?![^>]*(?:\ssrc=|type="application\/ld\+json"))[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
      expect(inline).toEqual([THEME_BOOT]);
    }
  });

  it("lists every page in both languages in the sitemap", () => {
    const sitemap = read("sitemap.xml");
    for (const path of ["/", "/privacy", "/support", "/tr/", "/tr/privacy", "/tr/support"]) {
      expect(sitemap).toContain(`<loc>https://postsight.app${path}</loc>`);
    }
  });
});
