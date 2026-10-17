import { formatPercent } from "./format";
import type { UiLang } from "./languages";

/*
 * Wallet cards: hover an address or an ENS / Basename in a post and see who is behind
 * it. This module is the contract between the x.com script and the service worker,
 * plus the pure helpers both sides use. Everything a card shows comes from public,
 * keyless sources; names, links and profiles are claims their owner published.
 */

export type Hex = `0x${string}`;

export const WALLET_PORT = "postsight-wallet";

/** The hosts every card needs: names, balances, profiles, reputation, security and markets. */
export const CORE_ORIGINS = [
  "https://ethereum-rpc.publicnode.com/*",
  "https://eth.drpc.org/*",
  "https://mainnet.base.org/*",
  "https://base-rpc.publicnode.com/*",
  "https://api.web3.bio/*",
  "https://api.ethos.network/*",
  "https://base.easscan.org/*",
  "https://api.gopluslabs.io/*",
  "https://api.dexscreener.com/*",
];

/**
 * Token sources added after the first wallet cards: a reader who allowed only the core
 * hosts keeps working cards, without these sections, until they allow these too.
 */
export const TOKEN_ORIGINS = ["https://api.geckoterminal.com/*", "https://api.honeypot.is/*", "https://eth.blockscout.com/*", "https://www.clanker.world/*"];

/** Every host a lookup talks to, asked for together as one optional permission. */
export const WALLET_ORIGINS = [...CORE_ORIGINS, ...TOKEN_ORIGINS];

