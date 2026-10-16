/**
 * Writes the whole static site into one directory. Everything a page shows is read from the
 * repo at build time: PRIVACY.md, the extension's locales, models and languages, the
 * version in package.json and the store screenshots.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as esbuild from "esbuild";
import { BRAND, LANGS, fileOf } from "./config";
import type { Lang, PageId } from "./config";
import { COPY } from "./content";
import { FONTS } from "./fonts";
import { renderPage } from "./layout";
import type { Assets } from "./layout";
import { renderPolicy } from "./markdown";
import { homePage, notFoundPage, privacyPage, supportPage } from "./pages";
import type { SiteData } from "./pages";
import { faqJsonLd, headers, homeJsonLd, llms, robots, sitemap, webManifest } from "./seo";
import { THEME_BOOT } from "./theme";

/** Fonts every page needs above the fold: body and headings in the Latin subset. */
const PRELOAD_FONTS = ["/fonts/dm-sans-latin.woff2", "/fonts/space-grotesk-latin.woff2"];

export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.toString("ascii", 1, 4) !== "PNG") throw new Error("not a PNG file");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** A .ico that wraps PNG images, which every current browser reads. */
export function icoFromPngs(pngs: Buffer[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map((png) => {
    const { width, height } = pngSize(png);
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width >= 256 ? 0 : width, 0);
    entry.writeUInt8(height >= 256 ? 0 : height, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs]);
}

function cspHash(script: string): string {
  return `sha256-${createHash("sha256").update(script, "utf8").digest("base64")}`;
}

export async function generate(root: string, out: string): Promise<string[]> {
  const written: string[] = [];
  const write = (rel: string, content: string | Buffer) => {
    const file = join(out, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    written.push(rel);
  };
  /** Content-hashed name under /assets/, so it can be cached forever. */
  const asset = (name: string, ext: string, content: string | Buffer) => {
    const hash = createHash("sha256").update(content).digest("hex").slice(0, 10);
    const rel = `assets/${name}.${hash}.${ext}`;
    write(rel, content);
    return `/${rel}`;
  };
  const read = (rel: string) => readFileSync(join(root, rel));
  const readText = (rel: string) => readFileSync(join(root, rel), "utf8");

  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const pkg = JSON.parse(readText("package.json")) as { version: string };
  const manifest = JSON.parse(readText("public/manifest.json")) as { minimum_chrome_version?: string };
  if (!manifest.minimum_chrome_version) throw new Error("public/manifest.json has no minimum_chrome_version");

  for (const [from, to] of FONTS) write(`fonts/${to}`, read(join("node_modules", from)));

  // Same tokens and font faces as the extension's own pages, plus the site layout.
  const fontsCss = readText("src/ui/fonts.css").replace(/url\("fonts\//g, 'url("/fonts/');
  const css = [fontsCss, readText("src/ui/tokens.css"), readText("site/src/site.css")].join("\n");
  const cssMin = await esbuild.transform(css, { loader: "css", minify: true, target: ["chrome109", "edge109", "firefox115", "safari15"] });

  const client = await esbuild.build({
    entryPoints: [join(root, "site/src/client.ts")],
    bundle: true,
    format: "iife",
    target: "es2020",
    minify: true,
    write: false,
    legalComments: "none",
    logLevel: "silent",
  });
  const clientJs = client.outputFiles[0]?.text;
  if (!clientJs) throw new Error("client bundle is empty");

  const shots: Assets["shots"] = {};
  const shotDir = join(root, "store/screenshots");
  for (const file of readdirSync(shotDir).filter((f) => f.endsWith(".png"))) {
    const png = readFileSync(join(shotDir, file));
    const name = file.replace(/\.png$/, "");
    shots[name] = { url: asset(name, "png", png), ...pngSize(png) };
  }

  const og = {} as Assets["og"];
  for (const lang of LANGS) {
    const rel = `site/og/og-${lang}.png`;
    if (!existsSync(join(root, rel))) throw new Error(`${rel} is missing; run pnpm site:og`);
    const png = read(rel);
    og[lang] = { url: asset(`og-${lang}`, "png", png), ...pngSize(png) };
  }

  const assets: Assets = {
    css: asset("site", "css", cssMin.code),
    js: asset("site", "js", clientJs),
    og,
    fonts: PRELOAD_FONTS,
    shots,
  };

  for (const size of [16, 32, 48, 128]) write(`icons/icon-${size}.png`, read(`public/icons/icon-${size}.png`));
  write("favicon.ico", icoFromPngs([read("public/icons/icon-16.png"), read("public/icons/icon-32.png")]));

  const policy = renderPolicy(readText("PRIVACY.md"));
  const data: SiteData = { version: pkg.version, minChrome: manifest.minimum_chrome_version, policy, assets };

  for (const lang of LANGS) {
    const c = COPY[lang];
    const pages: Record<PageId, { title: string; description: string; body: ReturnType<typeof homePage>; jsonLd?: unknown[] }> = {
      home: { title: c.meta.homeTitle, description: c.meta.homeDescription, body: homePage(lang, data), jsonLd: homeJsonLd(lang, pkg.version) },
      privacy: {
        title: `${c.privacyPage.title ?? policy.title} · ${BRAND}`,
        description: c.meta.privacyDescription,
        body: privacyPage(lang, data),
      },
      support: {
        title: `${c.meta.supportTitle} · ${BRAND}`,
        description: c.meta.supportDescription,
        body: supportPage(lang),
        jsonLd: [faqJsonLd(lang)],
      },
    };
    for (const [page, spec] of Object.entries(pages) as [PageId, (typeof pages)[PageId]][]) {
      write(fileOf(page, lang), renderPage({ lang, page, assets, ...spec }, pkg.version));
    }
    write(
      notFoundFile(lang),
      renderPage(
        { lang, page: null, assets, title: `${c.meta.notFoundTitle} · ${BRAND}`, description: c.notFound.lead, body: notFoundPage(lang), noindex: true },
        pkg.version,
      ),
    );
  }

  write("sitemap.xml", sitemap({ privacy: policy.updated ?? undefined }));
  write("robots.txt", robots());
  write("llms.txt", llms(pkg.version));
  write("site.webmanifest", webManifest());
  write("_headers", headers([cspHash(THEME_BOOT)]));
  return written;
}

/** Cloudflare Pages serves the nearest 404.html, so each language gets its own. */
function notFoundFile(lang: Lang): string {
  return lang === "en" ? "404.html" : `${lang}/404.html`;
}
