/**
 * The 1200x630 share card, as a standalone HTML page that site/og.mjs screenshots. Light
 * theme only: link previews are shown on many backgrounds and a white card reads on all.
 */
import { BRAND, DOMAIN } from "./config";
import type { Lang } from "./config";
import { COPY } from "./content";
import { html, raw } from "./html";
import { ICONS } from "./layout";

export { FONTS } from "./fonts";

export const OG_SIZE = { width: 1200, height: 630 } as const;

// Light tokens from src/ui/tokens.css, as plain values for a page that loads no stylesheet.
const C = {
  canvas: "#ffffff",
  surface: "#f8f9fb",
  border: "#dee1e7",
  ink: "#0a0b0d",
  secondary: "#5b616e",
  muted: "#687080",
  primary: "#5b4bff",
};

/**
 * `fontCss` is src/ui/fonts.css with its URLs pointing at the font files; `shot` is the
 * verify screenshot as a data or file URL, cropped to its result card.
 */
export function ogCardHtml(lang: Lang, fontCss: string, shot: string): string {
  const c = COPY[lang];
  const chips = ["Claude", "OpenAI", "DeepSeek", c.hero.facts[c.hero.facts.length - 1] ?? ""];
  const page = html`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<style>
${raw(fontCss)}
*{box-sizing:border-box;margin:0}
html,body{width:${OG_SIZE.width}px;height:${OG_SIZE.height}px;background:${C.canvas};overflow:hidden}
body{font-family:"DM Sans",sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;padding:22px}
.card{position:relative;height:100%;border:1px solid ${C.border};border-radius:8px;display:flex;gap:40px;padding:48px 0 48px 56px;overflow:hidden}
.tick{position:absolute;width:26px;height:26px;border:0 solid ${C.primary};z-index:2}
.tl{top:-1px;left:-1px;border-top-width:2px;border-left-width:2px;border-top-left-radius:8px}
.br{bottom:-1px;right:-1px;border-bottom-width:2px;border-right-width:2px;border-bottom-right-radius:8px}
.copy{flex:0 0 610px;display:flex;flex-direction:column}
.lockup{display:flex;align-items:center;gap:12px}
.mark{width:44px;height:44px;border-radius:9px;background:${C.primary};color:#fff;display:flex;align-items:center;justify-content:center}
.mark svg{width:26px;height:26px}
.name{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:30px;letter-spacing:-0.03em}
h1{font-family:"Space Grotesk",sans-serif;font-weight:700;font-size:72px;line-height:0.95;letter-spacing:-0.03em;margin-top:48px}
p{margin-top:22px;font-size:25px;line-height:1.35;color:${C.secondary};max-width:560px}
.chips{display:flex;gap:10px;margin-top:auto}
.chip{display:flex;align-items:center;gap:9px;height:40px;padding:0 16px;border:1px solid ${C.border};border-radius:999px;font-size:18px;font-weight:500}
.chip i{width:7px;height:7px;border-radius:50%;background:${C.primary}}
.domain{position:absolute;right:28px;top:26px;font-family:"JetBrains Mono",monospace;font-size:18px;letter-spacing:0.04em;color:${C.muted}}
.shot{position:relative;flex:1;margin:64px 0 -48px;border:1px solid ${C.border};border-right:0;border-bottom:0;border-top-left-radius:8px;background:${C.surface};overflow:hidden}
.shot img{position:absolute;left:-396px;top:-266px;width:1280px;height:800px}
</style>
</head>
<body>
<div class="card">
  <span class="tick tl"></span><span class="tick br"></span>
  <div class="copy">
    <div class="lockup"><span class="mark">${ICONS.mark}</span><span class="name">${BRAND}</span></div>
    <h1>${c.hero.title}</h1>
    <p>${c.meta.ogLine}</p>
    <div class="chips">${chips.map((chip) => html`<span class="chip"><i></i>${chip}</span>`)}</div>
  </div>
  <div class="shot"><img src="${shot}" alt=""></div>
  <span class="domain">${DOMAIN}</span>
</div>
</body>
</html>
`;
  return page.value;
}
