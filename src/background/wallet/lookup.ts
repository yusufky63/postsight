import { getAddress, isAddress as isChecksummed } from "viem";
import type { ChainId, Hex, NameFact, TextKey, WalletCard, WalletSection } from "../../shared/wallet";
import { emptyCard, isAddress, xHandle } from "../../shared/wallet";
import { DAY, HOUR, MINUTE, cached } from "./cache";
import { basenameAddress, basenamePrimary, basenameTexts, chainFact, codeAt, ensAddress, ensPrimary, ensTexts } from "./chain";
import { blockscoutAddress } from "./blockscout";
import { contractCreation, contractSource, etherscanChain, firstActivity } from "./etherscan";
import type { ClankerLaunch, GeckoInfo, TokenSecurity } from "./sources";
import {
  addressFlags,
  blockscoutCreator,
  clankerLaunch,
  coinbaseVerification,
  dexOrders,
  dexToken,
  ethosUser,
  geckoInfo,
  honeypotCovers,
  honeypotSimulation,
  mergeSocials,
  tokenSecurity,
  web3bioProfiles,
} from "./sources";

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

/** Who a contract's creator is: their primary names and the X account those names list. */
async function creatorIdentity(address: Hex): Promise<{ names: NameFact[]; x?: string }> {
  const { names, texts } = await namesOf(address, null);
  return { names, x: xHandle(texts["com.twitter"]) ?? undefined };
}

export interface LookupOptions {
  /** The token sources (GeckoTerminal, Honeypot.is, Blockscout, Clanker) are allowed too. */
  extras: boolean;
  /** The reader's own Etherscan key, when they added one and allowed api.etherscan.io. */
  etherscanKey?: string;
  /** The reader's own Blockscout PRO key, when they added one and allowed api.blockscout.com. */
  blockscoutKey?: string;
}

/**
 * Builds the card section by section and sends a copy after each one, so the reader
 * sees names and balances while the slower, rate-limited services are still answering.
 */
