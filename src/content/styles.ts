import css from "./content.css";

let sheet: CSSStyleSheet | null | undefined;

/**
 * Shares one constructed stylesheet across every shadow root. Constructed sheets
 * are not subject to the page's style-src policy; a <style> element is the fallback.
 */
export function adoptStyles(root: ShadowRoot): void {
  if (sheet === undefined) {
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
    } catch {
      sheet = null;
    }
  }
  if (sheet) {
    try {
      root.adoptedStyleSheets = [sheet];
      return;
    } catch {
      // Fall through to a style element.
    }
  }
  const style = document.createElement("style");
  style.textContent = css;
  root.appendChild(style);
}

const LATIN =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
  "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

/** Registers the bundled fonts under Postsight-only family names so X's own fonts are untouched. */
export function loadFonts(): void {
  const faces: [string, string][] = [
    ["Postsight Sans", "dm-sans"],
    ["Postsight Display", "space-grotesk"],
    ["Postsight Mono", "jetbrains-mono"],
  ];
  for (const [family, file] of faces) {
    for (const [suffix, range] of [
      ["latin", LATIN],
      ["latin-ext", LATIN_EXT],
    ] as const) {
      try {
        const url = chrome.runtime.getURL(`fonts/${file}-${suffix}.woff2`);
        document.fonts.add(new FontFace(family, `url("${url}") format("woff2")`, { weight: "100 900", unicodeRange: range, display: "swap" }));
      } catch {
        // The system font stack in content.css takes over.
      }
    }
  }
}
