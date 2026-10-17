// Local preview of the website (pnpm site:dev): builds site/dist, rebuilds when a source
// changes, and serves it the way Vercel does with vercel.json: extension-less URLs, no
// trailing slash, 404.html for missing paths, and the global headers so CSP problems show
// up locally.
import { createReadStream, existsSync, readFileSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { buildSite, dist, root } from "./build.mjs";

const port = Number(process.env.PORT ?? 4320);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

let building = build();

function build() {
  const started = performance.now();
  return buildSite().then(
    (files) => console.log(`built ${files.length} files in ${Math.round(performance.now() - started)} ms`),
    (err) => console.error(err),
  );
}

const WATCHED = ["site/src", "site/og", "src/shared", "src/ui", "store/screenshots", "public", "PRIVACY.md", "package.json"];
let timer;
for (const rel of WATCHED) {
  const path = join(root, rel);
  watch(path, { recursive: statSync(path).isDirectory() }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => (building = build()), 150);
  });
}

/** Headers vercel.json sets on every path, read fresh because a build can rewrite it. */
function globalHeaders() {
  const file = join(root, "vercel.json");
  if (!existsSync(file)) return {};
  const block = JSON.parse(readFileSync(file, "utf8")).headers.find((h) => h.source === "/(.*)" && !h.has);
  return Object.fromEntries((block?.headers ?? []).map((h) => [h.key, h.value]));
}

const isFile = (path) => path.startsWith(dist) && existsSync(path) && statSync(path).isFile();

/** Maps a URL path to a file, a redirect or the 404 page, with cleanUrls and trailingSlash: false. */
function route(pathname) {
  if (pathname !== "/" && pathname.endsWith("/")) return { redirect: pathname.slice(0, -1) };
  if (pathname.endsWith("/index.html")) return { redirect: pathname.slice(0, -"/index.html".length) || "/" };
  if (pathname.endsWith(".html")) return { redirect: pathname.slice(0, -".html".length) };
  const local = join(dist, pathname);
  if (isFile(local)) return { file: local };
  if (isFile(`${local}.html`)) return { file: `${local}.html` };
  if (isFile(join(local, "index.html"))) return { file: join(local, "index.html") };
  const page = join(dist, "404.html");
  return isFile(page) ? { file: page, status: 404 } : { status: 404 };
}

createServer(async (req, res) => {
  await building;
  const { pathname } = new URL(req.url ?? "/", "http://localhost");
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }
  const hit = route(decoded);
  if (hit.redirect) {
    res.writeHead(308, { location: hit.redirect }).end();
    return;
  }
  if (!hit.file) {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }
  res.writeHead(hit.status ?? 200, {
    ...globalHeaders(),
    "content-type": TYPES[extname(hit.file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(hit.file).pipe(res);
}).listen(port, () => console.log(`site on http://localhost:${port}/`));
