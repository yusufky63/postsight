# postsight.app

The public website for the Postsight extension: a landing page, the privacy policy and a support page, in English (`/`) and Turkish (`/tr/`). It is a static build with no runtime server, meant for Cloudflare Pages.

| URL | Built from |
|---|---|
| `/`, `/tr/` | `site/src/content.ts`; action names, tier names and model defaults come from `src/shared/locales/*.ts` and `src/shared/models.ts`, screenshots from `store/screenshots/` |
| `/privacy`, `/tr/privacy` | `PRIVACY.md`, rendered at build time with the extension's own Markdown parser. The Turkish page wraps the English policy with a short Turkish note. |
| `/support`, `/tr/support` | GitHub links in `site/src/config.ts`; the FAQ is `help.q1`..`help.q8` and `help.a1`..`help.a8` from the locale files |

Edit `PRIVACY.md`, the locales or the screenshots and the next build picks the change up. The build fails if `PRIVACY.md` loses its `# ` title.

## Commands

Run from the repository root.

| Command | What it does |
|---|---|
| `pnpm site:dev` | Builds into `site/dist`, rebuilds on change and serves it at http://localhost:4320 with Cloudflare's URL rules (`/privacy` serves `privacy.html`, nearest `404.html`) and the headers from `_headers` |
| `pnpm site:build` | Writes the static site to `site/dist` |
| `pnpm site:og` | Re-renders the share cards `site/og/og-en.png` and `site/og/og-tr.png` (1200 x 630) with a local Chrome or Edge, or the browser in `CHROME_PATH`. Run it after changing the card in `site/src/og.ts` and commit the PNGs; the build only copies them. |

`pnpm check` typechecks the site, runs its tests (`site/src/site.test.ts`) and builds it along with the extension.

## What the build writes

- One HTML file per page and language, plus `404.html` and `tr/404.html`. Every page has its title, description, canonical URL on https://postsight.app, `hreflang` alternates, Open Graph and Twitter tags with the 1200 x 630 card, and JSON-LD (`SoftwareApplication` on the home page, `FAQPage` on support).
- `assets/`: CSS, the theme toggle script, screenshots and share cards, named by content hash and cached for a year.
- `fonts/`: DM Sans, Space Grotesk and JetBrains Mono, the same files the extension bundles.
- `favicon.ico` and `icons/` from `public/icons`, `site.webmanifest`, `robots.txt`, `sitemap.xml`, `llms.txt`.
- `_headers`: a Content-Security-Policy that allows only same-origin files plus the inline theme script by hash, the other security headers, long caching for `assets/` and `fonts/`, and `noindex` on the `pages.dev` hostnames.

## Cloudflare Pages

Create a Pages project connected to `yusufky63/postsight` (Workers & Pages, Create, Pages, Connect to Git) with these settings:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Framework preset | None |
| Build command | `pnpm site:build` |
| Build output directory | `site/dist` |
| Root directory | (empty, the repository root) |
| Environment variables | `NODE_VERSION` = `24`, `PNPM_VERSION` = `9.15.4` (the versions CI uses) |

Pages installs dependencies with pnpm from `pnpm-lock.yaml` before the build. No `wrangler.toml` is needed for a Git-connected project; the settings above live in the dashboard. Optionally, set build watch paths to `site/*`, `PRIVACY.md`, `src/shared/*`, `src/ui/*`, `store/screenshots/*`, `public/*` and `package.json` so extension-only commits do not redeploy the site.

Once `postsight.app` is registered on Cloudflare, add it under the project's Custom domains, then add `www.postsight.app` and redirect it to the apex. The site needs no secrets or environment variables beyond the two versions above.

## Layout

| File | Role |
|---|---|
| `site/build.mjs` | Bundles `src/generate.ts` for Node with esbuild and runs it |
| `site/serve.mjs` | Local server with Cloudflare Pages routing |
| `site/og.mjs`, `site/browser.mjs` | Share card rendering over the DevTools protocol; one headless browser, removed with its temporary profile afterwards |
| `site/src/content.ts` | English and Turkish copy |
| `site/src/pages.ts`, `layout.ts` | Page bodies, the shared head, header and footer |
| `site/src/seo.ts` | Sitemap, robots, llms.txt, headers, manifest, JSON-LD |
| `site/src/site.css` | Layout; tokens and font faces come from `src/ui/tokens.css` and `src/ui/fonts.css` |
| `site/src/client.ts` | The light/dark toggle, the only script; without it the site follows the system theme |
