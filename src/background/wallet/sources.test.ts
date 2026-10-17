import { describe, expect, it } from "vitest";
import { codeKind, legacyReverseNode } from "./chain";
import { checksumMismatch, validQuery } from "./lookup";
import {
  mergeSocials,
  normalizeAddressFlags,
  normalizeBlockscoutCreator,
  normalizeClanker,
  normalizeCoinbase,
  normalizeDexPairs,
  normalizeEthos,
  normalizeGecko,
  normalizeHoneypot,
  normalizeOrders,
  normalizeTokenSecurity,
  normalizeWeb3Bio,
} from "./sources";

const JESSE = "0x2211d1D0020DAEA8039E46Cf1367962070d77DA9";
const PEPE = "0x6982508145454Ce325dDbE47a25d4ec3d2311933";

describe("web3.bio", () => {
  it("keeps Farcaster and Lens accounts with followers, and the links around each name", () => {
    const profiles = normalizeWeb3Bio([
      {
        platform: "basenames",
        identity: "jesse.base.eth",
        social: { uid: null, follower: 449 },
        links: { website: { handle: "jesse.xyz", link: "https://jesse.xyz" }, github: { handle: "jessepollak" }, twitter: { handle: "jessepollak", link: "https://x.com/jessepollak" } },
      },
      { platform: "farcaster", identity: "jesse.base.eth", social: { uid: 99, follower: 634642 }, links: { twitter: { handle: "jessepollak" } } },
      { platform: "solana", identity: "x.sol", links: { crowdsourced: { handle: "nope" } } },
    ]);
    expect(profiles.map((p) => `${p.platform}:${p.handle}`)).toEqual(["twitter:jessepollak", "farcaster:jesse.base.eth", "github:jessepollak", "website:jesse.xyz"]);
    expect(profiles.find((p) => p.platform === "farcaster")?.followers).toBe(634642);
    expect(normalizeWeb3Bio({ error: "Not Found" })).toEqual([]);
  });
});

describe("Ethos", () => {
  it("reads the score, reviews and vouches", () => {
    const fact = normalizeEthos({
      id: 13344457,
      profileId: null,
      score: 1210,
      humanVerificationStatus: null,
      links: { profile: `https://app.ethos.network/profile/${JESSE}` },
      stats: { review: { received: { negative: 0, neutral: 0, positive: 1 } }, vouch: { received: { count: 0 } } },
    });
    expect(fact).toEqual({ score: 1210, profiled: false, humanVerified: false, url: `https://app.ethos.network/profile/${JESSE}`, reviews: { positive: 1, neutral: 0, negative: 0 }, vouches: 0 });
    expect(normalizeEthos({ message: "not found", code: "NOT_FOUND" })).toBeNull();
  });
});

describe("Coinbase verification", () => {
  const att = (schemaId: string, value: unknown, extra: Record<string, unknown> = {}) => ({
    schemaId,
    attester: "0x357458739F90461b99789350868CD7CF330Dd7EE",
    revoked: false,
    expirationTime: 0,
    decodedDataJson: JSON.stringify([{ name: "v", value: { value } }]),
    ...extra,
  });
  const ACCOUNT = "0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9";
  const COUNTRY = "0x1801901fabd0e6189356b4fb52bb0ab855276d84f7ec140839fbd1f6801ca065";

  it("needs a live account attestation from Coinbase's attester", () => {
    expect(normalizeCoinbase({ data: { attestations: [att(ACCOUNT, true), att(COUNTRY, "de")] } })).toEqual({ country: "DE" });
    expect(normalizeCoinbase({ data: { attestations: [att(ACCOUNT, true, { attester: "0x0000000000000000000000000000000000000001" })] } })).toBeNull();
    expect(normalizeCoinbase({ data: { attestations: [att(ACCOUNT, true, { expirationTime: 100 })] } }, 200)).toBeNull();
    expect(normalizeCoinbase({ data: { attestations: [] } })).toBeNull();
  });
});

