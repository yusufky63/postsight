/**
 * Site copy in English and Turkish. Action names, tier names, the "Save key" label and the
 * FAQ come from the extension's own locale files, so the site says what the extension shows.
 * Descriptions follow store/listing/<lang>.md.
 */
import { en as enUi } from "../../src/shared/locales/en";
import type { MessageKey } from "../../src/shared/locales/en";
import { tr as trUi } from "../../src/shared/locales/tr";
import type { Lang } from "./config";

export type ActionId = "verify" | "research" | "summarize" | "translate" | "explain" | "reply" | "ask" | "copy";

export type Copy = {
  ui: Record<MessageKey, string>;
  meta: {
    homeTitle: string;
    homeDescription: string;
    privacyDescription: string;
    supportTitle: string;
    supportDescription: string;
    notFoundTitle: string;
    ogAlt: string;
    /** Second line on the share card. */
    ogLine: string;
  };
  nav: {
    skip: string;
    main: string;
    features: string;
    install: string;
    privacy: string;
    support: string;
    download: string;
    theme: string;
    otherLang: string;
    otherLangName: string;
  };
  hero: { eyebrow: string; title: string; lead: string; download: string; source: string; facts: string[]; shotAlt: string };
  actions: { eyebrow: string; title: string; lead: string; items: Record<ActionId, string>; shotAlt: string };
  routing: {
    eyebrow: string;
    title: string;
    lead: string;
    tableTitle: string;
    tableNote: string;
    tier: string;
    costTitle: string;
    cost: string[];
    prices: (date: string) => string;
    shotAlt: string;
  };
  reads: { eyebrow: string; title: string; lead: string; langTitle: string; langLead: string; shotAlt: string };
  privacy: { eyebrow: string; title: string; lead: string; facts: { label: string; text: string }[]; link: string; shotAlt: string };
  install: {
    eyebrow: string;
    title: string;
    lead: string;
    releaseTitle: string;
    releaseSteps: (version: string, releaseUrl: string) => string[];
    sourceTitle: string;
    sourceLead: string;
    sourceAfter: (readmeUrl: string) => string;
    needsTitle: string;
    browser: (min: string) => string;
    keys: string;
  };
  privacyPage: {
    eyebrow: string;
    /** Page heading; null uses the title of PRIVACY.md. */
    title: string | null;
    updated: string;
    toc: string;
    source: string;
    sourceLink: string;
    note: string | null;
  };
  support: {
    eyebrow: string;
    title: string;
    lead: string;
    channelsTitle: string;
    bug: [string, string];
    feature: [string, string];
    security: [string, string];
    issues: [string, string];
    beforeTitle: string;
    before: string[];
    faqTitle: string;
    faqLead: string;
  };
  footer: {
    tagline: string;
    product: string;
    help: string;
    project: string;
    release: string;
    privacyPolicy: string;
    bug: string;
    security: string;
    source: string;
    changelog: string;
    license: string;
    notAffiliated: string;
    language: string;
  };
  notFound: { title: string; lead: string; home: string; support: string };
};

