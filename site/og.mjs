// Renders the 1200x630 share cards to site/og/og-<lang>.png (pnpm site:og). Run it after
// changing the card copy or layout and commit the PNGs; the site build only copies them,
// so the Vercel build never needs a browser. Needs a local Chrome or Edge, or CHROME_PATH.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { withBrowser } from "./browser.mjs";
import { importTs, root } from "./build.mjs";

const { FONTS, OG_SIZE, ogCardHtml } = await importTs("site/src/og.ts");
const out = join(root, "site", "og");
mkdirSync(out, { recursive: true });

const work = mkdtempSync(join(root, "node_modules", ".cache", "postsight-og-"));
try {
  mkdirSync(join(work, "fonts"));
  for (const [from, to] of FONTS) copyFileSync(join(root, "node_modules", from), join(work, "fonts", to));
  const fontCss = readFileSync(join(root, "src/ui/fonts.css"), "utf8");

  await withBrowser(async (page) => {
    for (const lang of ["en", "tr"]) {
      const file = join(work, `og-${lang}.html`);
      writeFileSync(file, ogCardHtml(lang, fontCss));
      await page.open({ url: pathToFileURL(file).href, width: OG_SIZE.width, height: OG_SIZE.height });
      await page.screenshot(join(out, `og-${lang}.png`));
      console.log(`site/og/og-${lang}.png`);
    }
  });
} finally {
  rmSync(work, { recursive: true, force: true });
}
