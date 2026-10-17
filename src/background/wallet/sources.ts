import type { CoinbaseFact, EthosFact, Hex, ProfileLink, Signal, Simulation, TokenFact, TokenSocials } from "../../shared/wallet";
import { isAddress, xHandle } from "../../shared/wallet";
import { getJson } from "./net";

/*
 * Keyless reputation, profile, security and market sources, ported from onchain-intel.
 * Each normalizer is pure and takes the raw JSON, so the tests run on recorded answers.
 */

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const https = (v: unknown): string | undefined => (typeof v === "string" && /^https:\/\//i.test(v) ? v : undefined);

/* ---------- web3.bio: names and the social links around them ---------- */

const PLATFORM_ORDER = ["twitter", "farcaster", "github", "lens", "website", "telegram", "discord"];

export function normalizeWeb3Bio(raw: unknown): ProfileLink[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfileLink[] = [];
  const add = (link: ProfileLink) => {
    if (!PLATFORM_ORDER.includes(link.platform)) return;
    const same = out.find((o) => o.platform === link.platform && o.handle.toLowerCase() === link.handle.toLowerCase());
    if (same) {
      same.followers ??= link.followers;
      same.url ??= link.url;
    } else out.push(link);
  };
  for (const identity of raw.map(obj)) {
    const platform = str(identity.platform);
    const handle = str(identity.identity);
    const social = obj(identity.social);
    // Farcaster and Lens entries are accounts in their own right, with follower counts.
    if (handle && (platform === "farcaster" || platform === "lens")) {
      add({
        platform,
        handle,
        url: platform === "farcaster" ? `https://farcaster.xyz/${encodeURIComponent(handle)}` : undefined,
        followers: num(social.follower),
      });
    }
    for (const [key, value] of Object.entries(obj(identity.links))) {
      const l = obj(value);
      const linkHandle = str(l.handle);
      if (linkHandle) add({ platform: key === "x" ? "twitter" : key, handle: linkHandle.slice(0, 80), url: https(l.link) });
    }
  }
  return out.sort((a, b) => PLATFORM_ORDER.indexOf(a.platform) - PLATFORM_ORDER.indexOf(b.platform)).slice(0, 8);
}

export async function web3bioProfiles(address: Hex, signal: AbortSignal): Promise<ProfileLink[]> {
  return normalizeWeb3Bio(await getJson<unknown>(`https://api.web3.bio/profile/${address.toLowerCase()}`, { signal }));
}

/* ---------- Ethos: reviews and vouches ---------- */

export function normalizeEthos(raw: unknown): EthosFact | null {
  const u = obj(raw);
  const score = num(u.score);
  if (num(u.id) === undefined || score === undefined) return null;
  const stats = obj(u.stats);
  const received = obj(obj(stats.review).received);
  return {
    score,
    profiled: num(u.profileId) !== undefined,
    humanVerified: u.humanVerificationStatus === "VERIFIED",
    url: https(obj(u.links).profile),
    reviews: { positive: num(received.positive) ?? 0, neutral: num(received.neutral) ?? 0, negative: num(received.negative) ?? 0 },
    vouches: num(obj(obj(stats.vouch).received).count) ?? 0,
  };
}

export async function ethosUser(address: Hex, signal: AbortSignal): Promise<EthosFact | null> {
  // Ethos asks every client to name itself; untagged requests may be rate limited harder.
  const raw = await getJson<unknown>(`https://api.ethos.network/api/v2/user/by/address/${address.toLowerCase()}`, {
    signal,
    headers: { "X-Ethos-Client": `postsight@${__POSTSIGHT_VERSION__}` },
  });
  return normalizeEthos(raw);
}

/* ---------- Coinbase Verifications (EAS attestations on Base) ---------- */

const COINBASE_ATTESTER = "0x357458739f90461b99789350868cd7cf330dd7ee";
const SCHEMA_ACCOUNT = "0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9";
const SCHEMA_COUNTRY = "0x1801901fabd0e6189356b4fb52bb0ab855276d84f7ec140839fbd1f6801ca065";
const EAS_QUERY =
  "query CbVerif($recipient: String!, $schemas: [String!]) { attestations(where: { recipient: { equals: $recipient }, schemaId: { in: $schemas }, revoked: { equals: false } }, orderBy: [{ time: desc }], take: 10) { schemaId attester revoked expirationTime decodedDataJson } }";

/** decodedDataJson is a JSON string of [{ name, value: { value } }]. */
function decodedValue(json: unknown): unknown {
  if (typeof json !== "string") return undefined;
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? obj(obj(parsed[0]).value).value : undefined;
  } catch {
    return undefined;
  }
}

