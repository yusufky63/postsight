import { getAddress, isAddress as isChecksummed } from "viem";
import type { Hex, NameFact, TextKey, WalletCard, WalletSection } from "../../shared/wallet";
import { emptyCard, isAddress } from "../../shared/wallet";
import { DAY, HOUR, MINUTE, cached } from "./cache";
import { basenameAddress, basenamePrimary, basenameTexts, chainFact, ensAddress, ensPrimary, ensTexts } from "./chain";
import { addressFlags, coinbaseVerification, dexToken, ethosUser, tokenSecurity, web3bioProfiles } from "./sources";

const NAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+eth$/;

/** Only an address or a plain .eth name is looked up; anything else from the page is ignored. */
export function validQuery(query: unknown): query is string {
  return typeof query === "string" && query.length <= 255 && (isAddress(query) || NAME.test(query));
}

/** A mixed-case address carries a checksum; one that does not match was likely mistyped or altered. */
export function checksumMismatch(address: string): boolean {
  return /[a-f]/.test(address.slice(2)) && /[A-F]/.test(address.slice(2)) && !isChecksummed(address, { strict: true });
}

const forward = (name: string) => cached(`fwd:${name}`, DAY, () => (name.endsWith(".base.eth") ? basenameAddress(name) : ensAddress(name)), 6 * HOUR);

async function namesOf(address: Hex, queried: string | null): Promise<{ names: NameFact[]; texts: Partial<Record<TextKey, string>> }> {
  const a = address.toLowerCase();
  const [ens, basename] = await Promise.all([
    cached(`ens:${a}`, DAY, () => ensPrimary(address), 6 * HOUR),
    cached(`basename:${a}`, DAY, () => basenamePrimary(address), 6 * HOUR),
  ]);
  const names: NameFact[] = [];
  if (ens) names.push({ name: ens, source: "ens" });
  if (basename && basename !== ens) names.push({ name: basename, source: "basename" });
  // The hovered name's own records come first; the primary names fill in the rest.
  const sources = [...new Set([queried, ens, basename].filter((n): n is string => !!n))].slice(0, 2);
  const texts: Partial<Record<TextKey, string>> = {};
  for (const name of sources) {
    const records = await cached(`texts:${name}`, 12 * HOUR, () => (name.endsWith(".base.eth") ? basenameTexts(name) : ensTexts(name)));
    for (const [k, v] of Object.entries(records) as [TextKey, string][]) texts[k] ??= v;
  }
  return { names, texts };
}

/**
 * Builds the card section by section and sends a copy after each one, so the reader
 * sees names and balances while the slower, rate-limited services are still answering.
 */
export async function lookupWallet(query: string, emit: (card: WalletCard) => void, signal: AbortSignal): Promise<void> {
  const card = emptyCard(query);
  const send = () => {
    if (!signal.aborted) emit(structuredClone(card));
  };

  if (card.address) {
    card.checksumMismatch = checksumMismatch(card.address);
    if (!card.checksumMismatch) card.address = getAddress(card.address);
  } else {
    let resolved: Hex | null;
    try {
      resolved = await forward(query);
    } catch {
      card.failed = [...card.pending];
      card.pending = [];
      send();
      return;
    }
    if (!resolved) {
      card.unresolved = true;
      card.pending = [];
      send();
      return;
    }
    card.address = getAddress(resolved);
  }
  send();

  const address = card.address as Hex;
  const a = address.toLowerCase();
  const section = async (name: WalletSection, work: () => Promise<void>) => {
    try {
      await work();
    } catch {
      if (!signal.aborted) card.failed.push(name);
    } finally {
      card.pending = card.pending.filter((s) => s !== name);
      send();
    }
  };

  await Promise.all([
    section("names", async () => {
      Object.assign(card, await namesOf(address, isAddress(card.query) ? null : card.query));
    }),
    section("chains", async () => {
      card.chains = await cached(`chains:${a}`, 10 * MINUTE, () => Promise.all([chainFact("ethereum", address), chainFact("base", address)]));
    }),
    section("profiles", async () => {
      card.profiles = await cached(`web3bio:${a}`, 12 * HOUR, () => web3bioProfiles(address, signal), 6 * HOUR);
    }),
    section("ethos", async () => {
      const ethos = await cached(`ethos:${a}`, 12 * HOUR, () => ethosUser(address, signal));
      if (ethos) card.ethos = ethos;
    }),
    section("coinbase", async () => {
      const cb = await cached(`coinbase:${a}`, DAY, () => coinbaseVerification(address, signal), 12 * HOUR);
      if (cb) card.coinbase = cb;
    }),
    section("flags", async () => {
      card.flags = await cached(`flags:${a}`, 12 * HOUR, () => addressFlags(address, signal));
    }),
    section("token", async () => {
      const token = await cached(`dex:${a}`, 10 * MINUTE, () => dexToken(address, signal), 30 * MINUTE);
      card.token = token;
      if (!token) return;
      send();
      try {
        const security = await cached(`tokensec:${token.chain}:${a}`, 6 * HOUR, () => tokenSecurity(token.chain, address, signal), 30 * MINUTE);
        // null: GoPlus does not cover that chain, so there is nothing to show either way.
        if (security) {
          token.signals = security.signals;
          token.holders = security.holders;
        }
      } catch {
        if (!signal.aborted) card.failed.push("security");
      }
    }),
  ]);
}
