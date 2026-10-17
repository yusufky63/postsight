import type { ContractFact, Hex } from "../../shared/wallet";
import { isAddress } from "../../shared/wallet";
import { getJson } from "./net";

/*
 * Blockscout PRO with the reader's own key: one key for 100+ chains, and not behind the
 * bot protection the public Base instance sits behind. It names who created a contract,
 * whether its source is verified, and what a proxy runs underneath.
 */

export const BLOCKSCOUT_PRO_ORIGIN = "https://api.blockscout.com/*";

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export interface BlockscoutAddress {
  creator?: Hex;
  /** Set for contracts only. */
  contract?: ContractFact;
}

export function normalizeBlockscoutAddress(raw: unknown): BlockscoutAddress | null {
  const a = obj(raw);
  if (!Object.keys(a).length) return null;
  const creator = str(a.creator_address_hash);
  const out: BlockscoutAddress = creator && isAddress(creator) ? { creator } : {};
  if (a.is_contract === true) {
    const name = str(a.name);
    const impl = (Array.isArray(a.implementations) ? a.implementations : []).map(obj)[0];
    const implAddress = str(impl?.address_hash) ?? str(impl?.address);
    const implName = str(impl?.name);
    out.contract = {
      verified: a.is_verified === true,
      ...(name ? { name: name.slice(0, 80) } : {}),
      proxy: !!impl,
      ...(implAddress && isAddress(implAddress) ? { implementation: implAddress } : {}),
      ...(implName ? { implementationName: implName.slice(0, 80) } : {}),
    };
  }
  return out;
}

/** null when Blockscout does not cover the chain (it answers 404 "Network not supported"). */
export async function blockscoutAddress(chainId: number, address: Hex, key: string, signal: AbortSignal): Promise<BlockscoutAddress | null> {
  const raw = await getJson<unknown>(`https://api.blockscout.com/${chainId}/api/v2/addresses/${address}`, { signal, headers: { Authorization: `Bearer ${key}` } });
  return normalizeBlockscoutAddress(raw);
}

/** A cheap call that only a working key answers; a bad key gets 401. */
export async function checkBlockscoutKey(key: string, signal: AbortSignal): Promise<void> {
  await getJson<unknown>("https://api.blockscout.com/1/api/v2/stats", { signal, headers: { Authorization: `Bearer ${key}` } });
}