/** `now` in unix seconds, the unit EAS uses. Null unless a live "verified account" attestation exists. */
export function normalizeCoinbase(raw: unknown, now = Math.floor(Date.now() / 1000)): CoinbaseFact | null {
  const list = obj(obj(raw).data).attestations;
  let verified = false;
  let country: string | undefined;
  const seen = new Set<string>();
  for (const a of Array.isArray(list) ? list.map(obj) : []) {
    // The attester check keeps a lookalike schema or an indexer slip out.
    if (str(a.attester)?.toLowerCase() !== COINBASE_ATTESTER || a.revoked === true) continue;
    const exp = num(a.expirationTime) ?? 0;
    if (exp !== 0 && exp <= now) continue;
    const schema = str(a.schemaId)?.toLowerCase();
    // Newest first: the first live attestation per schema is the current one.
    if (!schema || seen.has(schema)) continue;
    seen.add(schema);
    const value = decodedValue(a.decodedDataJson);
    if (schema === SCHEMA_ACCOUNT) verified = value === true;
    if (schema === SCHEMA_COUNTRY && typeof value === "string" && /^[a-z]{2}$/i.test(value.trim())) country = value.trim().toUpperCase();
  }
  return verified ? { country } : null;
}

export async function coinbaseVerification(address: Hex, signal: AbortSignal): Promise<CoinbaseFact | null> {
  const raw = await getJson<{ data?: unknown; errors?: unknown[] }>("https://base.easscan.org/graphql", {
    method: "POST",
    body: { query: EAS_QUERY, variables: { recipient: address.toLowerCase(), schemas: [SCHEMA_ACCOUNT, SCHEMA_COUNTRY] } },
    signal,
  });
  // GraphQL reports failures with HTTP 200; reading that as "not verified" would be wrong.
  if (!raw || raw.errors?.length || !raw.data) throw new Error("EAS query failed");
  return normalizeCoinbase(raw);
}

/* ---------- GoPlus: address and token security ---------- */

const flag = (v: unknown) => v === "1" || v === 1 || v === true;
/** GoPlus leaves fields it has not measured as "", which means unknown, not "no". */
const known = (v: unknown) => v !== undefined && v !== null && v !== "";

export const ADDRESS_FLAGS = [
  "cybercrime",
  "money_laundering",
  "financial_crime",
  "darkweb_transactions",
  "phishing_activities",
  "fake_kyc",
  "blacklist_doubt",
  "stealing_attack",
  "blackmail_activities",
  "sanctioned",
  "malicious_mining_activities",
  "mixer",
  "honeypot_related_address",
] as const;

export function normalizeAddressFlags(raw: unknown): Signal[] | null {
  const r = obj(raw);
  if (r.code !== undefined && r.code !== 1) return null;
  const result = obj(r.result);
  const out: Signal[] = ADDRESS_FLAGS.filter((k) => flag(result[k])).map((key) => ({ key, level: "danger" }));
  const created = num(result.number_of_malicious_contracts_created);
  if (created && created > 0) out.push({ key: "malicious_contracts_created", level: "danger", value: String(created) });
  return out;
}

export async function addressFlags(address: Hex, signal: AbortSignal): Promise<Signal[]> {
  const raw = await getJson<unknown>(`https://api.gopluslabs.io/api/v1/address_security/${address.toLowerCase()}?chain_id=1`, { signal });
  const flags = normalizeAddressFlags(raw);
  // No answer is not a clean bill; the card says GoPlus did not answer.
  if (!flags) throw new Error("GoPlus did not answer");
  return flags;
}

const percent = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;

export interface TokenSecurity {
  signals: Signal[];
  holders?: number;
  creator?: Hex;
  /** Percent of the supply the creator holds. */
  creatorPercent?: number;
}