const en: Copy = {
  ui: enUi,
  meta: {
    homeTitle: "Postsight: AI fact-check and research for posts on X",
    homeDescription:
      "A Chrome and Edge extension that adds an AI button to posts on X: fact-check, research, summarize and translate them with your own Claude, OpenAI or DeepSeek key.",
    privacyDescription:
      "What Postsight stores, what it sends to the AI provider you choose, and what it never does. No server, no account, no analytics.",
    supportTitle: "Support",
    supportDescription:
      "Report a bug, ask for a feature or report a vulnerability privately, and read answers to common questions about Postsight.",
    notFoundTitle: "Page not found",
    ogAlt: "Postsight: fact-check any post on X with your own Claude, OpenAI or DeepSeek key.",
    ogLine: "Verify, research, summarize and translate posts with your own Claude, OpenAI or DeepSeek key.",
  },
  nav: {
    skip: "Skip to content",
    main: "Main",
    features: "Features",
    install: "Install",
    privacy: "Privacy",
    support: "Support",
    download: "Download",
    theme: "Dark theme",
    otherLang: "TR",
    otherLangName: "Türkçe",
  },
  hero: {
    eyebrow: "Browser extension for X · Chrome and Edge",
    title: "Fact-check any post on X.",
    lead: "Postsight adds a small AI button to every post. Verify, research, summarize, translate or explain it with your own Claude, OpenAI or DeepSeek key, and see what each answer cost.",
    download: "Download the latest release",
    source: "Build from source",
    facts: ["MIT license", "No account", "No tracking", "12 languages"],
    shotAlt:
      "A Verify card under a post on X: the claim is rated False with 92% confidence, followed by claim-by-claim notes, context and a bottom line.",
  },
  actions: {
    eyebrow: "01 — On every post",
    title: "What the AI button does",
    lead: "Open the menu on any post and pick what you need. Each action sees the whole post: the thread, the quoted post, polls, community notes and images.",
    items: {
      verify:
        "A verdict (accurate, misleading, false, opinion and more), a confidence score, claim-by-claim notes and the sources behind them, using live web search.",
      research: "Background, key dated facts, who is involved and where people disagree.",
      summarize: "A one-line TL;DR and the substance, including threads, quoted posts, X Articles and linked news pages.",
      translate: "Into your language, with links and mentions kept intact.",
      explain: "Jargon, references, memes and irony made clear.",
      reply: "Three drafts in different tones to copy. Postsight never posts for you.",
      ask: "Any question about the post.",
      copy: "The text, the link, or a ready-made quote.",
    },
    shotAlt:
      "The Postsight menu open on a post on X, listing Verify, Research, Summarize, Translate, Explain, Reply ideas and Ask with an estimated cost for each, and three copy buttons.",
  },
  routing: {
    eyebrow: "02 — Auto routing and cost",
    title: "A model sized to the job, and the bill in view",
    lead: "In Auto mode, light jobs go to a cheap, fast model and fact-checks to a stronger one with web search. The score comes from the action and the post: its length, thread, images, quoted posts and articles. Or pick a model per post.",
    tableTitle: "Default model per tier",
    tableNote: "Every tier, the provider order and the prices can be changed in settings.",
    tier: "Tier",
    costTitle: "Know what you spend",
    cost: [
      "Tokens, web searches, cost and time on every result. Token counts come from the provider's response.",
      "Monthly budgets per provider, with what is left and roughly how many tokens that buys.",
      "DeepSeek's live account balance. Anthropic and OpenAI have no balance endpoint for normal keys, so your budget counts down there.",
      "Saved results are reused, so the same request is not paid for twice.",
    ],
    prices: (date) => `Built-in prices checked ${date}, in USD per 1M tokens.`,
    shotAlt:
      "The Auto routing settings: strategy, provider order and a table of the model Auto picks for each action on a short post and on a long thread with images.",
  },
  reads: {
    eyebrow: "03 — Context and languages",
    title: "Reads what the post points to",
    lead: "A link-only post is not judged by its headline. Postsight reads X Articles from X's public post page and, with your permission, the news and blog pages a post links to. Pages are fetched without your cookies.",
    langTitle: "12 languages",
    langLead: "For the interface and the answers. Translate goes into your language, or into your second language when the post is already in yours.",
    shotAlt: "A Spanish post on X translated into Turkish by Postsight, with the link kept intact and the token count and cost shown below.",
  },
  privacy: {
    eyebrow: "04 — Privacy",
    title: "Your keys stay in your browser",
    lead: "There is no Postsight server, no account, no analytics and no advertising. A post leaves your browser only when you run an action on it, and only to the provider you chose.",
    facts: [
      { label: "Keys", text: "Kept in the extension's local storage on this device and never synced. The script on x.com cannot read them." },
      { label: "Requests", text: "Sent straight to api.anthropic.com, api.openai.com or api.deepseek.com with your own key." },
      { label: "Pages", text: "X Articles, short links and linked pages are fetched without your cookies." },
      { label: "Actions", text: "Postsight never posts, likes, replies or follows. Reply ideas are drafts you copy." },
    ],
    link: "Read the privacy policy",
    shotAlt:
      "The Providers settings page: an API key field with Save key and Test buttons, a monthly budget in USD and the model used for each tier.",
  },
  install: {
    eyebrow: "05 — Install",
    title: "Install from GitHub",
    lead: "Postsight is free and open source under the MIT license. Install the packaged release, or build it yourself.",
    releaseTitle: "From the latest release",
    releaseSteps: (version, releaseUrl) => [
      `Download \`postsight-${version}.zip\` from the [latest release](${releaseUrl}).`,
      "Unzip it.",
      "Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.",
      "Choose **Load unpacked** and pick the unzipped folder.",
      `The settings page opens. Paste a Claude, OpenAI or DeepSeek key and press **${enUi["prov.save"]}**; Postsight tests it and loads the model list.`,
      "On x.com, every post now has a small **AI** button next to Grok and the more menu.",
    ],
    sourceTitle: "From source",
    sourceLead: "Needs Node 22 or later and pnpm.",
    sourceAfter: (readmeUrl) => `Then load the \`dist\` folder with **Load unpacked**. The [README](${readmeUrl}) has the details.`,
    needsTitle: "You need",
    browser: (min) => `Chrome or Edge ${min} or later.`,
    keys: "An API key from at least one provider:",
  },
  privacyPage: {
    eyebrow: "Privacy",
    title: null,
    updated: "Last updated",
    toc: "On this page",
    source: "This page is built from PRIVACY.md in the repository.",
    sourceLink: "View it on GitHub",
    note: null,
  },
  support: {
    eyebrow: "Support",
    title: "Help and support",
    lead: "Postsight is maintained in the open on GitHub. Bugs, questions and ideas go to the issue tracker; security problems go through a private report.",
    channelsTitle: "Get in touch",
    bug: ["Report a bug", "Something does not work as described."],
    feature: ["Request a feature", "Suggest an idea or an improvement."],
    security: ["Report a vulnerability", "Privately, through GitHub's security advisories. You get a reply within a week."],
    issues: ["Browse issues", "See what is already reported or planned."],
    beforeTitle: "Before you write",
    before: [
      "Never paste an API key into an issue or a screenshot.",
      "Add the Postsight version from `chrome://extensions` and your browser.",
      "Say which action, provider and model you used, what happened and what you expected.",
    ],
    faqTitle: "Common questions",
    faqLead: "The same answers are in the extension, under Settings and then Help.",
  },
  footer: {
    tagline: "AI fact-check, research and translation for posts on X, with your own key.",
    product: "Product",
    help: "Help",
    project: "Project",
    release: "Latest release",
    privacyPolicy: "Privacy policy",
    bug: "Report a bug",
    security: "Security report",
    source: "Source on GitHub",
    changelog: "Changelog",
    license: "MIT license",
    notAffiliated: "Not affiliated with X Corp., Anthropic, OpenAI or DeepSeek.",
    language: "Language",
  },
  notFound: {
    title: "Page not found",
    lead: "There is nothing at this address. It may have moved, or the link may be mistyped.",
    home: "Go to the home page",
    support: "Get support",
  },
};

