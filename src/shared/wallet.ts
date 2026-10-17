/*
 * Wallet cards: hover an address or an ENS / Basename in a post and see who is behind
 * it. This module is the contract between the x.com script and the service worker,
 * plus the pure helpers both sides use. Everything a card shows comes from public,
 * keyless sources; names, links and profiles are claims their owner published.
 */

export type Hex = `0x${string}`;

export const WALLET_PORT = "postsight-wallet";

/** Every host a lookup talks to, asked for together as one optional permission. */
export const WALLET_ORIGINS = [
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

/** "security" (GoPlus token checks) runs inside "token", so it is never pending on its own. */
export type WalletSection = "names" | "chains" | "profiles" | "ethos" | "coinbase" | "flags" | "token" | "security";
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
  fdvUsd?: number;
  volume24hUsd?: number;
  /** Unix ms the oldest listed pair was created. */
  createdAt?: number;
  pairs: number;
  url?: string;
  /** GoPlus token checks; undefined while unknown, [] when GoPlus had nothing to say. */
  signals?: Signal[];
  holders?: number;
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
    lines.push(`token ${tk.name ?? ""} (${tk.symbol ?? "?"}) on ${tk.chain}: price ${tk.priceUsd ?? "?"} USD, liquidity ${tk.liquidityUsd ?? "?"} USD, FDV ${tk.fdvUsd ?? "?"} USD, ${tk.pairs} pairs${tk.createdAt ? `, first pair ${new Date(tk.createdAt).toISOString().slice(0, 10)}` : ""}`);
    if (tk.signals?.length) lines.push(`GoPlus token checks: ${tk.signals.map((s) => `${s.key}=${s.level}${s.value ? ` (${s.value})` : ""}`).join(", ")}`);
  } else if (card.token === null) lines.push("no DEX trading pairs on DexScreener");
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
