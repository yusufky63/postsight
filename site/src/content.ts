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
  hero: { eyebrow: string; title: string; lead: string; store: string; download: string; facts: string[]; shotAlt: string };
  actions: { eyebrow: string; title: string; lead: string; badgeNote: string; items: Record<ActionId, string> };
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
  };
  reads: { eyebrow: string; title: string; lead: string; langTitle: string; langLead: string };
  wallets: {
    eyebrow: string;
    title: string;
    lead: string;
    authorTitle: string;
    author: string;
    claims: string;
    check: string;
    source: string;
    /** Rows of [what the card shows, where it comes from], under a group title. */
    groups: { title: string; rows: [string, string][] }[];
  };
  privacy: { eyebrow: string; title: string; lead: string; facts: { label: string; text: string }[]; link: string; shotAlt: string };
  install: {
    eyebrow: string;
    title: string;
    lead: string;
    storeTitle: string;
    storeSteps: (storeUrl: string) => string[];
    storeFoot: string;
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
    store: string;
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
      "A Chrome and Edge extension that adds an AI badge to every post on X: fact-check, research, summarize and translate it with your own Claude, OpenAI or DeepSeek key, and see who is behind the wallet addresses in it.",
    privacyDescription:
      "What Postsight stores, what it sends to the AI provider you choose, and what it never does. No server, no account, no analytics.",
    supportTitle: "Support",
    supportDescription:
      "Report a bug, ask for a feature or report a vulnerability privately, and read answers to common questions about Postsight.",
    notFoundTitle: "Page not found",
    ogAlt: "Postsight: fact-check any post on X with your own Claude, OpenAI or DeepSeek key.",
    ogLine: "Research, summarize and translate with your own Claude, OpenAI or DeepSeek key, and see who is behind the wallets in a post.",
  },
  nav: {
    skip: "Skip to content",
    main: "Main",
    features: "Features",
    install: "Install",
    privacy: "Privacy",
    support: "Support",
    download: "Add to Chrome",
    theme: "Dark theme",
    otherLang: "TR",
    otherLangName: "Türkçe",
  },
  hero: {
    eyebrow: "Browser extension for X · Chrome and Edge",
    title: "Fact-check any post on X.",
    lead: "Postsight adds a violet AI badge to every post. Click it to verify, research, summarize, translate or explain the post with your own Claude, OpenAI or DeepSeek key, and see what each answer cost. Hover a wallet address in a post to see who is behind it.",
    store: "Add to Chrome",
    download: "Download the latest release",
    facts: ["MIT license", "No account", "No tracking", "12 languages"],
    shotAlt:
      "The Auto routing page in Postsight's settings: the strategy, the provider order with saved keys, and the model Auto picks for each action with its estimated cost.",
  },
  actions: {
    eyebrow: "01 — On every post",
    title: "What the AI badge does",
    lead: "Click the badge on any post and pick what you need. Each action sees the whole post: the thread, the quoted post, polls, community notes and images.",
    badgeNote: "On every post, next to Grok and the more menu",
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
  },
  reads: {
    eyebrow: "03 — Context and languages",
    title: "Reads what the post points to",
    lead: "A link-only post is not judged by its headline. Postsight reads X Articles from X's public post page and, with your permission, the news and blog pages a post links to. Pages are fetched without your cookies.",
    langTitle: "12 languages",
    langLead: "For the interface and the answers. Translate goes into your language, or into your second language when the post is already in yours.",
  },
  wallets: {
    eyebrow: "04 — Wallet cards",
    title: "Who is behind an address in a post",
    lead: "Turn on wallet cards and every 0x address and .eth name in a post gets a dashed underline. Hover one for its names, profiles, reputation and security flags; for a token, its market, a test trade and who created it. Public sources only, no key needed, and nothing is sent until you hover.",
    authorTitle: "Checked against the post's author",
    author: "The card says when the wallet's names, the token's listed X account or the creator wallet's name point to the post's author, and when they point to someone else. An address whose letter case breaks its checksum gets a warning before anything else.",
    claims: "Names, profile links and a token's listed accounts are what their owners published: a match is a hint, not proof.",
    check: "What the card shows",
    source: "Source",
    groups: [
      {
        title: "Every address",
        rows: [
          ["Names, checked in both directions, and their records", "ENS on Ethereum, Basenames on Base"],
          ["Balance and transactions", "Public Ethereum and Base nodes"],
          ["Linked profiles", "Name records, web3.bio"],
          ["Reviews and verification", "Ethos, Coinbase verification on Base"],
          ["Security flags", "GoPlus"],
        ],
      },
      {
        title: "Tokens",
        rows: [
          ["Price, liquidity, market cap, volume, paid listings", "DexScreener"],
          ["Score, top holders, the team's links", "GeckoTerminal"],
          ["A test buy and sell with the real fees", "Honeypot.is"],
          ["Contract checks", "GoPlus"],
          ["Who created it", "Clanker, Blockscout, GoPlus, GeckoTerminal"],
        ],
      },
      {
        title: "With your own explorer key (optional)",
        rows: [
          ["Creator on any chain, verified contract name", "Etherscan or Blockscout PRO"],
          ["When a wallet first transacted", "Etherscan"],
        ],
      },
    ],
  },
  privacy: {
    eyebrow: "05 — Privacy",
    title: "Your keys stay in your browser",
    lead: "There is no Postsight server, no account, no analytics and no advertising. A post leaves your browser only when you run an action on it, and only to the provider you chose.",
    facts: [
      { label: "Keys", text: "Kept in the extension's local storage on this device and never synced. The script on x.com cannot read them." },
      { label: "Requests", text: "Sent straight to api.anthropic.com, api.openai.com or api.deepseek.com with your own key." },
      { label: "Pages and wallets", text: "X Articles, short links and linked pages are fetched without your cookies. Wallet cards send only the address you hover." },
      { label: "Actions", text: "Postsight never posts, likes, replies or follows. Reply ideas are drafts you copy." },
    ],
    link: "Read the privacy policy",
    shotAlt:
      "The Providers settings page: an API key field with Save key and Test buttons, a monthly budget in USD and the model used for each tier.",
  },
  install: {
    eyebrow: "06 — Install",
    title: "Add it to Chrome or Edge",
    lead: "Postsight is free and open source under the MIT license. Install it from the Chrome Web Store, which keeps it up to date, or load the release zip, or build it yourself.",
    storeTitle: "From the Chrome Web Store",
    storeSteps: (storeUrl) => [
      `Open [Postsight on the Chrome Web Store](${storeUrl}) and choose **Add to Chrome**.`,
      "In Edge, allow extensions from other stores when Edge asks, then add it the same way.",
      `The settings page opens. Paste a Claude, OpenAI or DeepSeek key and press **${enUi["prov.save"]}**; Postsight tests it and loads the model list.`,
      "On x.com, every post now has a violet **AI** badge with the Postsight lens, next to Grok and the more menu.",
    ],
    storeFoot: "The store installs new versions on its own.",
    releaseTitle: "From the latest release",
    releaseSteps: (version, releaseUrl) => [
      `Download \`postsight-${version}.zip\` from the [latest release](${releaseUrl}).`,
      "Unzip it.",
      "Open `chrome://extensions` or `edge://extensions` and turn on **Developer mode**.",
      "Choose **Load unpacked** and pick the unzipped folder.",
      `The settings page opens. Paste a Claude, OpenAI or DeepSeek key and press **${enUi["prov.save"]}**; Postsight tests it and loads the model list.`,
      "On x.com, every post now has a violet **AI** badge with the Postsight lens, next to Grok and the more menu.",
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
    store: "Chrome Web Store",
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
      "X'teki her gönderiye AI rozeti ekleyen Chrome ve Edge eklentisi: kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula, araştır, özetle ve çevir; gönderideki cüzdan adreslerinin arkasında kim olduğunu gör.",
    privacyDescription:
      "Postsight neyi saklar, seçtiğin yapay zekâ sağlayıcısına neyi gönderir ve neyi asla yapmaz. Sunucu, hesap ve analitik yok.",
    supportTitle: "Destek",
    supportDescription: "Hata bildir, özellik iste ya da güvenlik açığını gizli olarak bildir; Postsight hakkında sık sorulan soruların yanıtlarını oku.",
    notFoundTitle: "Sayfa bulunamadı",
    ogAlt: "Postsight: X gönderilerini kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula.",
    ogLine: "Kendi Claude, OpenAI ya da DeepSeek anahtarınla araştır, özetle, çevir; gönderideki cüzdanların arkasında kim olduğunu gör.",
  },
  nav: {
    skip: "İçeriğe geç",
    main: "Ana menü",
    features: "Özellikler",
    install: "Kurulum",
    privacy: "Gizlilik",
    support: "Destek",
    download: "Chrome'a ekle",
    theme: "Koyu tema",
    otherLang: "EN",
    otherLangName: "English",
  },
  hero: {
    eyebrow: "X için tarayıcı eklentisi · Chrome ve Edge",
    title: "X gönderilerini doğrula.",
    lead: "Postsight, X'teki her gönderiye mor bir AI rozeti ekler. Tıkla; gönderiyi kendi Claude, OpenAI ya da DeepSeek anahtarınla doğrula, araştır, özetle, çevir ya da açıkla ve her yanıtın maliyetini gör. Gönderideki bir cüzdan adresinin üzerine gel, arkasında kim olduğunu gör.",
    store: "Chrome'a ekle",
    download: "Son sürümü indir",
    facts: ["MIT lisansı", "Hesap yok", "Takip yok", "12 dil"],
    shotAlt:
      "Postsight ayarlarındaki Otomatik yönlendirme sayfası: strateji, kayıtlı anahtarlarla sağlayıcı sırası ve Otomatik modun her işlem için seçtiği model ile tahmini maliyeti.",
  },
  actions: {
    eyebrow: "01 — Her gönderide",
    title: "AI rozeti ne yapar",
    lead: "Herhangi bir gönderide rozete tıkla ve ihtiyacın olanı seç. Her işlem gönderinin tamamını görür: flood, alıntılanan gönderi, anket, topluluk notu ve görseller.",
    badgeNote: "Her gönderide, Grok ve Daha fazla menüsünün yanında",
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
  },
  reads: {
    eyebrow: "03 — Bağlam ve diller",
    title: "Gönderinin gösterdiğini okur",
    lead: "Sadece bağlantıdan oluşan bir gönderi başlığına göre değerlendirilmez. Postsight X Makalelerini X'in herkese açık gönderi sayfasından, izin verirsen gönderinin bağlantı verdiği haber ve blog sayfalarını da okur. Sayfalar çerezlerin olmadan çekilir.",
    langTitle: "12 dil",
    langLead: "Arayüz ve yanıtlar için. Çeviri senin diline yapılır; gönderi zaten senin dilindeyse ikinci diline.",
  },
  wallets: {
    eyebrow: "04 — Cüzdan kartları",
    title: "Gönderideki adresin arkasında kim var",
    lead: "Cüzdan kartlarını açınca gönderideki her 0x adresi ve .eth ismi kesik çizgiyle işaretlenir. Üzerine gel; isimlerini, profillerini, itibarını ve güvenlik uyarılarını, token ise market verisini, test alım-satımını ve deployer'ını gör. Yalnızca herkese açık kaynaklar, anahtar gerekmez; üzerine gelene kadar hiçbir şey gönderilmez.",
    authorTitle: "Gönderinin yazarıyla karşılaştırılır",
    author: "Kart; cüzdanın isimleri, tokenın listelediği X hesabı ya da deployer cüzdanının ismi gönderinin yazarını gösteriyorsa bunu, başka birini gösteriyorsa onu söyler. Büyük-küçük harfleri checksum'la uyuşmayan bir adres için her şeyden önce uyarı çıkar.",
    claims: "İsimler, profil bağlantıları ve tokenın listelediği hesaplar sahiplerinin yayımladığı iddialardır: eşleşme bir ipucudur, kanıt değildir.",
    check: "Kartın gösterdiği",
    source: "Kaynak",
    groups: [
      {
        title: "Her adres",
        rows: [
          ["İki yönde kontrol edilen isimler ve kayıtları", "Ethereum'da ENS, Base'de Basenames"],
          ["Bakiye ve işlemler", "Herkese açık Ethereum ve Base node'ları"],
          ["Bağlı profiller", "İsim kayıtları, web3.bio"],
          ["Değerlendirmeler ve doğrulama", "Ethos, Base'de Coinbase doğrulaması"],
          ["Güvenlik uyarıları", "GoPlus"],
        ],
      },
      {
        title: "Tokenlar",
        rows: [
          ["Fiyat, likidite, market cap, volume, ücretli listelemeler", "DexScreener"],
          ["Skor, top holder'lar, ekibin bağlantıları", "GeckoTerminal"],
          ["Gerçek fee'lerle test alım-satımı", "Honeypot.is"],
          ["Kontrat kontrolleri", "GoPlus"],
          ["Deployer", "Clanker, Blockscout, GoPlus, GeckoTerminal"],
        ],
      },
      {
        title: "Kendi explorer anahtarınla (isteğe bağlı)",
        rows: [
          ["Her zincirde deployer, verified kontrat adı", "Etherscan ya da Blockscout PRO"],
          ["Cüzdanın ilk işlem tarihi", "Etherscan"],
        ],
      },
    ],
  },
  privacy: {
    eyebrow: "05 — Gizlilik",
    title: "Anahtarların tarayıcında kalır",
    lead: "Postsight sunucusu, hesap, analitik ve reklam yoktur. Bir gönderi yalnızca onun üzerinde bir işlem çalıştırdığında ve yalnızca seçtiğin sağlayıcıya gider.",
    facts: [
      { label: "Anahtarlar", text: "Bu cihazda eklentinin yerel deposunda tutulur, senkronlanmaz. x.com'daki betik onları okuyamaz." },
      { label: "İstekler", text: "Kendi anahtarınla doğrudan api.anthropic.com, api.openai.com ya da api.deepseek.com adresine gider." },
      { label: "Sayfalar ve cüzdanlar", text: "X Makaleleri, kısa bağlantılar ve bağlantılı sayfalar çerezlerin olmadan çekilir. Cüzdan kartları yalnızca üzerine geldiğin adresi gönderir." },
      { label: "İşlemler", text: "Postsight paylaşmaz, beğenmez, yanıtlamaz, takip etmez. Yanıt önerileri kopyaladığın taslaklardır." },
    ],
    link: "Gizlilik politikasını oku",
    shotAlt:
      "Sağlayıcılar ayar sayfası: Save key ve Test butonlu API anahtarı alanı, USD cinsinden aylık bütçe ve her seviye için kullanılan model.",
  },
  install: {
    eyebrow: "06 — Kurulum",
    title: "Chrome ya da Edge'e ekle",
    lead: "Postsight ücretsizdir ve MIT lisanslı açık kaynaktır. Seni güncel tutan Chrome Web Mağazası'ndan kur, sürüm zip'ini yükle ya da kendin derle.",
    storeTitle: "Chrome Web Mağazası'ndan",
    storeSteps: (storeUrl) => [
      `[Chrome Web Mağazası'ndaki Postsight sayfasını](${storeUrl}) aç ve **Chrome'a ekle**'ye bas.`,
      "Edge'de, Edge sorduğunda diğer mağazalardan uzantılara izin ver, sonra aynı şekilde ekle.",
      `Ayarlar sayfası açılır. Bir Claude, OpenAI ya da DeepSeek anahtarı yapıştır ve **${trUi["prov.save"]}** düğmesine bas; Postsight anahtarı dener ve model listesini yükler.`,
      "Artık x.com'da her gönderide Grok ve Daha fazla menüsünün yanında Postsight merceğiyle mor bir **AI** rozeti var.",
    ],
    storeFoot: "Mağaza yeni sürümleri kendisi kurar.",
    releaseTitle: "Son sürümden",
    releaseSteps: (version, releaseUrl) => [
      `[Son sürümden](${releaseUrl}) \`postsight-${version}.zip\` dosyasını indir.`,
      "Zip dosyasını aç.",
      "`chrome://extensions` ya da `edge://extensions` sayfasını aç ve **Geliştirici modu** anahtarını aç.",
      "**Paketlenmemiş öğe yükle** düğmesine bas ve açtığın klasörü seç.",
      `Ayarlar sayfası açılır. Bir Claude, OpenAI ya da DeepSeek anahtarı yapıştır ve **${trUi["prov.save"]}** düğmesine bas; Postsight anahtarı dener ve model listesini yükler.`,
      "Artık x.com'da her gönderide Grok ve Daha fazla menüsünün yanında Postsight merceğiyle mor bir **AI** rozeti var.",
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
    store: "Chrome Web Mağazası",
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

/** The help questions and answers from the extension's Help section (the eighth is about wallet cards). */
export function faq(lang: Lang): { q: string; a: string }[] {
  const ui = COPY[lang].ui;
  const n = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  return n.map((i) => ({ q: ui[`help.q${i}` as const], a: ui[`help.a${i}` as const] }));
}

export const ACTION_IDS: readonly ActionId[] = ["verify", "research", "summarize", "translate", "explain", "reply", "ask", "copy"];

/** Action names exactly as the extension's menu shows them. */
export function actionName(lang: Lang, id: ActionId): string {
  const ui = COPY[lang].ui;
  return id === "copy" ? ui["menu.copy"] : ui[`action.${id}` as const];
}
