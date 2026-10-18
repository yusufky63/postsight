import { LANGUAGES } from "../../src/shared/languages";
import { CATALOG, DEFAULT_TIERS, PRICES_CHECKED, PROVIDER_KEY_URL, PROVIDER_LABEL } from "../../src/shared/models";
import { TIERS } from "../../src/shared/types";
import type { ProviderId } from "../../src/shared/types";
import { LANGS, LINKS, pathOf } from "./config";
import type { Lang } from "./config";
import { ACTION_IDS, COPY, actionName, faq } from "./content";
import { html } from "./html";
import type { Markup } from "./html";
import { ICONS, externalLink } from "./layout";
import type { Assets } from "./layout";
import { md } from "./markdown";
import type { Policy } from "./markdown";

export type SiteData = {
  version: string;
  minChrome: string;
  policy: Policy;
  assets: Assets;
};

const PROVIDERS = Object.keys(DEFAULT_TIERS) as ProviderId[];

function modelLabel(provider: ProviderId, id: string): string {
  return CATALOG.find((m) => m.provider === provider && m.id === id)?.label ?? id;
}

/**
 * A screenshot of the extension's own pages in a hairline frame. Only real extension pages
 * are shown; posts on X are not mocked up.
 */
function shot(data: SiteData, name: string, alt: string, opts: { eager?: boolean; ticks?: boolean } = {}): Markup {
  const img = data.assets.shots[name];
  if (!img) throw new Error(`missing screenshot store/screenshots/${name}.png`);
  const cls = opts.ticks ? "shot ticks" : "shot";
  return html`<figure class="${cls}"><img src="${img.url}" width="${img.width}" height="${img.height}" alt="${alt}" ${
    opts.eager ? html`fetchpriority="high"` : html`loading="lazy"`
  } decoding="async"></figure>`;
}

function sectionHead(id: string, eyebrow: string, title: string, lead: string, extra?: Markup): Markup {
  return html`<header class="section-head">
      <p class="eyebrow">${eyebrow}</p>
      <h2 class="display-medium h2" id="${id}">${title}</h2>
      <p class="lead-sm">${lead}</p>
      ${extra}
    </header>`;
}

