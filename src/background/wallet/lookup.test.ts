import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletCard } from "../../shared/wallet";

vi.mock("./chain", () => ({
  ensAddress: vi.fn(async (name: string) => (name === "vitalik.eth" ? "0xd8da6bf26964af9d7eed9e03e53415d37aa96045" : null)),
  basenameAddress: vi.fn(async () => null),
  ensPrimary: vi.fn(async () => "vitalik.eth"),
  basenamePrimary: vi.fn(async () => null),
  ensTexts: vi.fn(async () => ({ "com.twitter": "VitalikButerin" })),
  basenameTexts: vi.fn(async () => ({})),
  chainFact: vi.fn(async (chain: "ethereum" | "base") => ({ chain, balanceWei: "1", txCount: 3, code: "none" })),
}));

vi.mock("./sources", () => ({
  web3bioProfiles: vi.fn(async () => []),
  ethosUser: vi.fn(async () => {
    throw new Error("down");
  }),
  coinbaseVerification: vi.fn(async () => null),
  addressFlags: vi.fn(async () => []),
  dexToken: vi.fn(async () => null),
  tokenSecurity: vi.fn(async () => null),
}));

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
    const { lookupWallet } = await import("./lookup");
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
    // A failure is not cached; an answer is.
    expect([...store.keys()].some((k) => k.startsWith("wallet:ethos:"))).toBe(false);
    expect([...store.keys()].some((k) => k.startsWith("wallet:chains:"))).toBe(true);
  });

  it("stops at a name that points nowhere", async () => {
    const { lookupWallet } = await import("./lookup");
    const cards: WalletCard[] = [];
    await lookupWallet("nobody-here.eth", (c) => cards.push(c), new AbortController().signal);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ unresolved: true, address: null, pending: [] });
  });
});