export function normalizeTokenSecurity(raw: unknown, address: Hex): TokenSecurity | null {
  const r = obj(raw);
  if (r.code !== undefined && r.code !== 1) return null;
  const t = obj(obj(r.result)[address.toLowerCase()]);
  if (!Object.keys(t).length) return { signals: [] };
  const s: Signal[] = [];
  if (known(t.is_honeypot)) s.push(flag(t.is_honeypot) ? { key: "honeypot", level: "danger" } : { key: "not_honeypot", level: "ok" });
  for (const [field, key] of [
    ["buy_tax", "buy_tax"],
    ["sell_tax", "sell_tax"],
  ] as const) {
    const tax = num(t[field]);
    if (tax !== undefined) s.push({ key, level: tax > 0.2 ? "danger" : tax > 0.05 ? "warning" : "ok", value: percent(tax) });
  }
  if (flag(t.cannot_sell_all)) s.push({ key: "cannot_sell_all", level: "danger" });
  if (flag(t.cannot_buy)) s.push({ key: "cannot_buy", level: "danger" });
  if (known(t.is_open_source)) s.push(flag(t.is_open_source) ? { key: "open_source", level: "ok" } : { key: "closed_source", level: "warning" });
  if (flag(t.is_proxy)) s.push({ key: "proxy", level: "warning" });
  if (flag(t.is_mintable)) s.push({ key: "mintable", level: "warning" });
  if (flag(t.can_take_back_ownership)) s.push({ key: "take_back_ownership", level: "warning" });
  if (flag(t.hidden_owner)) s.push({ key: "hidden_owner", level: "danger" });
  if (flag(t.owner_change_balance)) s.push({ key: "owner_change_balance", level: "danger" });
  if (flag(t.selfdestruct)) s.push({ key: "selfdestruct", level: "danger" });
  if (flag(t.transfer_pausable)) s.push({ key: "transfer_pausable", level: "warning" });
  if (flag(t.is_blacklisted)) s.push({ key: "blacklist", level: "warning" });
  if (flag(t.slippage_modifiable)) s.push({ key: "tax_modifiable", level: "warning" });
  if (flag(t.is_airdrop_scam)) s.push({ key: "airdrop_scam", level: "danger" });
  const sameCreator = num(t.honeypot_with_same_creator);
  if (sameCreator && sameCreator > 0) s.push({ key: "creator_honeypots", level: "danger", value: String(sameCreator) });
  const lp = Array.isArray(t.lp_holders) ? t.lp_holders.map(obj) : [];
  let locked = 0;
  // Locked by a locker, or sent to the zero or dead address.
  for (const h of lp) if (flag(h.is_locked) || /^0x0{36}(dead|0000)$/i.test(str(h.address) ?? "") || /burn|dead/i.test(str(h.tag) ?? "")) locked += num(h.percent) ?? 0;
  // Only a reassurance: liquidity can be safe in ways GoPlus does not mark (held by the token itself, v3 positions).
  if (locked >= 0.5) s.push({ key: "lp_locked", level: locked > 0.8 ? "ok" : "info", value: percent(Math.min(1, locked)) });
  // A token GoPlus has not indexed reports "0" holders: unknown, not none.
  const holders = num(t.holder_count) || undefined;
  const order = { danger: 0, warning: 1, info: 2, ok: 3 } as const;
  const creator = str(t.creator_address);
  const creatorPercent = num(t.creator_percent);
  return {
    signals: s.sort((a, b) => order[a.level] - order[b.level]),
    holders,
    creator: creator && isAddress(creator) ? creator : undefined,
    creatorPercent: creatorPercent !== undefined ? creatorPercent * 100 : undefined,
  };
}

/** GoPlus chain ids for DexScreener's chain slugs. */
export const GOPLUS_CHAIN: Record<string, number> = {
  ethereum: 1,
  base: 8453,
  bsc: 56,
  arbitrum: 42161,
  polygon: 137,
  optimism: 10,
  avalanche: 43114,
  linea: 59144,
  scroll: 534352,
  blast: 81457,
  zksync: 324,
  mantle: 5000,
  sonic: 146,
};

