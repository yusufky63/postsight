import { createPublicClient, encodePacked, fallback, http, keccak256, namehash, parseAbi, toBytes } from "viem";
import type { Transport } from "viem";
import { base, mainnet } from "viem/chains";
import type { ChainFact, ChainId, Hex, TextKey } from "../../shared/wallet";
import { TEXT_KEYS } from "../../shared/wallet";

/*
 * Public RPCs only, no keys. CCIP-read is off: a name whose resolver lives off chain
 * would send the lookup to a gateway chosen by that resolver, outside the hosts the
 * reader allowed, so such names simply do not resolve here.
 */

const rpc = (urls: string[]): Transport => fallback(urls.map((url) => http(url, { batch: true, timeout: 5000, retryCount: 1 })), { rank: false });

const clients = {
  ethereum: createPublicClient({ chain: mainnet, ccipRead: false, transport: rpc(["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"]) }),
  base: createPublicClient({ chain: base, ccipRead: false, transport: rpc(["https://mainnet.base.org", "https://base-rpc.publicnode.com"]) }),
};

const lower = (a: string) => a.toLowerCase() as Hex;

/** Missing resolvers, empty records and reverts all mean "no name", not a failure. */
const NO_RECORD = /revert|returned no data|resolver ?not ?(found|contract)|zero data|ResolverError|ReverseAddressMismatch/i;

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (NO_RECORD.test(String((e as Error)?.message ?? e))) return null;
    throw e;
  }
}

/* ---------- ENS (Ethereum) ---------- */

/** The address's primary ENS name, kept only when the name points back to the address. */
export async function ensPrimary(address: Hex): Promise<string | null> {
  const name = await orNull(clients.ethereum.getEnsName({ address }));
  if (!name) return null;
  const forward = await ensAddress(name);
  return forward && lower(forward) === lower(address) ? name : null;
}

export async function ensAddress(name: string): Promise<Hex | null> {
  const address = await orNull(clients.ethereum.getEnsAddress({ name }));
  return address && !/^0x0{40}$/.test(address) ? address : null;
}

export async function ensTexts(name: string): Promise<Partial<Record<TextKey, string>>> {
  const values = await Promise.all(TEXT_KEYS.map((key) => orNull(clients.ethereum.getEnsText({ name, key })).catch(() => null)));
  return collect(values);
}

/* ---------- Basenames (Base) ---------- */

const L2_RESOLVER: Hex = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
/** ENSIP-19 reverse registrar on Base, where primary Basenames are set since the 2025 migration. */
const L2_REVERSE: Hex = "0x0000000000D8e504002cC26E3Ec46D81971C1664";
const resolverAbi = parseAbi([
  "function name(bytes32 node) view returns (string)",
  "function addr(bytes32 node) view returns (address)",
  "function text(bytes32 node, string key) view returns (string)",
  "function nameForAddr(address addr) view returns (string)",
]);

/** The reverse node Basenames used before the migration ("80002105.reverse" is Base's coin type). */
export function legacyReverseNode(address: Hex): Hex {
  const addressNode = keccak256(toBytes(lower(address).slice(2)));
  return keccak256(encodePacked(["bytes32", "bytes32"], [namehash("80002105.reverse"), addressNode]));
}

export async function basenameAddress(name: string): Promise<Hex | null> {
  const address = await orNull(clients.base.readContract({ address: L2_RESOLVER, abi: resolverAbi, functionName: "addr", args: [namehash(name)] }));
  return address && !/^0x0{40}$/.test(address) ? address : null;
}

export async function basenamePrimary(address: Hex): Promise<string | null> {
  let name = await orNull(clients.base.readContract({ address: L2_REVERSE, abi: resolverAbi, functionName: "nameForAddr", args: [address] }));
  if (!name) name = await orNull(clients.base.readContract({ address: L2_RESOLVER, abi: resolverAbi, functionName: "name", args: [legacyReverseNode(address)] }));
  if (!name || !name.toLowerCase().endsWith(".base.eth")) return null;
  const forward = await basenameAddress(name);
  return forward && lower(forward) === lower(address) ? name.toLowerCase() : null;
}

export async function basenameTexts(name: string): Promise<Partial<Record<TextKey, string>>> {
  const node = namehash(name);
  const values = await Promise.all(
    TEXT_KEYS.map((key) => orNull(clients.base.readContract({ address: L2_RESOLVER, abi: resolverAbi, functionName: "text", args: [node, key] })).catch(() => null)),
  );
  return collect(values);
}

function collect(values: (string | null)[]): Partial<Record<TextKey, string>> {
  const out: Partial<Record<TextKey, string>> = {};
  TEXT_KEYS.forEach((key, i) => {
    const v = values[i]?.trim();
    if (v) out[key] = v.slice(0, 300);
  });
  return out;
}

/* ---------- Balances and code ---------- */

/**
 * Proxies that smart-account factories deploy for each user: Coinbase Smart Wallet
 * (Solady's ERC-1967 clone) and Safe (its proxy answers masterCopy() itself).
 */
const SMART_ACCOUNT_CODE = [
  /^0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3$/i,
  /^0x608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e/i,
];

/** EIP-7702: an ordinary account pointing at smart-account code carries 0xef0100 plus an address. */
export function codeKind(code: string | undefined): ChainFact["code"] {
  if (!code || code === "0x") return "none";
  if (/^0xef0100[0-9a-f]{40}$/i.test(code)) return "delegated";
  return SMART_ACCOUNT_CODE.some((re) => re.test(code)) ? "smart" : "contract";
}

export async function chainFact(chain: ChainId, address: Hex): Promise<ChainFact> {
  const client = clients[chain];
  const [balance, txCount, code] = await Promise.all([client.getBalance({ address }), client.getTransactionCount({ address }), client.getCode({ address })]);
  return { chain, balanceWei: balance.toString(), txCount, code: codeKind(code) };
}
