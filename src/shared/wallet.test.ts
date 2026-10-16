import { describe, expect, it } from "vitest";
import manifest from "../../public/manifest.json";
import type { WalletCard } from "./wallet";
import { WALLET_ORIGINS, authorLink, emptyCard, findWallets, profileChips, profileUrl, walletFacts, walletKind, weiToEth, xHandle } from "./wallet";

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe("findWallets", () => {
  it("finds addresses and names in reading order", () => {
    const text = `Send to ${VITALIK} or jesse.base.eth, not vitalik.eth.`;
    expect(findWallets(text).map((m) => [m.kind, m.value])).toEqual([
      ["address", VITALIK],
      ["name", "jesse.base.eth"],
      ["name", "vitalik.eth"],
    ]);
  });

  it("gives offsets that cut the match out of the text", () => {
    const text = `CA: ${VITALIK}`;
    const [m] = findWallets(text);
    expect(text.slice(m!.start, m!.end)).toBe(VITALIK);
  });

  it("lowercases names", () => {
    expect(findWallets("Ask Vitalik.ETH")[0]?.value).toBe("vitalik.eth");
  });

  it("skips hex that is longer than an address, and names inside hosts, mails and paths", () => {
    expect(findWallets(`${VITALIK}00`)).toEqual([]);
    expect(findWallets(`tx 0x${"a".repeat(64)}`)).toEqual([]);
    expect(findWallets("see vitalik.eth.limo")).toEqual([]);
    expect(findWallets("mail me@vitalik.eth")).toEqual([]);
    expect(findWallets("app.ens.domains/vitalik.eth")).toEqual([]);
  });

  it("needs three characters before .eth", () => {
    expect(findWallets("e.g.eth or ab.eth")).toEqual([]);
    expect(findWallets("abc.eth")).toHaveLength(1);
  });
});

describe("xHandle", () => {
  it("reads handles, links and @names", () => {
    expect(xHandle("@VitalikButerin")).toBe("VitalikButerin");
    expect(xHandle("https://x.com/jessepollak?s=20")).toBe("jessepollak");
    expect(xHandle("https://twitter.com/jessepollak/")).toBe("jessepollak");
    expect(xHandle("not a handle")).toBeNull();
    expect(xHandle("https://x.com/i/communities/123")).toBeNull();
  });
});

describe("authorLink", () => {
  it("matches the post author case-insensitively", () => {
    expect(authorLink({ texts: { "com.twitter": "VitalikButerin" }, profiles: [] }, "vitalikbuterin")).toEqual({ handle: "VitalikButerin", own: true });
  });

  it("names the other account when the author is not in the records", () => {
    expect(authorLink({ texts: { "com.twitter": "VitalikButerin" }, profiles: [] }, "vltalik_eth")).toEqual({ handle: "VitalikButerin", own: false });
  });

  it("uses profile links too, and says nothing without an X account", () => {
    expect(authorLink({ texts: {}, profiles: [{ platform: "twitter", handle: "jessepollak" }] }, "jessepollak")?.own).toBe(true);
    expect(authorLink({ texts: {}, profiles: [{ platform: "github", handle: "jessepollak" }] }, "jessepollak")).toBeNull();
  });
});

describe("walletKind", () => {
  it("prefers what DexScreener and the chain say", () => {
    expect(walletKind({ chains: [], token: undefined })).toBeNull();
    expect(walletKind({ chains: [{ chain: "ethereum", balanceWei: "0", txCount: 1, code: "none" }] })).toBe("wallet");
    expect(walletKind({ chains: [{ chain: "ethereum", balanceWei: "0", txCount: 0, code: "delegated" }] })).toBe("wallet");
    expect(walletKind({ chains: [{ chain: "base", balanceWei: "0", txCount: 0, code: "contract" }] })).toBe("contract");
    expect(walletKind({ chains: [], token: { chain: "bsc", pairs: 1 } })).toBe("token");
  });
});

describe("weiToEth", () => {
  it("converts and flags dust", () => {
    expect(weiToEth("5769725330718854341").value).toBeCloseTo(5.7697, 4);
    expect(weiToEth("1000").tiny).toBe(true);
    expect(weiToEth("0")).toEqual({ value: 0, tiny: false });
    expect(weiToEth("not a number").value).toBe(0);
  });
});

describe("profile chips", () => {
  it("merges records and web3.bio without duplicates", () => {
    const chips = profileChips({
      texts: { "com.twitter": "@jessepollak", "com.github": "https://github.com/jessepollak", url: "https://jesse.xyz" },
      profiles: [
        { platform: "twitter", handle: "JessePollak" },
        { platform: "website", handle: "jesse.xyz/" },
        { platform: "farcaster", handle: "jesse.base.eth", followers: 634642, url: "https://farcaster.xyz/jesse.base.eth" },
      ],
    });
    expect(chips.map((c) => `${c.platform}:${c.handle}`)).toEqual(["twitter:jessepollak", "github:jessepollak", "website:https://jesse.xyz", "farcaster:jesse.base.eth"]);
  });

  it("only links to https addresses built from safe handles", () => {
    expect(profileUrl({ platform: "twitter", handle: "jessepollak" })).toBe("https://x.com/jessepollak");
    expect(profileUrl({ platform: "website", handle: "javascript:alert(1)" })).toBeUndefined();
    expect(profileUrl({ platform: "website", handle: "jesse.xyz" })).toBe("https://jesse.xyz");
    expect(profileUrl({ platform: "lens", handle: "x", url: "http://insecure.example" })).toBeUndefined();
    expect(profileUrl({ platform: "discord", handle: "jesse#1234" })).toBeUndefined();
  });
});

describe("walletFacts", () => {
  it("states what was found, for the model", () => {
    const card: WalletCard = {
      ...emptyCard(VITALIK),
      names: [{ name: "vitalik.eth", source: "ens" }],
      texts: { "com.twitter": "VitalikButerin" },
      chains: [{ chain: "ethereum", balanceWei: "1000000000000000000", txCount: 12, code: "none" }],
      flags: [],
      token: null,
      pending: [],
      failed: ["ethos"],
    };
    const facts = walletFacts(card, "someone");
    expect(facts).toContain(`address: ${VITALIK}`);
    expect(facts).toContain("primary ENS name: vitalik.eth");
    expect(facts).toContain("ethereum: 1 ETH, 12 sent transactions, no code");
    expect(facts).toContain("not the post's author @someone");
    expect(facts).toContain("GoPlus: no address flags");
    expect(facts).toContain("sources that did not answer: Ethos");
  });
});

describe("manifest", () => {
  it("declares every wallet host as an optional permission", () => {
    for (const origin of WALLET_ORIGINS) expect(manifest.optional_host_permissions).toContain(origin);
  });
});
