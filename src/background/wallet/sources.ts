import type { CoinbaseFact, EthosFact, Hex, ProfileLink, Signal, TokenFact } from "../../shared/wallet";
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

export function normalizeTokenSecurity(raw: unknown, address: Hex): { signals: Signal[]; holders?: number } | null {
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
  return { signals: s.sort((a, b) => order[a.level] - order[b.level]), holders };
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

export async function tokenSecurity(chain: string, address: Hex, signal: AbortSignal): Promise<{ signals: Signal[]; holders?: number } | null> {
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
  return {
    name: str(token.name)?.slice(0, 60),
    symbol: str(token.symbol)?.slice(0, 20),
    chain,
    priceUsd: asBase.length ? num(top.priceUsd) : undefined,
    liquidityUsd: onChain.reduce((sum, p) => sum + liquidity(p), 0) || undefined,
    fdvUsd: num(top.fdv),
    volume24hUsd: onChain.reduce((sum, p) => sum + (num(obj(p.volume).h24) ?? 0), 0) || undefined,
    createdAt: created.length ? Math.min(...created) : undefined,
    pairs: onChain.length,
    url: https(top.url),
  };
}

export async function dexToken(address: Hex, signal: AbortSignal): Promise<TokenFact | null> {
  return normalizeDexPairs(await getJson<unknown>(`https://api.dexscreener.com/latest/dex/tokens/${address.toLowerCase()}`, { signal }), address);
}