export function homePage(lang: Lang, data: SiteData): Markup {
  const c = COPY[lang];
  const ui = c.ui;

  const hero = html`<section class="hero frame" aria-labelledby="hero-title">
  <div class="hero-copy">
    <p class="eyebrow">${c.hero.eyebrow}</p>
    <h1 class="display hero-title" id="hero-title">${c.hero.title}</h1>
    <p class="lead">${c.hero.lead}</p>
    <div class="cta-row">
      <a class="btn btn-lg btn-primary" href="${LINKS.chromeStore}">${ICONS.download}${c.hero.store}</a>
      <a class="btn btn-lg" href="${LINKS.release}">${c.hero.download}${ICONS.arrow}</a>
    </div>
    <ul class="facts" role="list">
      <li class="mono">v${data.version}</li>
      ${c.hero.facts.map((f) => html`<li>${f}</li>`)}
    </ul>
  </div>
  ${shot(data, "5-routing", c.hero.shotAlt, { eager: true, ticks: true })}
</section>`;

  const actions = html`<section class="section frame" id="features" aria-labelledby="features-title">
  <div class="split split-top">
    ${sectionHead(
      "features-title",
      c.actions.eyebrow,
      c.actions.title,
      c.actions.lead,
      // Same look as the badge the extension puts on each post (src/content/content.css .trigger).
      html`<p class="badge-row"><span class="trigger-badge">${ICONS.mark}AI</span><span class="small secondary">${c.actions.badgeNote}</span></p>`,
    )}
    <dl class="actions">
      ${ACTION_IDS.map(
        (id, i) => html`<div class="action">
        <dt><span class="idx num">${String(i + 1).padStart(2, "0")}</span>${actionName(lang, id)}</dt>
        <dd>${c.actions.items[id]}</dd>
      </div>`,
      )}
    </dl>
  </div>
</section>`;

  const routing = html`<section class="section frame" aria-labelledby="routing-title">
  ${sectionHead("routing-title", c.routing.eyebrow, c.routing.title, c.routing.lead)}
  <div class="pair">
    <div class="card">
      <div class="card-head"><h3 class="label">${c.routing.tableTitle}</h3></div>
      <table class="tiers">
        <thead><tr><th scope="col">${c.routing.tier}</th>${PROVIDERS.map((p) => html`<th scope="col">${PROVIDER_LABEL[p]}</th>`)}</tr></thead>
        <tbody>
          ${TIERS.map(
            (tier) => html`<tr><th scope="row">${ui[`tier.${tier}` as const]}</th>${PROVIDERS.map(
              (p) => html`<td>${modelLabel(p, DEFAULT_TIERS[p][tier])}</td>`,
            )}</tr>`,
          )}
        </tbody>
      </table>
      <p class="card-foot small muted">${c.routing.tableNote}</p>
    </div>
    <div class="card">
      <div class="card-head"><h3 class="label">${c.routing.costTitle}</h3></div>
      <ul class="ticklist">${c.routing.cost.map((item) => html`<li>${item}</li>`)}</ul>
      <p class="card-foot xs muted mono">${c.routing.prices(PRICES_CHECKED)}</p>
    </div>
  </div>
</section>`;

  const reads = html`<section class="section frame" aria-labelledby="reads-title">
  <div class="split split-top">
    ${sectionHead("reads-title", c.reads.eyebrow, c.reads.title, c.reads.lead)}
    <div>
      <h3 class="display-medium h3">${c.reads.langTitle}</h3>
      <p class="secondary">${c.reads.langLead}</p>
      <ul class="langs" role="list">
        ${LANGUAGES.map((l) => html`<li><span class="code mono">${l.code}</span><span lang="${l.locale}">${l.native}</span></li>`)}
      </ul>
    </div>
  </div>
</section>`;

  // Sources are named as the card names them; the table says where each line on a card comes from.
  const wallets = html`<section class="section frame" id="wallets" aria-labelledby="wallets-title">
  <div class="split split-top">
    <div>
      ${sectionHead("wallets-title", c.wallets.eyebrow, c.wallets.title, c.wallets.lead)}
      <div class="note-block">
        <h3 class="display-medium h3">${c.wallets.authorTitle}</h3>
        <p class="secondary">${c.wallets.author}</p>
        <p class="small muted">${c.wallets.claims}</p>
      </div>
    </div>
    <div class="card">
      <table class="tiers checks">
        <thead><tr><th scope="col">${c.wallets.check}</th><th scope="col">${c.wallets.source}</th></tr></thead>
        ${c.wallets.groups.map(
          (g) => html`<tbody>
          <tr class="group"><th scope="rowgroup" colspan="2">${g.title}</th></tr>
          ${g.rows.map(([what, from]) => html`<tr><th scope="row">${what}</th><td>${from}</td></tr>`)}
        </tbody>`,
        )}
      </table>
    </div>
  </div>
</section>`;

  const privacy = html`<section class="section frame" aria-labelledby="privacy-title">
  <div class="split split-wide-media">
    <div>
      ${sectionHead("privacy-title", c.privacy.eyebrow, c.privacy.title, c.privacy.lead)}
      <dl class="fact-grid">
        ${c.privacy.facts.map((f) => html`<div><dt class="label">${f.label}</dt><dd>${f.text}</dd></div>`)}
      </dl>
      <a class="text-link" href="${pathOf("privacy", lang)}">${c.privacy.link}${ICONS.arrow}</a>
    </div>
    ${shot(data, "4-settings", c.privacy.shotAlt)}
  </div>
</section>`;

  const install = html`<section class="section frame" id="install" aria-labelledby="install-title">
  ${sectionHead("install-title", c.install.eyebrow, c.install.title, c.install.lead)}
  <div class="install-grid">
    <div class="stack">
      <div class="card ticks">
        <div class="card-head"><h3 class="label">${c.install.storeTitle}</h3></div>
        <ol class="steps">${c.install.storeSteps(LINKS.chromeStore).map((s) => html`<li><span>${md(s)}</span></li>`)}</ol>
        <div class="card-foot"><a class="btn btn-primary" href="${LINKS.chromeStore}">${ICONS.download}${c.hero.store}</a><span class="small muted">${c.install.storeFoot}</span></div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="label">${c.install.needsTitle}</h3></div>
        <ul class="card-body needs">
          <li>${c.install.browser(data.minChrome)}</li>
          <li>${c.install.keys}
            <span class="key-links">${PROVIDERS.map((p) => externalLink(PROVIDER_KEY_URL[p], PROVIDER_LABEL[p]))}</span>
          </li>
        </ul>
      </div>
    </div>
    <div class="stack">
      <div class="card">
        <div class="card-head"><h3 class="label">${c.install.releaseTitle}</h3></div>
        <ol class="steps">${c.install.releaseSteps(data.version, LINKS.release).map((s) => html`<li><span>${md(s)}</span></li>`)}</ol>
        <div class="card-foot"><a class="btn" href="${LINKS.release}">${ICONS.download}${c.hero.download}</a></div>
      </div>
      <div class="card">
        <div class="card-head"><h3 class="label">${c.install.sourceTitle}</h3></div>
        <div class="card-body">
          <p class="small secondary">${c.install.sourceLead}</p>
          <pre class="code-block"><code>git clone ${LINKS.repo}.git
cd postsight
pnpm install
pnpm build</code></pre>
          <p class="small secondary">${md(c.install.sourceAfter(LINKS.readmeInstall))}</p>
        </div>
      </div>
    </div>
  </div>
</section>`;

  return html`${hero}
${actions}
${routing}
${reads}
${wallets}
${privacy}
${install}`;
}