describe("GoPlus", () => {
  it("lists address flags, and refuses an answer that is not one", () => {
    expect(normalizeAddressFlags({ code: 1, result: { phishing_activities: "1", cybercrime: "0", number_of_malicious_contracts_created: "2" } })).toEqual([
      { key: "phishing_activities", level: "danger" },
      { key: "malicious_contracts_created", level: "danger", value: "2" },
    ]);
    expect(normalizeAddressFlags({ code: 1, result: { cybercrime: "0" } })).toEqual([]);
    expect(normalizeAddressFlags({ code: 2, message: "pending" })).toBeNull();
  });

  it("orders token checks worst first and treats empty fields as unknown", () => {
    const out = normalizeTokenSecurity(
      {
        code: 1,
        result: {
          [PEPE.toLowerCase()]: {
            is_honeypot: "0",
            buy_tax: "0",
            sell_tax: "0.12",
            is_open_source: "1",
            is_mintable: "",
            hidden_owner: "1",
            holder_count: "520000",
            lp_holders: [
              { address: "0x000000000000000000000000000000000000dead", percent: "0.9", is_locked: 0 },
              { address: "0x1111111111111111111111111111111111111111", percent: "0.1", is_locked: 0 },
            ],
          },
        },
      },
      PEPE,
    );
    expect(out?.signals.map((s) => s.key)).toEqual(["hidden_owner", "sell_tax", "not_honeypot", "buy_tax", "open_source", "lp_locked"]);
    expect(out?.signals.find((s) => s.key === "lp_locked")).toEqual({ key: "lp_locked", level: "ok", value: "90%" });
    const unlocked = normalizeTokenSecurity({ code: 1, result: { [PEPE.toLowerCase()]: { lp_holders: [{ address: PEPE, percent: "0.99", is_locked: 0 }] } } }, PEPE);
    expect(unlocked?.signals).toEqual([]);
    expect(out?.holders).toBe(520000);
    expect(normalizeTokenSecurity({ code: 1, result: {} }, PEPE)).toEqual({ signals: [] });
  });
});

describe("DexScreener", () => {
  const pair = (chainId: string, liquidity: number, created: number, base = PEPE) => ({
    chainId,
    url: `https://dexscreener.com/${chainId}/pair${liquidity}`,
    baseToken: { address: base, name: "Pepe", symbol: "PEPE" },
    quoteToken: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH" },
    priceUsd: "0.000003969",
    liquidity: { usd: liquidity },
    fdv: 1642443809,
    volume: { h24: 1000 },
    pairCreatedAt: created,
  });

  it("describes the token on the chain with the deepest pool", () => {
    const fact = normalizeDexPairs({ pairs: [pair("ethereum", 2_000_000, 1681942955000), pair("ethereum", 28_000_000, 1681492871000), pair("bsc", 5_000_000, 1700000000000)] }, PEPE);
    expect(fact).toMatchObject({ name: "Pepe", symbol: "PEPE", chain: "ethereum", priceUsd: 0.000003969, liquidityUsd: 30_000_000, pairs: 2, createdAt: 1681492871000, url: "https://dexscreener.com/ethereum/pair28000000" });
  });

  it("returns null when nothing trades", () => {
    expect(normalizeDexPairs({ schemaVersion: "1.0.0", pairs: null }, PEPE)).toBeNull();
  });
});

describe("chain helpers", () => {
  it("tells EIP-7702 wallets from contracts", () => {
    expect(codeKind("0x")).toBe("none");
    expect(codeKind(undefined)).toBe("none");
    expect(codeKind(`0xef0100${"ab".repeat(20)}`)).toBe("delegated");
    expect(codeKind("0x6080604052")).toBe("contract");
    expect(codeKind("0x363d3d373d3d363d7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc545af43d6000803e6038573d6000fd5b3d6000f3")).toBe("smart");
  });

  it("builds the legacy Basenames reverse node", () => {
    expect(legacyReverseNode(JESSE)).toBe("0x32ac9b4c5ef8d4742ed765a7e069ea31f043ee8d666b9009d74b2de6d02ff182");
  });
});

