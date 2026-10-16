import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const FONTS = [
  ["@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2", "dm-sans-latin.woff2"],
  ["@fontsource-variable/dm-sans/files/dm-sans-latin-ext-wght-normal.woff2", "dm-sans-latin-ext.woff2"],
  ["@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2", "space-grotesk-latin.woff2"],
  ["@fontsource-variable/space-grotesk/files/space-grotesk-latin-ext-wght-normal.woff2", "space-grotesk-latin-ext.woff2"],
  ["@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2", "jetbrains-mono-latin.woff2"],
  ["@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2", "jetbrains-mono-latin-ext.woff2"],
];

function copyStatic() {
  mkdirSync(join(dist, "fonts"), { recursive: true });
  cpSync(join(root, "public"), dist, { recursive: true });
  for (const [from, to] of FONTS) cpSync(join(root, "node_modules", from), join(dist, "fonts", to));
  for (const file of ["popup/popup.html", "options/options.html"]) {
    cpSync(join(root, "src", file), join(dist, file.split("/")[1]));
  }
  // The pages share one stylesheet so tokens stay in a single place.
  const css = ["ui/fonts.css", "ui/tokens.css", "ui/pages.css"].map((f) => readFileSync(join(root, "src", f), "utf8"));
  writeFileSync(join(dist, "pages.css"), css.join("\n"));
  // Keep the manifest version in lockstep with package.json.
  const manifestPath = join(dist, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = pkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

const common = {
  bundle: true,
  target: "chrome116",
  legalComments: "none",
  logLevel: "info",
  loader: { ".css": "text" },
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: { __SIFT_VERSION__: JSON.stringify(pkg.version) },
};

const builds = [
  { entryPoints: [join(root, "src/background/index.ts")], outfile: join(dist, "background.js"), format: "esm" },
  { entryPoints: [join(root, "src/content/index.ts")], outfile: join(dist, "content.js"), format: "iife" },
  { entryPoints: [join(root, "src/popup/popup.ts")], outfile: join(dist, "popup.js"), format: "iife" },
  { entryPoints: [join(root, "src/options/options.ts")], outfile: join(dist, "options.js"), format: "iife" },
];

rmSync(dist, { recursive: true, force: true });
copyStatic();

if (watch) {
  for (const b of builds) {
    const ctx = await esbuild.context({ ...common, ...b });
    await ctx.watch();
  }
  console.log("watching src/ ...");
} else {
  await Promise.all(builds.map((b) => esbuild.build({ ...common, ...b })));
}
