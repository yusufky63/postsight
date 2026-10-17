import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletCard } from "../../shared/wallet";
import { tokenAuthorLink } from "../../shared/wallet";
// Imported here, not inside the tests, so loading viem is not timed as part of the first test.
import { lookupWallet } from "./lookup";
import type * as Etherscan from "./etherscan";
import type * as Sources from "./sources";

const TOKEN = "0x1111111111111111111111111111111111111111";
const DEV = "0x2222222222222222222222222222222222222222";
const FACTORY = "0x3333333333333333333333333333333333333333";
/** A Base token that did not come from Clanker. */
const PLAIN = "0x4444444444444444444444444444444444444444";

vi.mock("./chain", () => ({
  ensAddress: vi.fn(async (name: string) => (name === "vitalik.eth" ? "0xd8da6bf26964af9d7eed9e03e53415d37aa96045" : null)),
  basenameAddress: vi.fn(async () => null),
  ensPrimary: vi.fn(async (address: string) => (address.toLowerCase() === DEV ? "dev.eth" : address.toLowerCase().startsWith("0xd8da") ? "vitalik.eth" : null)),
  basenamePrimary: vi.fn(async () => null),
  ensTexts: vi.fn(async (name: string) => (name === "dev.eth" ? { "com.twitter": "postauthor" } : { "com.twitter": "VitalikButerin" })),
  basenameTexts: vi.fn(async () => ({})),
  chainFact: vi.fn(async (chain: "ethereum" | "base", address: string) => ({ chain, balanceWei: "1", txCount: 3, code: (address === TOKEN || address === PLAIN) && chain === "base" ? "contract" : "none" })),
  codeAt: vi.fn(async (_chain: string, address: string) => (address.toLowerCase() === FACTORY ? "contract" : "none")),
}));

// The pure helpers stay real; only the calls that would reach the network are replaced.
vi.mock("./sources", async (importOriginal) => {
  const real = await importOriginal<typeof Sources>();
  return {
    ...real,
    web3bioProfiles: vi.fn(async () => []),
    ethosUser: vi.fn(async (address: string) => {
      if (address === TOKEN || address === PLAIN) return null;
      throw new Error("down");
    }),
    coinbaseVerification: vi.fn(async () => null),
    addressFlags: vi.fn(async () => []),
    dexToken: vi.fn(async (address: string) => (address === TOKEN || address === PLAIN ? { name: "Project", symbol: "PRJ", chain: "base", pairs: 1, socials: { x: ["projectx"] } } : null)),
    tokenSecurity: vi.fn(async () => ({ signals: [], holders: 10, creator: FACTORY, creatorPercent: 0.5 })),
    dexOrders: vi.fn(async () => ["tokenProfile"]),
    geckoInfo: vi.fn(async () => ({ socials: { x: ["projectx"], website: "https://project.example" }, score: 70, top10: 40, holders: 1200 })),
    honeypotSimulation: vi.fn(async () => ({ honeypot: false, buyTax: 0, sellTax: 1, transferTax: 0 })),
    clankerLaunch: vi.fn(async (address: string) => (address === PLAIN ? null : { deployer: DEV, url: `https://www.clanker.world/clanker/${TOKEN}`, socials: { x: ["projectx_two"] } })),
    blockscoutCreator: vi.fn(async () => null),
  };
});

vi.mock("./etherscan", async (importOriginal) => {
  const real = await importOriginal<typeof Etherscan>();
  return {
    ...real,
    contractCreation: vi.fn(async () => ({ creator: DEV, factory: FACTORY })),
    contractSource: vi.fn(async () => ({ verified: true, name: "ProjectToken", proxy: false })),
    firstActivity: vi.fn(async (chainId: number) => (chainId === 1 ? Date.UTC(2017, 2, 1) : null)),
  };
});

const store = new Map<string, unknown>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string | null) => (key === null ? Object.fromEntries(store) : { [key]: store.get(key) }),
        set: async (items: Record<string, unknown>) => Object.entries(items).forEach(([k, v]) => store.set(k, v)),
        remove: async (keys: string[]) => keys.forEach((k) => store.delete(k)),
      },
    },
  });
});

