// Builds the website into site/dist (pnpm site:build). The generator is TypeScript, so
// esbuild bundles it for Node first and the bundle is imported and run here.
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const dist = join(root, "site", "dist");

// Inside node_modules so the bundle's bare imports (esbuild) resolve from the repo.
const cache = join(root, "node_modules", ".cache", "postsight-site");
let builds = 0;

/** Bundles a TypeScript entry for Node and imports it; each call loads fresh code. */
export async function importTs(entry) {
  mkdirSync(cache, { recursive: true });
  const outfile = join(cache, `${process.pid}-${Date.now()}-${builds++}.mjs`);
  try {
    await esbuild.build({
      entryPoints: [join(root, entry)],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      packages: "external",
      logLevel: "warning",
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    rmSync(outfile, { force: true });
  }
}

export async function buildSite() {
  const { generate } = await importTs("site/src/generate.ts");
  return generate(root, dist);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const started = performance.now();
  const files = await buildSite();
  console.log(`site: ${files.length} files in site/dist (${Math.round(performance.now() - started)} ms)`);
}