export const WALLET_HOSTS = WALLET_ORIGINS.map((o) => o.replace(/^https:\/\//, "").replace(/\/\*$/, ""));

export interface WalletMatch {
  start: number;
  end: number;
  /** The address as written, or the name in lower case. */
  value: string;
  kind: "address" | "name";
}

const ADDRESS = /(?<![0-9A-Za-z])0x[0-9a-fA-F]{40}(?![0-9A-Za-z])/g;
// Labels of letters, digits and inner hyphens ending in .eth; not part of a longer host
// (vitalik.eth.limo), an e-mail address or a path.
const NAME = /(?<![\w.@/-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth(?![\w-]|\.[a-z0-9])/gi;

/** Addresses and .eth names in a piece of text, in reading order. */
export function findWallets(text: string): WalletMatch[] {
  const out: WalletMatch[] = [];
  for (const m of text.matchAll(ADDRESS)) out.push({ start: m.index, end: m.index + m[0].length, value: m[0], kind: "address" });
  for (const m of text.matchAll(NAME)) {
    const labels = m[0].toLowerCase().split(".");
    // A .eth name needs at least three characters before .eth (so "e.g.eth" or "a.eth" are not names).
    if ((labels[labels.length - 2] ?? "").length < 3) continue;
    out.push({ start: m.index, end: m.index + m[0].length, value: m[0].toLowerCase(), kind: "name" });
  }
  return out.sort((a, b) => a.start - b.start);
}

export function isAddress(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function shortAddress(address: string): string {
  return isAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

/**
 * The first seven run for every address. The token sections start once DexScreener
 * finds the address trading, and "creator" once the address turns out to be a contract.
 */
export type WalletSection = "names" | "chains" | "profiles" | "ethos" | "coinbase" | "flags" | "token" | "security" | "market" | "simulation" | "orders" | "launchpad" | "creator" | "explorer";
export const WALLET_SECTIONS: readonly WalletSection[] = ["names", "chains", "profiles", "ethos", "coinbase", "flags", "token"];

/** Who answers each section, for the "did not answer" line. */
export const SECTION_SOURCE: Record<WalletSection, string> = {
  names: "ENS",
  chains: "RPC",
  profiles: "web3.bio",
  ethos: "Ethos",
  coinbase: "EAS",
  flags: "GoPlus",
  token: "DexScreener",
  security: "GoPlus",
  market: "GeckoTerminal",
  simulation: "Honeypot.is",
  orders: "DexScreener",
  launchpad: "Clanker",
  creator: "Blockscout",
  explorer: "Etherscan",
};

export type ChainId = "ethereum" | "base";

export interface ChainFact {
  chain: ChainId;
  /** Native balance in wei, as a decimal string (JSON has no bigint). */
  balanceWei: string;
  txCount: number;
  /**
   * "delegated" is an ordinary wallet running EIP-7702 smart-account code; "smart" is a
   * smart-account proxy (Coinbase Smart Wallet, Safe).
   */
  code: "none" | "contract" | "delegated" | "smart";
}

export interface ProfileLink {
  platform: string;
  handle: string;
  url?: string;
  followers?: number;
}

export interface EthosFact {
  score: number;
  /** A person set up an Ethos profile; otherwise Ethos only knows the address. */
  profiled: boolean;
  humanVerified: boolean;
  url?: string;
  reviews: { positive: number; neutral: number; negative: number };
  vouches: number;
}

export interface CoinbaseFact {
  /** ISO 3166-1 alpha-2, when Coinbase attested a country too. */
  country?: string;
}

export type SignalLevel = "danger" | "warning" | "ok" | "info";

export interface Signal {
  key: string;
  level: SignalLevel;
  value?: string;
}

export interface TokenFact {
  name?: string;
  symbol?: string;
  /** DexScreener's chain slug (ethereum, base, bsc, ...). */
  chain: string;
  priceUsd?: number;
  liquidityUsd?: number;
  marketCapUsd?: number;
  fdvUsd?: number;
  volume24hUsd?: number;
  /** Unix ms the oldest listed pair was created. */
  createdAt?: number;
  pairs: number;
  url?: string;
  /** GoPlus token checks; undefined while unknown, [] when GoPlus had nothing to say. */
  signals?: Signal[];
  holders?: number;
  /** The token's own links, as its team listed them on DexScreener, GeckoTerminal or Clanker. */
  socials?: TokenSocials;
  /** GeckoTerminal's 0-100 score from pool, trading, age, info and holder spread. */
  gtScore?: number;
  /** Percent of the supply the ten largest holders own. */
  top10?: number;
  /** A test buy and sell; null when there is no pool Honeypot.is can trade against. */
  simulation?: Simulation | null;
  /** DexScreener orders the team paid for and DexScreener approved. */
  paid?: string[];
  launchpad?: { name: string; url: string };
}

export interface TokenSocials {
  /** X handles, first listed first; teams sometimes list different ones in different places. */
  x: string[];
  website?: string;
  telegram?: string;
  discord?: string;
  farcaster?: string;
}

export interface Simulation {
  honeypot: boolean;
  /** Percentages, 0-100. */
  buyTax?: number;
  sellTax?: number;
  transferTax?: number;
}

export interface CreatorFact {
  address: Hex;
  /** Created by a launchpad or factory contract rather than by a person's wallet. */
  factory: boolean;
  names: NameFact[];
  /** The X account the creator's primary name lists. */
  x?: string;
  /** Percent of the supply the creator holds. */
  percent?: number;
  source: string;
  /** The factory contract the creator deployed through, when Etherscan knows it. */
  via?: Hex;
}

/** What Etherscan knows about a contract's code (with the reader's own key). */
export interface ContractFact {
  verified: boolean;
  /** The contract name in the verified source. */
  name?: string;
  proxy: boolean;
  implementation?: Hex;
}

export interface NameFact {
  name: string;
  source: "ens" | "basename";
}

export const TEXT_KEYS = ["com.twitter", "com.github", "org.telegram", "com.discord", "url", "description"] as const;
export type TextKey = (typeof TEXT_KEYS)[number];

export interface WalletCard {
  /** What was hovered: the address as written or the name in lower case. */
  query: string;
  address: Hex | null;
  /** Mixed-case address whose letters do not match its checksum: likely mistyped or altered. */
  checksumMismatch: boolean;
  /** A name that points to no address. */
  unresolved: boolean;
  /** Primary names, each checked in both directions. */
  names: NameFact[];
  texts: Partial<Record<TextKey, string>>;
  chains: ChainFact[];
  profiles: ProfileLink[];
  ethos?: EthosFact;
  coinbase?: CoinbaseFact;
  /** GoPlus address flags; [] once checked with nothing found. */
  flags?: Signal[];
  /** null once DexScreener listed no trading pairs. */
  token?: TokenFact | null;
  /** Who deployed the contract; null once looked for and not found. */
  creator?: CreatorFact | null;
  /** The contract's verified source, from Etherscan with the reader's key. */
  contract?: ContractFact | null;
  /** Unix ms the address first took part in a transaction, per chain (Etherscan, reader's key). */
  firstSeen?: { chain: ChainId; ts: number }[];
  pending: WalletSection[];
  failed: WalletSection[];
}

export interface WalletRequest {
  query: string;
}

export type WalletEvent = { type: "card"; card: WalletCard } | { type: "error"; code: "permission" | "unknown" };

export function emptyCard(query: string): WalletCard {
  return {
    query,
    address: isAddress(query) ? query : null,
    checksumMismatch: false,
    unresolved: false,
    names: [],
    texts: {},
    chains: [],
    profiles: [],
    pending: [...WALLET_SECTIONS],
    failed: [],
  };
}

/** An X handle from a text record or profile link: "@name", "name", "https://x.com/name". */
export function xHandle(raw: string | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/^@/, "");
  // A link counts only when it is a profile: one path segment, not /i/..., /search or /home.
  const link = value.match(/^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)\/?(?:[?#].*)?$/i);
  const handle = link ? (link[1] ?? "") : value;
  if (/^(i|home|search|explore|intent|share|hashtag|settings|messages|notifications)$/i.test(handle)) return null;
  return /^[A-Za-z0-9_]{1,15}$/.test(handle) ? handle : null;
}

/** X accounts the wallet's names and profiles point to, first one first. */
export function xAccounts(card: Pick<WalletCard, "texts" | "profiles">): string[] {
  const found: string[] = [];
  const add = (raw: string | undefined) => {
    const handle = xHandle(raw);
    if (handle && !found.some((f) => f.toLowerCase() === handle.toLowerCase())) found.push(handle);
  };
  add(card.texts["com.twitter"]);
  for (const p of card.profiles) if (p.platform === "twitter" || p.platform === "x") add(p.handle);
  return found;
}

/**
 * Whether the wallet's own records name the post's author. It is one-directional: the
 * owner of a name wrote that link, X did not confirm it.
 */
export function authorLink(card: Pick<WalletCard, "texts" | "profiles">, author: string | null): { handle: string; own: boolean } | null {
  const accounts = xAccounts(card);
  if (!author || !accounts.length) return null;
  const own = accounts.find((a) => a.toLowerCase() === author.toLowerCase());
  return own ? { handle: own, own: true } : { handle: accounts[0] ?? "", own: false };
}

export type TokenLink = { kind: "token-own" | "creator-own" | "token-other"; handle: string };

/**
 * A token measured against the post's author: is the author the X account the token's
 * team listed, or the one the creator wallet's name lists? Both are claims made by
 * the team or the creator, not checks by X.
 */
export function tokenAuthorLink(card: Pick<WalletCard, "token" | "creator">, author: string | null): TokenLink | null {
  if (!author) return null;
  const same = (h?: string) => !!h && h.toLowerCase() === author.toLowerCase();
  const listed = card.token?.socials?.x ?? [];
  const own = listed.find(same);
  if (own) return { kind: "token-own", handle: own };
  if (card.creator?.x && same(card.creator.x)) return { kind: "creator-own", handle: card.creator.x };
  return listed[0] ? { kind: "token-other", handle: listed[0] } : null;
}

/** The token team's links as chips: X accounts, website, Telegram, Discord, Farcaster. */
export function tokenChips(socials: TokenSocials | undefined): ProfileLink[] {
  if (!socials) return [];
  const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
  const out: ProfileLink[] = socials.x.map((handle) => ({ platform: "twitter", handle }));
  if (socials.website) out.push({ platform: "website", handle: socials.website });
  for (const platform of ["telegram", "discord", "farcaster"] as const) {
    const url = socials[platform];
    if (url) out.push({ platform, handle: bare(url), url });
  }
  return out.slice(0, 8);
}

/** The kind of thing the address is, from what is known so far. */
export function walletKind(card: Pick<WalletCard, "chains" | "token">): "wallet" | "contract" | "token" | null {
  if (card.token) return "token";
  if (card.chains.some((c) => c.code === "contract")) return "contract";
  return card.chains.length ? "wallet" : null;
}

/** Wei to a short number of ether: four significant decimals at most, "<0.0001" below that. */
export function weiToEth(wei: string): { value: number; tiny: boolean } {
  let n: bigint;
  try {
    n = BigInt(wei);
  } catch {
    return { value: 0, tiny: false };
  }
  if (n === 0n) return { value: 0, tiny: false };
  const whole = n / 10n ** 18n;
  const frac = Number(n % 10n ** 18n) / 1e18;
  const value = Number(whole) + frac;
  return { value, tiny: value < 0.0001 };
}

/** Names of the services that did not answer, each once. */
export function failedSources(card: Pick<WalletCard, "failed">): string[] {
  return [...new Set(card.failed.map((s) => SECTION_SOURCE[s]))];
}

/** Plain-text facts for the model when the reader asks Postsight to research a wallet. */
export function walletFacts(card: WalletCard, author: string | null): string {
  const lines: string[] = [`address: ${card.address ?? "unresolved"}`];
  if (card.query !== card.address) lines.push(`written in the post as: ${card.query}`);
  if (card.checksumMismatch) lines.push("warning: the address's letter case does not match its checksum");
  for (const n of card.names) lines.push(`primary ${n.source === "basename" ? "Basename" : "ENS name"}: ${n.name} (checked both ways)`);
  for (const [key, value] of Object.entries(card.texts)) lines.push(`text record ${key}: ${value}`);
  for (const seen of card.firstSeen ?? []) lines.push(`first transaction on ${seen.chain}: ${new Date(seen.ts).toISOString().slice(0, 10)}`);
  if (card.contract) lines.push(card.contract.verified ? `verified contract source: ${card.contract.name ?? "unnamed"}${card.contract.proxy ? " (a proxy)" : ""}` : "contract source not verified on Etherscan");
  for (const c of card.chains) {
    const eth = weiToEth(c.balanceWei);
    const code = { none: "no code", delegated: "EIP-7702 delegated wallet", smart: "smart-account proxy (Coinbase Smart Wallet or Safe)", contract: "contract" }[c.code];
    lines.push(`${c.chain}: ${eth.tiny ? "<0.0001" : eth.value} ETH, ${c.txCount} sent transactions, ${code}`);
  }
  for (const p of card.profiles) lines.push(`profile ${p.platform}: ${p.handle}${p.followers !== undefined ? ` (${p.followers} followers)` : ""}`);
  const link = authorLink(card, author);
  if (link) lines.push(link.own ? `its records name the post's author @${link.handle} on X` : `its records name @${link.handle} on X, not the post's author @${author}`);
  if (card.ethos) lines.push(`Ethos score ${card.ethos.score}${card.ethos.profiled ? " (profile)" : " (no profile)"}, reviews +${card.ethos.reviews.positive}/-${card.ethos.reviews.negative}, vouches ${card.ethos.vouches}`);
  if (card.coinbase) lines.push(`Coinbase verified account attestation on Base${card.coinbase.country ? `, country ${card.coinbase.country}` : ""}`);
  if (card.flags) lines.push(card.flags.length ? `GoPlus address flags: ${card.flags.map((f) => f.key).join(", ")}` : "GoPlus: no address flags");
  if (card.token) {
    const tk = card.token;
    lines.push(`token ${tk.name ?? ""} (${tk.symbol ?? "?"}) on ${tk.chain}: price ${tk.priceUsd ?? "?"} USD, liquidity ${tk.liquidityUsd ?? "?"} USD, market cap ${tk.marketCapUsd ?? "?"} USD, FDV ${tk.fdvUsd ?? "?"} USD, ${tk.pairs} pairs${tk.createdAt ? `, first pair ${new Date(tk.createdAt).toISOString().slice(0, 10)}` : ""}`);
    if (tk.signals?.length) lines.push(`GoPlus token checks: ${tk.signals.map((s) => `${s.key}=${s.level}${s.value ? ` (${s.value})` : ""}`).join(", ")}`);
    if (tk.socials?.x.length) lines.push(`X accounts the token's team listed: ${tk.socials.x.map((h) => `@${h}`).join(", ")}`);
    if (tk.socials?.website) lines.push(`token website: ${tk.socials.website}`);
    if (tk.gtScore !== undefined) lines.push(`GeckoTerminal score: ${Math.round(tk.gtScore)}/100`);
    if (tk.top10 !== undefined) lines.push(`top 10 holders own ${tk.top10.toFixed(1)}% of the supply`);
    if (tk.simulation) {
      const s = tk.simulation;
      lines.push(`Honeypot.is test trade: ${s.honeypot ? "the sell failed (honeypot)" : "buy and sell went through"}, buy tax ${s.buyTax ?? "?"}%, sell tax ${s.sellTax ?? "?"}%, transfer tax ${s.transferTax ?? "?"}%`);
    } else if (tk.simulation === null) lines.push("Honeypot.is found no pool it can test-trade against");
    if (tk.paid?.length) lines.push(`paid DexScreener orders: ${tk.paid.join(", ")}`);
    if (tk.launchpad) lines.push(`launched on ${tk.launchpad.name}`);
  } else if (card.token === null) lines.push("no DEX trading pairs on DexScreener");
  if (card.creator) {
    const c = card.creator;
    lines.push(`contract created by ${c.address}${c.factory ? " (a factory or launchpad contract)" : ""}${c.via ? ` through factory ${c.via}` : ""} (source: ${c.source})${c.names.length ? `, primary name ${c.names.map((n) => n.name).join(", ")}` : ""}${c.x ? `, whose name lists @${c.x} on X` : ""}${c.percent !== undefined ? `, holding ${c.percent.toFixed(2)}% of the supply` : ""}`);
  }
  const tokenLink = tokenAuthorLink(card, author);
  if (tokenLink) {
    lines.push(
      tokenLink.kind === "token-own"
        ? `the post's author @${tokenLink.handle} is an X account the token's team listed`
        : tokenLink.kind === "creator-own"
          ? `the creator wallet's name lists @${tokenLink.handle}, the post's author`
          : `the token's team lists @${tokenLink.handle} on X, not the post's author @${author}`,
    );
  }
  const silent = failedSources(card);
  if (silent.length) lines.push(`sources that did not answer: ${silent.join(", ")}`);
  return lines.join("\n");
}

/** Profile chips for the card: the name's own text records first, then web3.bio's links. */
export function profileChips(card: Pick<WalletCard, "texts" | "profiles">): ProfileLink[] {
  const out: ProfileLink[] = [];
  // "https://vitalik.ca/" and "vitalik.ca" are the same website.
  const key = (p: ProfileLink) => (p.platform === "website" ? p.handle.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "") : p.handle).toLowerCase();
  const add = (p: ProfileLink) => {
    if (!p.handle) return;
    const same = out.find((o) => o.platform === p.platform && key(o) === key(p));
    if (same) {
      same.followers ??= p.followers;
      same.url ??= p.url;
    } else out.push({ ...p });
  };
  const texts = card.texts;
  const x = xHandle(texts["com.twitter"]);
  if (x) add({ platform: "twitter", handle: x });
  const github = texts["com.github"]?.replace(/^https?:\/\/(www\.)?github\.com\//i, "").replace(/[/?#].*$/, "");
  if (github) add({ platform: "github", handle: github });
  const telegram = texts["org.telegram"]?.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "");
  if (telegram) add({ platform: "telegram", handle: telegram });
  if (texts["com.discord"]) add({ platform: "discord", handle: texts["com.discord"] });
  if (texts.url) add({ platform: "website", handle: texts.url });
  for (const p of card.profiles) add(p.platform === "twitter" ? { ...p, handle: xHandle(p.handle) ?? p.handle } : p);
  return out.slice(0, 8);
}

/** A safe https link for a chip, or none; handles come from records anyone can write. */
export function profileUrl(p: ProfileLink): string | undefined {
  if (p.url && /^https:\/\//i.test(p.url)) return p.url;
  switch (p.platform) {
    case "twitter":
      return /^[A-Za-z0-9_]{1,15}$/.test(p.handle) ? `https://x.com/${p.handle}` : undefined;
    case "github":
      return /^[A-Za-z0-9-]{1,39}$/.test(p.handle) ? `https://github.com/${p.handle}` : undefined;
    case "telegram":
      return /^[A-Za-z0-9_]{4,32}$/.test(p.handle) ? `https://t.me/${p.handle}` : undefined;
    case "website":
      if (/^https:\/\/[^\s]+$/i.test(p.handle)) return p.handle;
      return /^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(p.handle) ? `https://${p.handle}` : undefined;
    default:
      return undefined;
  }
}

const PAID_SIGNAL: Record<string, string> = { tokenProfile: "dex_profile", communityTakeover: "dex_cto", tokenAd: "dex_ad", trendingBarAd: "dex_trending" };
const taxLevel = (pct: number): Signal["level"] => (pct > 20 ? "danger" : pct > 5 ? "warning" : "ok");

/**
 * Every check on a token as one list: the test trade first, since it is measured
 * rather than read from the code, then GoPlus without the checks the trade already
 * answered, then what the team paid DexScreener for.
 */
export function tokenSignals(token: TokenFact, lang: UiLang): Signal[] {
  const sim = token.simulation;
  const out: Signal[] = [];
  if (sim) {
    out.push(sim.honeypot ? { key: "sim_honeypot", level: "danger" } : { key: "sim_ok", level: "ok" });
    if (sim.buyTax !== undefined) out.push({ key: "sim_buy_tax", level: taxLevel(sim.buyTax), value: formatPercent(sim.buyTax, lang) });
    if (sim.sellTax !== undefined) out.push({ key: "sim_sell_tax", level: taxLevel(sim.sellTax), value: formatPercent(sim.sellTax, lang) });
    if (sim.transferTax) out.push({ key: "sim_transfer_tax", level: taxLevel(sim.transferTax), value: formatPercent(sim.transferTax, lang) });
  }
  const answered = new Set(sim ? ["honeypot", "not_honeypot", "buy_tax", "sell_tax"] : []);
  out.push(...(token.signals ?? []).filter((s) => !answered.has(s.key)));
  for (const order of token.paid ?? []) if (PAID_SIGNAL[order]) out.push({ key: PAID_SIGNAL[order], level: "info" });
  const rank = { danger: 0, warning: 1, info: 2, ok: 3 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