describe("lookup input", () => {
  it("accepts only addresses and .eth names", () => {
    expect(validQuery(JESSE)).toBe(true);
    expect(validQuery("jesse.base.eth")).toBe(true);
    expect(validQuery("https://evil.example")).toBe(false);
    expect(validQuery("JESSE.ETH")).toBe(false);
    expect(validQuery(42)).toBe(false);
  });

  it("flags a mixed-case address with a broken checksum", () => {
    expect(checksumMismatch("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(false);
    expect(checksumMismatch("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe(false);
    expect(checksumMismatch("0xD8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
  });
});

describe("token sources", () => {
  it("reads the team's links from the DexScreener pair that carries a profile", () => {
    const fact = normalizeDexPairs(
      {
        pairs: [
          {
            chainId: "ethereum",
            baseToken: { address: PEPE, name: "Pepe", symbol: "PEPE" },
            quoteToken: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
            liquidity: { usd: 10 },
            info: { websites: [{ label: "Website", url: "https://www.pepe.vip" }], socials: [{ type: "twitter", url: "https://x.com/pepecoineth" }, { type: "telegram", url: "https://t.me/pepe" }] },
          },
        ],
      },
      PEPE,
    );
    expect(fact?.socials).toEqual({ x: ["pepecoineth"], website: "https://www.pepe.vip", telegram: "https://t.me/pepe" });
  });

  it("merges links without duplicates or overwrites", () => {
    expect(mergeSocials({ x: ["pepecoineth"], website: "https://a.example" }, { x: ["PepeCoinEth", "other"], website: "https://b.example", discord: "https://discord.gg/x" })).toEqual({
      x: ["pepecoineth", "other"],
      website: "https://a.example",
      discord: "https://discord.gg/x",
    });
  });

  it("keeps GoPlus's creator and its share as a percentage", () => {
    const out = normalizeTokenSecurity({ code: 1, result: { [PEPE.toLowerCase()]: { creator_address: "0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A", creator_percent: "0.012" } } }, PEPE);
    expect(out?.creator).toBe("0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A");
    expect(out?.creatorPercent).toBeCloseTo(1.2);
  });

  it("reads GeckoTerminal's score, holder spread, links and developer", () => {
    const info = normalizeGecko({
      data: {
        attributes: {
          twitter_handle: "pepecoineth",
          websites: ["https://www.pepe.vip"],
          telegram_handle: null,
          gt_score: 86.6,
          holders: { count: 595074, distribution_percentage: { top_10: "36.0191" } },
          developer_address: null,
          developer_holding_percentage: null,
        },
      },
    });
    expect(info).toEqual({ socials: { x: ["pepecoineth"], website: "https://www.pepe.vip" }, score: 86.6, top10: 36.0191, holders: 595074, developer: undefined, developerPercent: undefined });
    expect(normalizeGecko({ errors: [{ status: "404" }] })).toBeNull();
  });

  it("takes a Honeypot.is verdict only from a simulation that ran", () => {
    expect(normalizeHoneypot({ simulationSuccess: true, honeypotResult: { isHoneypot: false }, simulationResult: { buyTax: 0, sellTax: 2.5, transferTax: 0 } })).toEqual({ honeypot: false, buyTax: 0, sellTax: 2.5, transferTax: 0 });
    expect(normalizeHoneypot({ simulationSuccess: true, honeypotResult: { isHoneypot: true, honeypotReason: "sell failed" }, simulationResult: {} })?.honeypot).toBe(true);
    expect(normalizeHoneypot({ simulationSuccess: false, simulationError: "no pair" })).toBeNull();
  });

  it("lists only DexScreener orders that were approved", () => {
    expect(
      normalizeOrders({
        orders: [
          { type: "communityTakeover", status: "cancelled" },
          { type: "tokenProfile", status: "approved" },
          { type: "tokenAd", status: "approved" },
          { type: "tokenAd", status: "approved" },
        ],
      }),
    ).toEqual(["tokenProfile", "tokenAd"]);
  });

  it("finds the Clanker launch for exactly this address", () => {
    const CL = "0x005a8A8129f46afF830276a658b05A7272b50f72";
    const launch = normalizeClanker(
      {
        data: [
          { contract_address: "0x0000000000000000000000000000000000000001", msg_sender: JESSE },
          { contract_address: CL, msg_sender: "0x73Ee023DA573097020f92534fbc26a66Ae6Ca258", socialLinks: [{ name: "website", link: "https://wose.live/" }], metadata: { socialMediaUrls: [{ platform: "x", url: "https://x.com/wose_live" }] } },
        ],
      },
      CL,
    );
    expect(launch).toEqual({ deployer: "0x73Ee023DA573097020f92534fbc26a66Ae6Ca258", url: `https://www.clanker.world/clanker/${CL}`, socials: { x: ["wose_live"], website: "https://wose.live/" } });
    expect(normalizeClanker({ data: [] }, CL)).toBeNull();
  });

  it("reads the creator from Blockscout", () => {
    expect(normalizeBlockscoutCreator({ creator_address_hash: "0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A" })).toBe("0xfbfEaF0DA0F2fdE5c66dF570133aE35f3eB58c9A");
    expect(normalizeBlockscoutCreator({ creator_address_hash: null })).toBeNull();
  });
});
