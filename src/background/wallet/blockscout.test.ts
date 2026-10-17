import { describe, expect, it } from "vitest";
import manifest from "../../../public/manifest.json";
import { BLOCKSCOUT_PRO_ORIGIN, normalizeBlockscoutAddress } from "./blockscout";

describe("Blockscout PRO", () => {
  it("reads the creator and a verified contract", () => {
    expect(
      normalizeBlockscoutAddress({ is_contract: true, is_verified: true, name: "Degen  Base", creator_address_hash: "0x3C12B77aE8B7DD1FEB63D1D6a2A819AcdA0a41d2", implementations: [] }),
    ).toEqual({ creator: "0x3C12B77aE8B7DD1FEB63D1D6a2A819AcdA0a41d2", contract: { verified: true, name: "Degen  Base", proxy: false } });
  });

  it("names what a proxy runs", () => {
    const out = normalizeBlockscoutAddress({
      is_contract: true,
      is_verified: true,
      name: null,
      creator_address_hash: "0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a",
      implementations: [{ address_hash: "0x000100abaad02f1cfC8Bbe32bD5a564817339E72", name: "CoinbaseSmartWallet" }],
    });
    expect(out?.contract).toEqual({ verified: true, proxy: true, implementation: "0x000100abaad02f1cfC8Bbe32bD5a564817339E72", implementationName: "CoinbaseSmartWallet" });
  });

  it("leaves the contract out for a wallet, and gives nothing for an empty answer", () => {
    expect(normalizeBlockscoutAddress({ is_contract: false, creator_address_hash: null })).toEqual({});
    expect(normalizeBlockscoutAddress(null)).toBeNull();
  });

  it("is declared as an optional host", () => {
    expect(manifest.optional_host_permissions).toContain(BLOCKSCOUT_PRO_ORIGIN);
  });
});
