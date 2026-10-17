import { describe, expect, it } from "vitest";
import manifest from "../../public/manifest.json";
import type { WalletCard } from "./wallet";
import { WALLET_ORIGINS, authorLink, emptyCard, findWallets, profileChips, profileUrl, tokenChips, tokenSignals, walletFacts, walletKind, weiToEth, xHandle } from "./wallet";

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

describe("token checks", () => {
  it("puts the test trade first and drops the GoPlus checks it already answered", () => {
    const signals = tokenSignals(
      {
        chain: "base",
        pairs: 1,
        simulation: { honeypot: false, buyTax: 0, sellTax: 12, transferTax: 0 },
        signals: [
          { key: "not_honeypot", level: "ok" },
          { key: "sell_tax", level: "ok", value: "0.0%" },
          { key: "mintable", level: "warning" },
        ],
        paid: ["tokenProfile"],
      },
      "en",
    );
    expect(signals.map((s) => `${s.key}:${s.level}${s.value ? `:${s.value}` : ""}`)).toEqual(["sim_sell_tax:warning:12%", "mintable:warning", "dex_profile:info", "sim_ok:ok", "sim_buy_tax:ok:0%"]);
  });

  it("keeps GoPlus's taxes when there was no test trade", () => {
    expect(tokenSignals({ chain: "polygon", pairs: 1, signals: [{ key: "buy_tax", level: "ok", value: "1.0%" }] }, "en").map((s) => s.key)).toEqual(["buy_tax"]);
  });

  it("turns the team's links into chips", () => {
    expect(tokenChips({ x: ["pepecoineth"], website: "https://www.pepe.vip", telegram: "https://t.me/pepe" })).toEqual([
      { platform: "twitter", handle: "pepecoineth" },
      { platform: "website", handle: "https://www.pepe.vip" },
      { platform: "telegram", handle: "t.me/pepe", url: "https://t.me/pepe" },
    ]);
  });

  it("tells the model who made the token and how it traded", () => {
    const card: WalletCard = {
      ...emptyCard("0x6982508145454Ce325dDbE47a25d4ec3d2311933"),
      token: { name: "Pepe", symbol: "PEPE", chain: "ethereum", pairs: 2, socials: { x: ["pepecoineth"] }, gtScore: 86.6, top10: 36, simulation: { honeypot: false, buyTax: 0, sellTax: 0, transferTax: 0 } },
      creator: { address: "0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A", factory: false, names: [], source: "Blockscout", percent: 0 },
      pending: [],
    };
    const facts = walletFacts(card, "someone");
    expect(facts).toContain("X accounts the token's team listed: @pepecoineth");
    expect(facts).toContain("GeckoTerminal score: 87/100");
    expect(facts).toContain("Honeypot.is test trade: buy and sell went through");
    expect(facts).toContain("contract created by 0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A (source: Blockscout), holding 0.00% of the supply");
    expect(facts).toContain("the token's team lists @pepecoineth on X, not the post's author @someone");
  });
});
