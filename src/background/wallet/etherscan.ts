import type { ContractFact, Hex } from "../../shared/wallet";
import { isAddress } from "../../shared/wallet";
import { getJson } from "./net";

/*
 * Etherscan V2 with the reader's own key: one key for every chain Etherscan indexes.
 * It answers what the keyless sources cannot everywhere: who sent the transaction that
 * created a contract (and through which factory), the contract's verified name, and
 * when an address first took part in a transaction.
 */

export const ETHERSCAN_ORIGIN = "https://api.etherscan.io/*";

/** Etherscan chain ids for DexScreener's chain slugs and the card's own chains. */
const CHAIN_ID: Record<string, number> = {
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
  celo: 42220,
  unichain: 130,
};

export const etherscanChain = (slug: string): number | undefined => CHAIN_ID[slug];

export class EtherscanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EtherscanError";
  }
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** "No transactions found" is an answer; "NOTOK" with a reason is an error. */
export function unwrap(raw: unknown): unknown {
  const r = obj(raw);
  if (r.status === "1") return r.result;
  const said = `${str(r.message) ?? ""} ${typeof r.result === "string" ? r.result : ""}`;
  if (/no (transactions|records|data) found/i.test(said)) return [];
  // The reason never carries the key; Etherscan echoes only its own message.
  throw new EtherscanError(str(r.result) ?? str(r.message) ?? "Etherscan error");
}

async function call(params: Record<string, string>, key: string, signal: AbortSignal): Promise<unknown> {
  const query = new URLSearchParams({ ...params, apikey: key });
  const raw = await getJson<unknown>(`https://api.etherscan.io/v2/api?${query}`, { signal });
  if (raw === null) throw new EtherscanError("Etherscan did not answer");
  return unwrap(raw);
}

export function normalizeCreation(result: unknown): { creator: Hex; factory?: Hex } | null {
  const first = obj(Array.isArray(result) ? result[0] : undefined);
  const creator = str(first.contractCreator);
  if (!creator || !isAddress(creator)) return null;
  const factory = str(first.contractFactory);
  return { creator, ...(factory && isAddress(factory) ? { factory } : {}) };
}

export function normalizeSource(result: unknown): ContractFact | null {
  const first = obj(Array.isArray(result) ? result[0] : undefined);
  if (!Object.keys(first).length) return null;
  const name = str(first.ContractName);
  const implementation = str(first.Implementation);
  return {
    verified: !!str(first.SourceCode),
    ...(name ? { name: name.slice(0, 80) } : {}),
    proxy: first.Proxy === "1",
    ...(implementation && isAddress(implementation) ? { implementation } : {}),
  };
}

/** Unix ms of the first listed transaction, or null when there is none. */
export function normalizeFirstTx(result: unknown): number | null {
  const first = obj(Array.isArray(result) ? result[0] : undefined);
  const seconds = Number(first.timeStamp);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

export async function contractCreation(chainId: number, address: Hex, key: string, signal: AbortSignal): Promise<{ creator: Hex; factory?: Hex } | null> {
  return normalizeCreation(await call({ chainid: String(chainId), module: "contract", action: "getcontractcreation", contractaddresses: address }, key, signal));
}

export async function contractSource(chainId: number, address: Hex, key: string, signal: AbortSignal): Promise<ContractFact | null> {
  return normalizeSource(await call({ chainid: String(chainId), module: "contract", action: "getsourcecode", address }, key, signal));
}

/**
 * When the address first took part in a transaction on a chain. An address that only
 * ever received tokens has no normal transactions, so its first token transfer counts.
 */
export async function firstActivity(chainId: number, address: Hex, key: string, signal: AbortSignal): Promise<number | null> {
  const first = { chainid: String(chainId), module: "account", address, startblock: "0", endblock: "99999999", page: "1", offset: "1", sort: "asc" };
  const tx = normalizeFirstTx(await call({ ...first, action: "txlist" }, key, signal));
  if (tx) return tx;
  return normalizeFirstTx(await call({ ...first, action: "tokentx" }, key, signal));
}

/** A cheap call that only a working key answers. */
export async function checkKey(key: string, signal: AbortSignal): Promise<void> {
  await call({ chainid: "1", module: "stats", action: "ethsupply" }, key, signal);
}