describe("lookupWallet", () => {
  it("resolves a name, fills sections as they answer and records the ones that failed", async () => {
    const cards: WalletCard[] = [];
    await lookupWallet("vitalik.eth", (c) => cards.push(c), new AbortController().signal);
    const last = cards.at(-1)!;
    expect(cards.length).toBeGreaterThan(2);
    expect(last.address).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
    expect(last.names).toEqual([{ name: "vitalik.eth", source: "ens" }]);
    expect(last.texts["com.twitter"]).toBe("VitalikButerin");
    expect(last.chains).toHaveLength(2);
    expect(last.pending).toEqual([]);
    expect(last.failed).toEqual(["ethos"]);
    expect(last.token).toBeNull();
    // Not a contract: nobody created it.
    expect(last.creator).toBeUndefined();
    // A failure is not cached; an answer is.
    expect([...store.keys()].some((k) => k.startsWith("wallet:ethos:"))).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith("wallet:chains:"))).toBe(true);
  });

  it("stops at a name that points nowhere", async () => {
    const cards: WalletCard[] = [];
    await lookupWallet("nobody-here.eth", (c) => cards.push(c), new AbortController().signal);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ unresolved: true, address: null, pending: [] });
  });

  it("adds the token sources and finds the person who asked a launchpad for the token", async () => {
    const cards: WalletCard[] = [];
    await lookupWallet(TOKEN, (c) => cards.push(c), new AbortController().signal);
    const last = cards.at(-1)!;
    expect(last.pending).toEqual([]);
    expect(last.failed).toEqual([]);
    expect(last.token).toMatchObject({
      gtScore: 70,
      top10: 40,
      holders: 1200,
      paid: ["tokenProfile"],
      simulation: { honeypot: false, sellTax: 1 },
      launchpad: { name: "Clanker" },
      socials: { x: ["projectx", "projectx_two"], website: "https://project.example" },
    });
    // Clanker names the wallet that asked for the token, ahead of GoPlus's factory address.
    expect(last.creator).toEqual({ address: DEV, factory: false, source: "Clanker", names: [{ name: "dev.eth", source: "ens" }], x: "postauthor" });
    expect(tokenAuthorLink(last, "postauthor")).toEqual({ kind: "creator-own", handle: "postauthor" });
    expect(tokenAuthorLink(last, "ProjectX")).toEqual({ kind: "token-own", handle: "projectx" });
    expect(tokenAuthorLink(last, "someone")).toEqual({ kind: "token-other", handle: "projectx" });
  });

  it("without the token hosts, keeps to the core sources and labels a factory creator", async () => {
    const cards: WalletCard[] = [];
    await lookupWallet(TOKEN, (c) => cards.push(c), new AbortController().signal, { extras: false });
    const last = cards.at(-1)!;
    expect(last.pending).toEqual([]);
    expect(last.token?.gtScore).toBeUndefined();
    expect(last.token?.simulation).toBeUndefined();
    expect(last.token?.launchpad).toBeUndefined();
    expect(last.creator).toEqual({ address: FACTORY, factory: true, source: "GoPlus", percent: 0.5, names: [] });
  });

  it("with an Etherscan key, names a non-launchpad token's creator and its verified contract", async () => {
    const cards: WalletCard[] = [];
    await lookupWallet(PLAIN, (c) => cards.push(c), new AbortController().signal, { extras: true, etherscanKey: "test" });
    const last = cards.at(-1)!;
    expect(last.pending).toEqual([]);
    expect(last.creator).toMatchObject({ address: DEV, source: "Etherscan", via: FACTORY, names: [{ name: "dev.eth", source: "ens" }] });
    expect(last.contract).toEqual({ verified: true, name: "ProjectToken", proxy: false });
    expect(last.firstSeen).toBeUndefined();
  });

  it("with an Etherscan key, dates a wallet's first transaction", async () => {
    const cards: WalletCard[] = [];
    await lookupWallet("vitalik.eth", (c) => cards.push(c), new AbortController().signal, { extras: true, etherscanKey: "test" });
    const last = cards.at(-1)!;
    expect(last.firstSeen).toEqual([{ chain: "ethereum", ts: Date.UTC(2017, 2, 1) }]);
    expect(last.contract).toBeUndefined();
  });
});
