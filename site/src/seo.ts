import { LANGUAGES } from "../../src/shared/languages";
import { BRAND, LANGS, LINKS, PAGES, SITE_URL, absolute, pathOf } from "./config";
import type { Lang, PageId } from "./config";
import { COPY, faq } from "./content";

export function sitemap(lastmod: Partial<Record<PageId, string>>): string {
  const urls = PAGES.flatMap((page) =>
    LANGS.map((lang) => {
      const alternates = LANGS.map(
        (l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${absolute(pathOf(page, l))}"/>`,
      ).join("\n");
      const date = lastmod[page];
      return [
        "  <url>",
        `    <loc>${absolute(pathOf(page, lang))}</loc>`,
        ...(date ? [`    <lastmod>${date}</lastmod>`] : []),
        alternates,
        `    <xhtml:link rel="alternate" hreflang="x-default" href="${absolute(pathOf(page, "en"))}"/>`,
        "  </url>",
      ].join("\n");
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join("\n")}
</urlset>
`;
}

export function robots(): string {
  return `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

/** Plain-text summary for language models, following llmstxt.org. */
export function llms(version: string): string {
  const c = COPY.en;
  return `# ${BRAND}

> ${c.meta.homeDescription}

${BRAND} is a free, open-source (MIT) Manifest V3 extension for Chrome and Edge. It adds a violet AI badge to every post on x.com with these actions: Verify (fact-check with sources from live web search), Research, Summarize, Translate, Explain, Reply ideas (drafts to copy; it never posts) and Ask, plus Copy. It uses the user's own API key for Claude (Anthropic), OpenAI or DeepSeek; Auto mode routes light jobs to cheap models and fact-checks to stronger models with web search. Every result shows tokens, cost and time, with monthly budgets per provider. It reads X Articles and, with permission, the pages a post links to. Keys stay in the browser's extension storage; there is no ${BRAND} server, account, analytics or tracking. Interface and answers are available in ${LANGUAGES.length} languages: ${LANGUAGES.map((l) => l.english).join(", ")}. Current version: ${version}.

## Pages

- [Home](${absolute(pathOf("home", "en"))}): what ${BRAND} does, how Auto picks a model, privacy summary and install steps
- [Privacy policy](${absolute(pathOf("privacy", "en"))}): what is stored, what is sent and to whom, what ${BRAND} never does
- [Support](${absolute(pathOf("support", "en"))}): where to report bugs and vulnerabilities, and answers to common questions
- [Turkish version](${absolute(pathOf("home", "tr"))})

## Source

- [GitHub repository](${LINKS.repo})
- [Latest release](${LINKS.release}): download the packaged extension
- [Install from source](${LINKS.readmeInstall})
- [Changelog](${LINKS.changelog})
- [Security policy](${LINKS.securityPolicy})
`;
}

/** Repo paths the site is built from; a commit that touches none of them skips the deploy. */
export const SITE_INPUTS = ["site", "PRIVACY.md", "src/shared", "src/ui", "store/screenshots", "public", "package.json", "pnpm-lock.yaml", "vercel.json"];

/**
 * vercel.json for the site. The CSP allows only same-origin files plus the inline theme
 * script by hash. The vercel.app hostnames duplicate the site's own domain, so they stay
 * out of search results. Vercel reads the file before it builds, so the build writes it to
 * the repo root and a test fails when the committed copy is stale.
 */
export function vercelConfig(scriptHashes: string[]): string {
  const csp = [
    "default-src 'self'",
    `script-src 'self' ${scriptHashes.map((h) => `'${h}'`).join(" ")}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
  const config = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    installCommand: "pnpm install --frozen-lockfile",
    buildCommand: "pnpm site:build",
    outputDirectory: "site/dist",
    ignoreCommand: `git diff --quiet HEAD^ HEAD -- ${SITE_INPUTS.join(" ")}`,
    cleanUrls: true,
    trailingSlash: false,
    headers: [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
      { source: "/assets/(.*)", headers: immutable },
      { source: "/fonts/(.*)", headers: immutable },
      {
        source: "/(.*)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ],
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

export function webManifest(): string {
  return `${JSON.stringify(
    {
      name: BRAND,
      short_name: BRAND,
      description: COPY.en.meta.homeDescription,
      start_url: "/",
      display: "browser",
      background_color: "#ffffff",
      theme_color: "#5b4bff",
      icons: [16, 32, 48, 128].map((size) => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png" })),
    },
    null,
    2,
  )}\n`;
}

export function homeJsonLd(lang: Lang, version: string): unknown[] {
  const c = COPY[lang];
  const url = absolute(pathOf("home", lang));
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: BRAND,
      url: absolute("/"),
      inLanguage: LANGS,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: BRAND,
      url,
      description: c.meta.homeDescription,
      applicationCategory: "BrowserApplication",
      operatingSystem: "Google Chrome, Microsoft Edge",
      softwareVersion: version,
      downloadUrl: LINKS.release,
      license: "https://opensource.org/licenses/MIT",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      inLanguage: LANGUAGES.map((l) => l.locale),
    },
  ];
}

export function faqJsonLd(lang: Lang): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: lang,
    url: absolute(pathOf("support", lang)),
    mainEntity: faq(lang).map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