export function privacyPage(lang: Lang, data: SiteData): Markup {
  const c = COPY[lang];
  const p = data.policy;
  return html`<div class="frame doc">
  <header class="doc-head">
    <p class="eyebrow">${c.privacyPage.eyebrow}</p>
    <h1 class="display doc-title">${c.privacyPage.title ?? p.title}</h1>
    ${p.updated ? html`<p class="mono small muted">${c.privacyPage.updated} <time datetime="${p.updated}">${p.updated}</time></p>` : ""}
  </header>
  <div class="doc-layout">
    <nav class="toc" aria-label="${c.privacyPage.toc}">
      <p class="label">${c.privacyPage.toc}</p>
      <ul>${p.sections.map((s) => html`<li><a class="rail" href="#${s.id}" lang="en">${s.title}</a></li>`)}</ul>
    </nav>
    <div>
      ${c.privacyPage.note ? html`<p class="note">${c.privacyPage.note}</p>` : ""}
      <article class="prose" lang="en">
${p.body}
      </article>
      <p class="doc-source small muted">${c.privacyPage.source} ${externalLink(LINKS.privacySource, c.privacyPage.sourceLink)}</p>
    </div>
  </div>
</div>`;
}

export function supportPage(lang: Lang): Markup {
  const c = COPY[lang];
  const s = c.support;
  const channels: { pair: [string, string]; href: string }[] = [
    { pair: s.bug, href: LINKS.bugReport },
    { pair: s.feature, href: LINKS.featureRequest },
    { pair: s.security, href: LINKS.securityReport },
    { pair: s.issues, href: LINKS.issues },
  ];
  return html`<div class="frame doc">
  <header class="doc-head">
    <p class="eyebrow">${s.eyebrow}</p>
    <h1 class="display doc-title">${s.title}</h1>
    <p class="lead">${s.lead}</p>
  </header>
  <section class="doc-section" aria-labelledby="channels-title">
    <h2 class="label" id="channels-title">${s.channelsTitle}</h2>
    <ul class="channels" role="list">
      ${channels.map(
        (ch) => html`<li><a class="channel rail" href="${ch.href}" target="_blank" rel="noreferrer noopener">
        <span class="channel-title">${ch.pair[0]}<span class="ext">${ICONS.external}</span></span>
        <span class="small secondary">${ch.pair[1]}</span>
      </a></li>`,
      )}
    </ul>
  </section>
  <section class="doc-section" aria-labelledby="before-title">
    <h2 class="label" id="before-title">${s.beforeTitle}</h2>
    <ul class="ticklist">${s.before.map((b) => html`<li>${md(b)}</li>`)}</ul>
  </section>
  <section class="doc-section" id="faq" aria-labelledby="faq-title">
    <h2 class="display-medium h2" id="faq-title">${s.faqTitle}</h2>
    <p class="secondary">${s.faqLead}</p>
    <div class="faq">
      ${faq(lang).map(
        (item) => html`<div class="qa">
        <h3>${item.q}</h3>
        <p>${item.a}</p>
      </div>`,
      )}
    </div>
  </section>
</div>`;
}

/** Vercel serves one 404.html for every missing path, so the page says it in both languages. */
export function notFoundPage(): Markup {
  const block = (lang: Lang) => {
    const c = COPY[lang];
    const title = lang === "en" ? html`<h1 class="display doc-title">${c.notFound.title}</h1>` : html`<h2 class="display doc-title">${c.notFound.title}</h2>`;
    return html`<section class="not-found-block" lang="${lang}">
    ${title}
    <p class="lead">${c.notFound.lead}</p>
    <div class="cta-row">
      <a class="btn btn-primary" href="${pathOf("home", lang)}">${c.notFound.home}</a>
      <a class="btn" href="${pathOf("support", lang)}">${c.notFound.support}</a>
    </div>
  </section>`;
  };
  return html`<div class="frame doc not-found">
  <p class="eyebrow">404</p>
  ${LANGS.map(block)}
</div>`;
}
