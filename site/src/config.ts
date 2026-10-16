export const SITE_URL = "https://postsight.app";
export const DOMAIN = "postsight.app";
export const BRAND = "Postsight";

const REPO = "https://github.com/yusufky63/postsight";

export const LINKS = {
  repo: REPO,
  release: `${REPO}/releases/latest`,
  readmeInstall: `${REPO}#install`,
  changelog: `${REPO}/blob/main/CHANGELOG.md`,
  license: `${REPO}/blob/main/LICENSE`,
  privacySource: `${REPO}/blob/main/PRIVACY.md`,
  issues: `${REPO}/issues`,
  bugReport: `${REPO}/issues/new?template=bug_report.yml`,
  featureRequest: `${REPO}/issues/new?template=feature_request.yml`,
  securityReport: `${REPO}/security/advisories/new`,
  securityPolicy: `${REPO}/blob/main/SECURITY.md`,
} as const;

export type Lang = "en" | "tr";
export const LANGS: readonly Lang[] = ["en", "tr"];

/** Page ids. Every page exists in every language; English lives at the root, Turkish under /tr/. */
export type PageId = "home" | "privacy" | "support";
export const PAGES: readonly PageId[] = ["home", "privacy", "support"];

const PATHS: Record<PageId, string> = { home: "/", privacy: "/privacy", support: "/support" };

/** Public path, as Cloudflare Pages serves it: `privacy.html` answers at `/privacy`, `tr/index.html` at `/tr/`. */
export function pathOf(page: PageId, lang: Lang): string {
  const base = PATHS[page];
  if (lang === "en") return base;
  return base === "/" ? "/tr/" : `/tr${base}`;
}

/** Output file for a page inside the build directory. */
export function fileOf(page: PageId, lang: Lang): string {
  const prefix = lang === "en" ? "" : "tr/";
  return page === "home" ? `${prefix}index.html` : `${prefix}${page}.html`;
}

export function absolute(path: string): string {
  return `${SITE_URL}${path}`;
}

export const OG_LOCALE: Record<Lang, string> = { en: "en_US", tr: "tr_TR" };
export const LANG_NAME: Record<Lang, string> = { en: "English", tr: "Türkçe" };
