// Static server for the UI harness: serves the repo root so harness pages can load
// dist/ bundles. Only for local visual checks. /wallet runs the extension's real
// wallet lookup here in Node, so wallet cards in the harness show live public data.
import { createReadStream, existsSync, mkdtempSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4317);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

let lookup;
async function walletLookup() {
  if (!lookup) {
    const store = new Map();
    globalThis.chrome = {
      storage: {
        local: {
          get: async (k) => (k === null ? Object.fromEntries(store) : { [k]: store.get(k) }),
          set: async (o) => Object.entries(o).forEach(([k, v]) => store.set(k, v)),
          remove: async (ks) => ks.forEach((k) => store.delete(k)),
        },
      },
    };
    const outfile = join(mkdtempSync(join(tmpdir(), "postsight-harness-")), "lookup.mjs");
    await esbuild.build({ entryPoints: [join(root, "src/background/wallet/lookup.ts")], bundle: true, format: "esm", platform: "node", outfile, define: { __POSTSIGHT_VERSION__: '"harness"' }, logLevel: "warning" });
    lookup = await import(pathToFileURL(outfile).href);
  }
  return lookup;
}

async function serveWallet(url, res) {
  const query = url.searchParams.get("query") ?? "";
  const { lookupWallet, validQuery } = await walletLookup();
  if (!validQuery(query)) return res.writeHead(400).end();
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);
  await lookupWallet(query, (card) => send({ type: "card", card }), controller.signal).catch(() => send({ type: "error", code: "unknown" }));
  res.end();
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/wallet") {
    void serveWallet(url, res);
    return;
  }
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  let file = join(root, path || "harness/x.html");
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end("not found");
    return;
  }
  if (statSync(file).isDirectory()) file = join(file, "index.html");
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`harness on http://localhost:${port}/harness/x.html`));
