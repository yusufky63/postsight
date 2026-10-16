import { BRAND, DOMAIN, LANGS, LANG_NAME, LINKS, OG_LOCALE, absolute, pathOf } from "./config";
import type { Lang, PageId } from "./config";
import { COPY } from "./content";
import { html, jsonScript, raw } from "./html";
import type { Markup } from "./html";
import { THEME_BOOT } from "./theme";

/** Hashed asset URLs produced by the build. */
export type Assets = {
  css: string;
  js: string;
  og: Record<Lang, { url: string; width: number; height: number }>;
  fonts: string[];
  shots: Record<string, { url: string; width: number; height: number }>;
};

const svg = (paths: string, size = 16) =>
  raw(
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`,
  );

export const ICONS = {
  // Same lens-and-check drawing as the toolbar icon.
  mark: svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/><path d="M8 11.2l2 2 3.6-3.8"/>', 17),
  external: svg('<path d="M7 17 17 7"/><path d="M8 7h9v9"/>', 13),
  arrow: svg('<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', 15),
  download: svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>', 16),
  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>', 16),
  sun: svg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m17.7 6.3 1.4-1.4"/>',
    16,
  ),
};

/** Link that leaves the site: new tab, no referrer, and a visible arrow. */
export function externalLink(href: string, label: string | Markup): Markup {
  return html`<a href="${href}" target="_blank" rel="noreferrer noopener">${label}<span class="ext">${ICONS.external}</span></a>`;
}

export type PageSpec = {
  lang: Lang;
  /** Real pages carry hreflang alternates and a canonical URL; the 404 page has neither. */
  page: PageId | null;
  title: string;
  description: string;
  body: Markup;
  assets: Assets;
  jsonLd?: unknown[];
  noindex?: boolean;
};

function header(lang: Lang, page: PageId | null): Markup {
  const c = COPY[lang];
  const other: Lang = lang === "en" ? "tr" : "en";
  const home = pathOf("home", lang);
  const current = (id: PageId) => (page === id ? raw(' aria-current="page"') : "");
  return html`<header class="site-header">
  <div class="frame bar">
    <a class="brand" href="${home}"><span class="mark">${ICONS.mark}</span><span class="wordmark display">${BRAND}</span></a>
    <nav class="nav" aria-label="${c.nav.main}">
      <a href="${home}#features">${c.nav.features}</a>
      <a href="${home}#install">${c.nav.install}</a>
      <a href="${pathOf("privacy", lang)}"${current("privacy")}>${c.nav.privacy}</a>
      <a href="${pathOf("support", lang)}"${current("support")}>${c.nav.support}</a>
    </nav>
    <div class="tools">
      <a class="lang-switch" href="${pathOf(page ?? "home", other)}" hreflang="${other}" lang="${other}" aria-label="${c.nav.otherLangName}">${c.nav.otherLang}</a>
      <button class="icon-btn theme-toggle" type="button" data-theme-toggle aria-label="${c.nav.theme}" aria-pressed="false"><span class="i-moon">${ICONS.moon}</span><span class="i-sun">${ICONS.sun}</span></button>
      <a class="btn btn-sm btn-primary header-cta" href="${LINKS.release}">${ICONS.download}${c.nav.download}</a>
    </div>
  </div>
</header>`;
}

function footer(lang: Lang, page: PageId | null, version: string): Markup {
  const c = COPY[lang];
  const f = c.footer;
  const home = pathOf("home", lang);
  const groups: { title: string; items: Markup[] }[] = [
    {
      title: f.product,
      items: [
        html`<a href="${home}#features">${c.nav.features}</a>`,
        html`<a href="${home}#install">${c.nav.install}</a>`,
        externalLink(LINKS.release, f.release),
      ],
    },
    {
      title: f.help,
      items: [
        html`<a href="${pathOf("support", lang)}">${c.nav.support}</a>`,
        html`<a href="${pathOf("privacy", lang)}">${f.privacyPolicy}</a>`,
        externalLink(LINKS.bugReport, f.bug),
        externalLink(LINKS.securityReport, f.security),
      ],
    },
    {
      title: f.project,
      items: [externalLink(LINKS.repo, f.source), externalLink(LINKS.changelog, f.changelog), externalLink(LINKS.license, f.license)],
    },
  ];
  const languages = LANGS.map((l) =>
    l === lang
      ? html`<span lang="${l}" aria-current="true">${LANG_NAME[l]}</span>`
      : html`<a href="${pathOf(page ?? "home", l)}" hreflang="${l}" lang="${l}">${LANG_NAME[l]}</a>`,
  );
  return html`<footer class="site-footer">
  <div class="frame footer-grid">
    <div class="footer-brand">
      <a class="brand" href="${home}"><span class="mark">${ICONS.mark}</span><span class="wordmark display">${BRAND}</span></a>
      <p class="mono small domain">${DOMAIN}</p>
      <p class="small secondary">${f.tagline}</p>
    </div>
    ${groups.map(
      (g) => html`<div class="footer-col">
      <h2 class="label">${g.title}</h2>
      <ul>${g.items.map((item) => html`<li>${item}</li>`)}</ul>
    </div>`,
    )}
  </div>
  <div class="frame footer-base">
    <p class="xs muted">${f.notAffiliated}</p>
    <p class="xs muted mono"><span>v${version}</span><span class="sep" aria-hidden="true">/</span><span class="footer-langs" aria-label="${f.language}">${languages}</span></p>
  </div>
</footer>`;
}

export function renderPage(spec: PageSpec, version: string): string {
  const { lang, page, assets } = spec;
  const c = COPY[lang];
  const canonical = page ? absolute(pathOf(page, lang)) : null;
  const og = assets.og[lang];
  const alternates = page
    ? html`${LANGS.map((l) => html`<link rel="alternate" hreflang="${l}" href="${absolute(pathOf(page, l))}">
`)}<link rel="alternate" hreflang="x-default" href="${absolute(pathOf(page, "en"))}">
`
    : "";
  const ogLocaleAlt = LANGS.filter((l) => l !== lang).map((l) => html`<meta property="og:locale:alternate" content="${OG_LOCALE[l]}">
`);
  const doc = html`<!doctype html>
<html lang="${lang}" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${spec.title}</title>
<meta name="description" content="${spec.description}">
${spec.noindex ? raw('<meta name="robots" content="noindex">\n') : ""}${canonical ? html`<link rel="canonical" href="${canonical}">
` : ""}${alternates}<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0b0d">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png">
<link rel="apple-touch-icon" href="/icons/icon-128.png">
<link rel="manifest" href="/site.webmanifest">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:locale" content="${OG_LOCALE[lang]}">
${ogLocaleAlt}${canonical ? html`<meta property="og:url" content="${canonical}">
` : ""}<meta property="og:title" content="${spec.title}">
<meta property="og:description" content="${spec.description}">
<meta property="og:image" content="${absolute(og.url)}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="${og.width}">
<meta property="og:image:height" content="${og.height}">
<meta property="og:image:alt" content="${c.meta.ogAlt}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${spec.title}">
<meta name="twitter:description" content="${spec.description}">
<meta name="twitter:image" content="${absolute(og.url)}">
<meta name="twitter:image:alt" content="${c.meta.ogAlt}">
<script>${raw(THEME_BOOT)}</script>
${assets.fonts.map((href) => html`<link rel="preload" href="${href}" as="font" type="font/woff2" crossorigin>
`)}<link rel="stylesheet" href="${assets.css}">
<script src="${assets.js}" defer></script>
${(spec.jsonLd ?? []).map((data) => html`<script type="application/ld+json">${jsonScript(data)}</script>
`)}</head>
<body>
<a class="skip-link" href="#main">${c.nav.skip}</a>
${header(lang, page)}
<main id="main">
${spec.body}
</main>
${footer(lang, page, version)}
</body>
</html>
`;
  return doc.value;
}