export async function tokenSecurity(chain: string, address: Hex, signal: AbortSignal): Promise<TokenSecurity | null> {
  const id = GOPLUS_CHAIN[chain];
  if (!id) return null;
  const raw = await getJson<unknown>(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${address.toLowerCase()}`, { signal, timeoutMs: 8000 });
  const out = normalizeTokenSecurity(raw, address);
  if (!out) throw new Error("GoPlus did not answer");
  return out;
}

/* ---------- DexScreener: trading pairs on every chain ---------- */

export function normalizeDexPairs(raw: unknown, address: Hex): TokenFact | null {
  const pairs = (Array.isArray(obj(raw).pairs) ? (obj(raw).pairs as unknown[]) : []).map(obj);
  const a = address.toLowerCase();
  const asBase = pairs.filter((p) => str(obj(p.baseToken).address)?.toLowerCase() === a);
  const list = asBase.length ? asBase : pairs.filter((p) => str(obj(p.quoteToken).address)?.toLowerCase() === a);
  if (!list.length) return null;
  const liquidity = (p: Raw) => num(obj(p.liquidity).usd) ?? 0;
  list.sort((x, y) => liquidity(y) - liquidity(x));
  const top = list[0]!;
  const chain = str(top.chainId) ?? "";
  // Figures are for the chain with the deepest pool; the same address on another chain can be another token.
  const onChain = list.filter((p) => str(p.chainId) === chain);
  const token = obj(asBase.length ? top.baseToken : top.quoteToken);
  const created = onChain.map((p) => num(p.pairCreatedAt)).filter((v): v is number => v !== undefined && v > 0);
  // The team's links sit on whichever pair carries a paid or claimed profile.
  const info = obj(onChain.find((p) => p.info)?.info);
  const socials: TokenSocials = { x: [] };
  const website = (Array.isArray(info.websites) ? info.websites.map(obj) : []).map((w) => https(w.url)).find(Boolean);
  if (website) socials.website = website;
  for (const entry of Array.isArray(info.socials) ? info.socials.map(obj) : []) addSocial(socials, str(entry.type) ?? str(entry.platform), str(entry.url) ?? str(entry.handle));
  return {
    name: str(token.name)?.slice(0, 60),
    symbol: str(token.symbol)?.slice(0, 20),
    chain,
    priceUsd: asBase.length ? num(top.priceUsd) : undefined,
    liquidityUsd: onChain.reduce((sum, p) => sum + liquidity(p), 0) || undefined,
    marketCapUsd: num(top.marketCap),
    fdvUsd: num(top.fdv),
    volume24hUsd: onChain.reduce((sum, p) => sum + (num(obj(p.volume).h24) ?? 0), 0) || undefined,
    createdAt: created.length ? Math.min(...created) : undefined,
    pairs: onChain.length,
    url: https(top.url),
    ...(socials.x.length || socials.website || socials.telegram || socials.discord || socials.farcaster ? { socials } : {}),
  };
}

/** Adds one listed link, whatever the source calls the platform. */
export function addSocial(socials: TokenSocials, platform: string | undefined, value: string | undefined): void {
  if (!platform || !value) return;
  const p = platform.toLowerCase();
  if (p === "twitter" || p === "x") {
    const handle = xHandle(value);
    if (handle && !socials.x.some((h) => h.toLowerCase() === handle.toLowerCase())) socials.x.push(handle);
  } else if (p === "website") socials.website ??= https(value);
  else if (p === "telegram") socials.telegram ??= https(value) ?? (/^[A-Za-z0-9_]{4,32}$/.test(value) ? `https://t.me/${value}` : undefined);
  else if (p === "discord") socials.discord ??= https(value);
  else if (p === "farcaster" || p === "warpcast") socials.farcaster ??= https(value);
}

/** Fills the token's links from a second source without overwriting what the first one listed. */
export function mergeSocials(into: TokenSocials | undefined, more: TokenSocials): TokenSocials {
  const out: TokenSocials = into ? { ...into, x: [...into.x] } : { x: [] };
  for (const h of more.x) addSocial(out, "x", h);
  out.website ??= more.website;
  out.telegram ??= more.telegram;
  out.discord ??= more.discord;
  out.farcaster ??= more.farcaster;
  return out;
}

/* ---------- DexScreener orders: what the team paid for ---------- */

const ORDER_TYPES = ["tokenProfile", "communityTakeover", "tokenAd", "trendingBarAd"];

export function normalizeOrders(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : obj(raw).orders;
  const paid = (Array.isArray(list) ? list.map(obj) : []).filter((o) => o.status === "approved").map((o) => str(o.type) ?? "");
  return ORDER_TYPES.filter((t) => paid.includes(t));
}

export async function dexOrders(chain: string, address: Hex, signal: AbortSignal): Promise<string[]> {
  return normalizeOrders(await getJson<unknown>(`https://api.dexscreener.com/orders/v1/${chain}/${address}`, { signal }));
}

/* ---------- GeckoTerminal: score, holder spread, the team's links, the developer ---------- */

/** GeckoTerminal network ids for DexScreener's chain slugs. */
export const GECKO_NETWORK: Record<string, string> = {
  ethereum: "eth",
  base: "base",
  bsc: "bsc",
  arbitrum: "arbitrum",
  polygon: "polygon_pos",
  optimism: "optimism",
  avalanche: "avax",
  linea: "linea",
  scroll: "scroll",
  blast: "blast",
  zksync: "zksync",
  mantle: "mantle",
  sonic: "sonic",
  celo: "celo",
  unichain: "unichain",
};

export interface GeckoInfo {
  socials: TokenSocials;
  score?: number;
  top10?: number;
  holders?: number;
  developer?: Hex;
  developerPercent?: number;
}

export function normalizeGecko(raw: unknown): GeckoInfo | null {
  const a = obj(obj(obj(raw).data).attributes);
  if (!Object.keys(a).length) return null;
  const socials: TokenSocials = { x: [] };
  addSocial(socials, "x", str(a.twitter_handle));
  addSocial(socials, "website", (Array.isArray(a.websites) ? a.websites : []).map(str).find((w) => w && https(w)));
  addSocial(socials, "telegram", str(a.telegram_handle));
  addSocial(socials, "discord", str(a.discord_url));
  addSocial(socials, "farcaster", str(a.farcaster_url));
  const holders = obj(a.holders);
  const developer = str(a.developer_address);
  return {
    socials,
    score: num(a.gt_score),
    top10: num(obj(holders.distribution_percentage).top_10),
    holders: num(holders.count) || undefined,
    developer: developer && isAddress(developer) ? developer : undefined,
    developerPercent: num(a.developer_holding_percentage),
  };
}

export async function geckoInfo(chain: string, address: Hex, signal: AbortSignal): Promise<GeckoInfo | null> {
  const net = GECKO_NETWORK[chain];
  if (!net) return null;
  return normalizeGecko(await getJson<unknown>(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${address.toLowerCase()}/info`, { signal }));
}

/* ---------- Honeypot.is: a test buy and sell against the live pool ---------- */

const HONEYPOT_CHAIN: Record<string, number> = { ethereum: 1, bsc: 56, base: 8453 };
export const honeypotCovers = (chain: string) => chain in HONEYPOT_CHAIN;

export function normalizeHoneypot(raw: unknown): Simulation | null {
  const r = obj(raw);
  const result = obj(r.honeypotResult);
  // A simulation that could not run is no verdict either way.
  if (r.simulationSuccess !== true || typeof result.isHoneypot !== "boolean") return null;
  const sim = obj(r.simulationResult);
  return { honeypot: result.isHoneypot, buyTax: num(sim.buyTax), sellTax: num(sim.sellTax), transferTax: num(sim.transferTax) };
}

/** null when the token trades only where Honeypot.is cannot simulate (it answers 404 "pair not found"). */
export async function honeypotSimulation(chain: string, address: Hex, signal: AbortSignal): Promise<Simulation | null> {
  const id = HONEYPOT_CHAIN[chain];
  if (!id) return null;
  return normalizeHoneypot(await getJson<unknown>(`https://api.honeypot.is/v2/IsHoneypot?address=${address.toLowerCase()}&chainID=${id}`, { signal, timeoutMs: 12_000 }));
}

/* ---------- Clanker: the Base launchpad, and who asked it for the token ---------- */

export interface ClankerLaunch {
  deployer?: Hex;
  url: string;
  socials: TokenSocials;
}

export function normalizeClanker(raw: unknown, address: Hex): ClankerLaunch | null {
  const list = obj(raw).data;
  const t = (Array.isArray(list) ? list.map(obj) : []).find((x) => str(x.contract_address)?.toLowerCase() === address.toLowerCase());
  if (!t) return null;
  const socials: TokenSocials = { x: [] };
  for (const link of Array.isArray(t.socialLinks) ? t.socialLinks.map(obj) : []) addSocial(socials, str(link.name), str(link.link));
  const media = obj(t.metadata).socialMediaUrls;
  for (const link of Array.isArray(media) ? media.map(obj) : []) addSocial(socials, str(link.platform), str(link.url));
  // msg_sender is the wallet that asked Clanker for the token; the contract itself comes from Clanker's factory.
  const deployer = str(t.msg_sender) ?? str(t.admin);
  return { deployer: deployer && isAddress(deployer) ? deployer : undefined, url: `https://www.clanker.world/clanker/${address}`, socials };
}

export async function clankerLaunch(address: Hex, signal: AbortSignal): Promise<ClankerLaunch | null> {
  return normalizeClanker(await getJson<unknown>(`https://www.clanker.world/api/tokens?q=${address}`, { signal }), address);
}

/* ---------- Blockscout (Ethereum): who deployed a contract ---------- */

export function normalizeBlockscoutCreator(raw: unknown): Hex | null {
  const creator = str(obj(raw).creator_address_hash);
  return creator && isAddress(creator) ? creator : null;
}

export async function blockscoutCreator(address: Hex, signal: AbortSignal): Promise<Hex | null> {
  return normalizeBlockscoutCreator(await getJson<unknown>(`https://eth.blockscout.com/api/v2/addresses/${address}`, { signal }));
}

export async function dexToken(address: Hex, signal: AbortSignal): Promise<TokenFact | null> {
  return normalizeDexPairs(await getJson<unknown>(`https://api.dexscreener.com/latest/dex/tokens/${address.toLowerCase()}`, { signal }), address);
}