export async function lookupWallet(query: string, emit: (card: WalletCard) => void, signal: AbortSignal, opts: LookupOptions = { extras: true }): Promise<void> {
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
  const key = opts.etherscanKey;
  const bsKey = opts.blockscoutKey;
  /** One Blockscout PRO answer serves both the creator and the contract row. */
  const blockscoutPro = (chainId: number) => (bsKey ? cached(`bspro:${chainId}:${a}`, 7 * DAY, () => blockscoutAddress(chainId, address, bsKey, signal), DAY).catch(() => null) : Promise.resolve(null));
  // Sections start as earlier ones reveal what the address is; the lookup ends when all have.
  const tasks: Promise<void>[] = [];
  const run = (name: WalletSection, work: () => Promise<void>): Promise<void> => {
    if (!card.pending.includes(name)) card.pending.push(name);
    const task = (async () => {
      try {
        await work();
      } catch {
        if (!signal.aborted) card.failed.push(name);
      } finally {
        card.pending = card.pending.filter((s) => s !== name);
        send();
      }
    })();
    tasks.push(task);
    return task;
  };

  run("names", async () => {
    Object.assign(card, await namesOf(address, isAddress(card.query) ? null : card.query));
  });
  const chainsDone = run("chains", async () => {
    card.chains = await cached(`chains:${a}`, 10 * MINUTE, () => Promise.all([chainFact("ethereum", address), chainFact("base", address)]));
  });
  run("profiles", async () => {
    card.profiles = await cached(`web3bio:${a}`, 12 * HOUR, () => web3bioProfiles(address, signal), 6 * HOUR);
  });
  run("ethos", async () => {
    const ethos = await cached(`ethos:${a}`, 12 * HOUR, () => ethosUser(address, signal));
    if (ethos) card.ethos = ethos;
  });
  run("coinbase", async () => {
    const cb = await cached(`coinbase:${a}`, DAY, () => coinbaseVerification(address, signal), 12 * HOUR);
    if (cb) card.coinbase = cb;
  });
  run("flags", async () => {
    card.flags = await cached(`flags:${a}`, 12 * HOUR, () => addressFlags(address, signal));
  });

  // What the token sections learn about the creator, for the creator section.
  let security: TokenSecurity | null = null;
  let gecko: GeckoInfo | null = null;
  let clanker: ClankerLaunch | null = null;
  /** The slow, rate-limited sections; the creator waits for them only to fall back or fill in a share. */
  const waits: Promise<void>[] = [];
  let launched: Promise<void> = Promise.resolve();

  const tokenDone = run("token", async () => {
    const token = await cached(`dex:${a}`, 10 * MINUTE, () => dexToken(address, signal), 30 * MINUTE);
    card.token = token;
    if (!token) return;
    const chain = token.chain;
    waits.push(
      run("security", async () => {
        // null: GoPlus does not cover that chain, so there is nothing to show either way.
        security = await cached(`tokensec:${chain}:${a}`, 6 * HOUR, () => tokenSecurity(chain, address, signal), 30 * MINUTE);
        if (security) {
          token.signals = security.signals;
          token.holders ??= security.holders;
        }
      }),
    );
    run("orders", async () => {
      const paid = await cached(`orders:${chain}:${a}`, 6 * HOUR, () => dexOrders(chain, address, signal));
      if (paid.length) token.paid = paid;
    });
    if (!opts.extras) return;
    waits.push(
      run("market", async () => {
        gecko = await cached(`gecko:${chain}:${a}`, 6 * HOUR, () => geckoInfo(chain, address, signal), HOUR);
        if (!gecko) return;
        token.socials = mergeSocials(token.socials, gecko.socials);
        if (gecko.score !== undefined) token.gtScore = gecko.score;
        if (gecko.top10 !== undefined) token.top10 = gecko.top10;
        token.holders = gecko.holders ?? token.holders;
      }),
    );
    if (honeypotCovers(chain)) {
      run("simulation", async () => {
        token.simulation = await cached(`honeypot:${chain}:${a}`, 30 * MINUTE, () => honeypotSimulation(chain, address, signal));
      });
    }
    if (chain === "base") {
      launched = run("launchpad", async () => {
        clanker = await cached(`clanker:${a}`, DAY, () => clankerLaunch(address, signal), 6 * HOUR);
        if (!clanker) return;
        token.launchpad = { name: "Clanker", url: clanker.url };
        token.socials = mergeSocials(token.socials, clanker.socials);
      });
    }
  });

  // The creator: asked for once it is clear the address is a token or another contract.
  tasks.push(
    (async () => {
      await Promise.all([chainsDone, tokenDone]);
      const chain = card.token?.chain ?? card.chains.find((c) => c.code === "contract")?.chain;
      if (!chain) return;
      await run("creator", async () => {
        // Clanker and Blockscout answer fast and name the creator directly: ask them first.
        await launched;
        const launch = clanker as ClankerLaunch | null;
        let found: { address: Hex; source: string; via?: Hex } | null = launch?.deployer ? { address: launch.deployer, source: "Clanker" } : null;
        const chainId = etherscanChain(chain);
        if (!found && key && chainId) {
          // The sender of the creating transaction, and the factory it went through: on every chain Etherscan indexes.
          const creation = await cached(`creation:${chainId}:${a}`, 30 * DAY, () => contractCreation(chainId, address, key, signal), DAY).catch(() => null);
          if (creation) found = { address: creation.creator, source: "Etherscan", ...(creation.factory ? { via: creation.factory } : {}) };
        }
        if (!found && bsKey && chainId) {
          const pro = await blockscoutPro(chainId);
          if (pro?.creator) found = { address: pro.creator, source: "Blockscout" };
        }
        if (!found && chain === "ethereum" && opts.extras) {
          // Blockscout sits behind bot protection at times; GoPlus and GeckoTerminal still know the creator then.
          const creator = await cached(`creator:eth:${a}`, 7 * DAY, () => blockscoutCreator(address, signal), DAY).catch(() => null);
          if (creator) found = { address: creator, source: "Blockscout" };
        }
        if (!found) {
          await Promise.all(waits);
          const goplus = security as TokenSecurity | null;
          const gt = gecko as GeckoInfo | null;
          if (goplus?.creator) found = { address: goplus.creator, source: "GoPlus" };
          else if (gt?.developer) found = { address: gt.developer, source: "GeckoTerminal" };
        }
        if (!found) {
          card.creator = null;
          return;
        }
        const who = found.address;
        // A launchpad or factory deploys for someone else: its own names say nothing about who.
        const code = chain === "ethereum" || chain === "base" ? await cached(`code:${chain}:${who.toLowerCase()}`, 7 * DAY, () => codeAt(chain, who)) : "none";
        const factory = code === "contract";
        const identity = factory ? { names: [] } : await creatorIdentity(who);
        card.creator = { address: getAddress(who), factory, source: found.source, ...(found.via ? { via: getAddress(found.via) } : {}), ...identity };
        send();
        // The share the creator holds comes from the slower sources; it follows when they answer.
        await Promise.all(waits);
        const goplus = security as TokenSecurity | null;
        const gt = gecko as GeckoInfo | null;
        const same = (x?: Hex) => !!x && x.toLowerCase() === who.toLowerCase();
        const percent = same(goplus?.creator) ? goplus?.creatorPercent : same(gt?.developer) ? gt?.developerPercent : undefined;
        if (percent !== undefined) card.creator.percent = percent;
      });
    })(),
  );

  // With the reader's own explorer keys: a contract's verified name, or when a wallet first transacted (Etherscan only).
  if (key || bsKey) {
    tasks.push(
      (async () => {
        await Promise.all([chainsDone, tokenDone]);
        const contractChain = card.token?.chain ?? card.chains.find((c) => c.code === "contract")?.chain;
        const contractId = contractChain ? etherscanChain(contractChain) : undefined;
        const active = key ? card.chains.filter((c) => c.code !== "contract" && (c.txCount > 0 || c.balanceWei !== "0")) : [];
        if (!contractId && !active.length) return;
        await run("explorer", async () => {
          if (contractId) {
            const source = key ? await cached(`source:${contractId}:${a}`, 7 * DAY, () => contractSource(contractId, address, key, signal), DAY).catch(() => null) : null;
            // Blockscout fills in when there is no Etherscan answer, and names what a proxy runs.
            const pro = !source || (source.proxy && bsKey) ? (await blockscoutPro(contractId))?.contract : undefined;
            card.contract = source ? { ...source, ...(pro?.implementationName ? { implementationName: pro.implementationName } : {}) } : (pro ?? null);
            if (!card.contract && key) throw new Error("no contract source");
            return;
          }
          // Only Etherscan dates a wallet; "active" is empty without its key.
          if (!key) return;
          const seen = await Promise.all(
            active.map(async (c) => {
              const id = etherscanChain(c.chain)!;
              const ts = await cached(`first:${id}:${a}`, 30 * DAY, () => firstActivity(id, address, key, signal), HOUR);
              return ts ? { chain: c.chain, ts } : null;
            }),
          );
          card.firstSeen = seen.filter((s): s is { chain: ChainId; ts: number } => s !== null).sort((x, y) => x.ts - y.ts);
        });
      })(),
    );
  }

  for (let i = 0; i < tasks.length; i++) await tasks[i];
}