const tr: Copy = {
  ui: trUi,
  meta: {
    homeTitle: "Postsight: X gönderileri için yapay zekâ ile doğrulama ve araştırma",
    homeDescription:
      "X'teki gönderilere AI butonu ekleyen Chrome ve Edge eklentisi: kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula, araştır, özetle ve çevir.",
    privacyDescription:
      "Postsight neyi saklar, seçtiğin yapay zekâ sağlayıcısına neyi gönderir ve neyi asla yapmaz. Sunucu, hesap ve analitik yok.",
    supportTitle: "Destek",
    supportDescription: "Hata bildir, özellik iste ya da güvenlik açığını gizli olarak bildir; Postsight hakkında sık sorulan soruların yanıtlarını oku.",
    notFoundTitle: "Sayfa bulunamadı",
    ogAlt: "Postsight: X gönderilerini kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula.",
    ogLine: "Gönderileri kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula, araştır, özetle ve çevir.",
  },
  nav: {
    skip: "İçeriğe geç",
    main: "Ana menü",
    features: "Özellikler",
    install: "Kurulum",
    privacy: "Gizlilik",
    support: "Destek",
    download: "İndir",
    theme: "Koyu tema",
    otherLang: "EN",
    otherLangName: "English",
  },
  hero: {
    eyebrow: "X için tarayıcı eklentisi · Chrome ve Edge",
    title: "X gönderilerini doğrula.",
    lead: "Postsight, X'teki her gönderiye küçük bir AI butonu ekler. Kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula, araştır, özetle, çevir ya da açıkla; her yanıtın maliyetini gör.",
    download: "Son sürümü indir",
    source: "Kaynaktan derle",
    facts: ["MIT lisansı", "Hesap yok", "Takip yok", "12 dil"],
    shotAlt:
      "X'te bir gönderinin altında Postsight'ın Verify kartı: iddia yüzde 92 güvenle yanlış bulunmuş; altında iddia iddia notlar, bağlam ve sonuç var.",
  },
  actions: {
    eyebrow: "01 — Her gönderide",
    title: "AI butonu ne yapar",
    lead: "Herhangi bir gönderide menüyü aç ve ihtiyacın olanı seç. Her işlem gönderinin tamamını görür: flood, alıntılanan gönderi, anket, topluluk notu ve görseller.",
    items: {
      verify: "Karar (doğru, yanıltıcı, yanlış, görüş ve diğerleri), güven puanı, iddia iddia notlar ve dayandığı kaynaklar; canlı web aramasıyla.",
      research: "Arka plan, tarihli önemli bilgiler, kimlerin işin içinde olduğu ve görüşlerin nerede ayrıştığı.",
      summarize: "Tek satırlık özet ve özü; floodlar, alıntılar, X Makaleleri ve bağlantılı haber sayfaları dahil.",
      translate: "Kendi diline; bağlantılar ve bahsetmeler bozulmadan.",
      explain: "Jargon, göndermeler, mizah ve ironi.",
      reply: "Farklı tonlarda kopyalanacak üç taslak. Postsight senin adına hiçbir şey paylaşmaz.",
      ask: "Gönderiyle ilgili istediğin soru.",
      copy: "Metin, bağlantı ya da hazır alıntı.",
    },
    shotAlt:
      "X'te bir gönderide açık Postsight menüsü: Verify, Research, Summarize, Translate, Explain, Reply ideas ve Ask, her birinin tahmini maliyetiyle; altında üç kopyalama butonu.",
  },
  routing: {
    eyebrow: "02 — Otomatik yönlendirme ve maliyet",
    title: "İşe göre model, göz önünde maliyet",
    lead: "Otomatik modda hafif işler ucuz ve hızlı bir modele, doğrulamalar web araması yapan daha güçlü bir modele gider. Puan işlemden ve gönderiden gelir: uzunluk, flood, görsel, alıntı ve makale. İstersen her gönderi için modeli sen seç.",
    tableTitle: "Seviye başına varsayılan model",
    tableNote: "Seviyeler, sağlayıcı sırası ve fiyatlar ayarlardan değiştirilebilir.",
    tier: "Seviye",
    costTitle: "Ne harcadığını bil",
    cost: [
      "Her sonuçta token, web araması, maliyet ve süre. Token sayıları sağlayıcının yanıtından alınır.",
      "Sağlayıcı başına aylık bütçe; ne kadar kaldığı ve yaklaşık kaç token ettiği.",
      "DeepSeek'in canlı hesap bakiyesi. Anthropic ve OpenAI normal anahtarlar için bakiye sunmaz; orada bütçen geri sayar.",
      "Kaydedilen sonuçlar yeniden kullanılır; aynı istek için iki kez ödeme yapmazsın.",
    ],
    prices: (date) => `Yerleşik fiyatlar ${date} tarihinde kontrol edildi; 1M token başına USD.`,
    shotAlt:
      "Otomatik yönlendirme ayarları: strateji, sağlayıcı sırası ve kısa bir gönderi ile görselli uzun bir flood için Otomatik modun her işlemde seçtiği modelin tablosu.",
  },
  reads: {
    eyebrow: "03 — Bağlam ve diller",
    title: "Gönderinin gösterdiğini okur",
    lead: "Sadece bağlantıdan oluşan bir gönderi başlığına göre değerlendirilmez. Postsight X Makalelerini X'in herkese açık gönderi sayfasından, izin verirsen gönderinin bağlantı verdiği haber ve blog sayfalarını da okur. Sayfalar çerezlerin olmadan çekilir.",
    langTitle: "12 dil",
    langLead: "Arayüz ve yanıtlar için. Çeviri senin diline yapılır; gönderi zaten senin dilindeyse ikinci diline.",
    shotAlt: "X'te İspanyolca bir gönderi, Postsight ile Türkçeye çevrilmiş; bağlantı bozulmamış, token sayısı ve maliyet altta görünüyor.",
  },
  privacy: {
    eyebrow: "04 — Gizlilik",
    title: "Anahtarların tarayıcında kalır",
    lead: "Postsight sunucusu, hesap, analitik ve reklam yoktur. Bir gönderi yalnızca onun üzerinde bir işlem çalıştırdığında ve yalnızca seçtiğin sağlayıcıya gider.",
    facts: [
      { label: "Anahtarlar", text: "Bu cihazda eklentinin yerel deposunda tutulur, senkronlanmaz. x.com'daki betik onları okuyamaz." },
      { label: "İstekler", text: "Kendi anahtarınla doğrudan api.anthropic.com, api.openai.com ya da api.deepseek.com adresine gider." },
      { label: "Sayfalar", text: "X Makaleleri, kısa bağlantılar ve bağlantılı sayfalar çerezlerin olmadan çekilir." },
      { label: "İşlemler", text: "Postsight paylaşmaz, beğenmez, yanıtlamaz, takip etmez. Yanıt önerileri kopyaladığın taslaklardır." },
    ],
    link: "Gizlilik politikasını oku",
    shotAlt:
      "Sağlayıcılar ayar sayfası: Save key ve Test butonlu API anahtarı alanı, USD cinsinden aylık bütçe ve her seviye için kullanılan model.",
  },
  install: {
    eyebrow: "05 — Kurulum",
    title: "GitHub'dan kur",
    lead: "Postsight ücretsizdir ve MIT lisanslı açık kaynaktır. Paketlenmiş sürümü kur ya da kendin derle.",
    releaseTitle: "Son sürümden",
    releaseSteps: (version, releaseUrl) => [
      `[Son sürümden](${releaseUrl}) \`postsight-${version}.zip\` dosyasını indir.`,
      "Zip dosyasını aç.",
      "`chrome://extensions` ya da `edge://extensions` sayfasını aç ve **Geliştirici modu** anahtarını aç.",
      "**Paketlenmemiş öğe yükle** düğmesine bas ve açtığın klasörü seç.",
      `Ayarlar sayfası açılır. Bir Claude, OpenAI ya da DeepSeek anahtarı yapıştır ve **${trUi["prov.save"]}** düğmesine bas; Postsight anahtarı dener ve model listesini yükler.`,
      "Artık x.com'da her gönderide Grok ve diğer menünün yanında küçük bir **AI** butonu var.",
    ],
    sourceTitle: "Kaynaktan",
    sourceLead: "Node 22 ya da üstü ve pnpm gerekir.",
    sourceAfter: (readmeUrl) => `Sonra \`dist\` klasörünü **Paketlenmemiş öğe yükle** ile yükle. Ayrıntılar [README](${readmeUrl}) dosyasında.`,
    needsTitle: "Gerekenler",
    browser: (min) => `Chrome ya da Edge ${min} ya da üstü.`,
    keys: "En az bir sağlayıcıdan API anahtarı:",
  },
  privacyPage: {
    eyebrow: "Gizlilik",
    title: "Gizlilik politikası",
    updated: "Son güncelleme",
    toc: "Bu sayfada",
    source: "Bu sayfa depodaki PRIVACY.md dosyasından üretilir.",
    sourceLink: "GitHub'da gör",
    note: "Gizlilik politikası İngilizce tutulur ve geçerli metin aşağıdaki İngilizce metindir. Kısaca: anahtarların tarayıcında kalır, bir gönderi yalnızca üzerinde işlem çalıştırdığında ve yalnızca seçtiğin sağlayıcıya gider, Postsight'ın sunucusu, analitiği ve reklamı yoktur.",
  },
  support: {
    eyebrow: "Destek",
    title: "Yardım ve destek",
    lead: "Postsight GitHub'da açık olarak geliştirilir. Hatalar, sorular ve fikirler issue listesine; güvenlik sorunları gizli bildirimle iletilir.",
    channelsTitle: "İletişim",
    bug: ["Hata bildir", "Bir şey anlatıldığı gibi çalışmıyor."],
    feature: ["Özellik iste", "Bir fikir ya da iyileştirme öner."],
    security: ["Güvenlik açığı bildir", "GitHub'ın güvenlik bildirimleriyle, gizli olarak. Bir hafta içinde yanıt alırsın."],
    issues: ["Issue'lara göz at", "Zaten bildirilmiş ya da planlanmış olanları gör."],
    beforeTitle: "Yazmadan önce",
    before: [
      "API anahtarını asla bir issue'ya ya da ekran görüntüsüne koyma.",
      "`chrome://extensions` sayfasındaki Postsight sürümünü ve tarayıcını yaz.",
      "Hangi işlemi, sağlayıcıyı ve modeli kullandığını, ne olduğunu ve ne beklediğini anlat.",
    ],
    faqTitle: "Sık sorulanlar",
    faqLead: "Aynı yanıtlar eklentide, Ayarlar altındaki Yardım bölümünde de var.",
  },
  footer: {
    tagline: "X'teki gönderiler için kendi anahtarınla yapay zekâ destekli doğrulama, araştırma ve çeviri.",
    product: "Ürün",
    help: "Yardım",
    project: "Proje",
    release: "Son sürüm",
    privacyPolicy: "Gizlilik politikası",
    bug: "Hata bildir",
    security: "Güvenlik bildirimi",
    source: "GitHub'daki kaynak",
    changelog: "Değişiklik günlüğü",
    license: "MIT lisansı",
    notAffiliated: "X Corp., Anthropic, OpenAI ya da DeepSeek ile bağlantılı değildir.",
    language: "Dil",
  },
  notFound: {
    title: "Sayfa bulunamadı",
    lead: "Bu adreste bir şey yok. Taşınmış ya da bağlantı yanlış yazılmış olabilir.",
    home: "Ana sayfaya git",
    support: "Destek al",
  },
};

export const COPY: Record<Lang, Copy> = { en, tr };

/** The seven help questions and answers from the extension's Help section. */
export function faq(lang: Lang): { q: string; a: string }[] {
  const ui = COPY[lang].ui;
  const n = [1, 2, 3, 4, 5, 6, 7] as const;
  return n.map((i) => ({ q: ui[`help.q${i}` as const], a: ui[`help.a${i}` as const] }));
}

export const ACTION_IDS: readonly ActionId[] = ["verify", "research", "summarize", "translate", "explain", "reply", "ask", "copy"];

/** Action names exactly as the extension's menu shows them. */
export function actionName(lang: Lang, id: ActionId): string {
  const ui = COPY[lang].ui;
  return id === "copy" ? ui["menu.copy"] : ui[`action.${id}` as const];
}
