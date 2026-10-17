import { describe, expect, it } from "vitest";
import manifest from "../../../public/manifest.json";
import { ETHERSCAN_ORIGIN, EtherscanError, etherscanChain, normalizeCreation, normalizeFirstTx, normalizeSource, unwrap } from "./etherscan";

describe("Etherscan answers", () => {
  it("treats an empty list as an answer and NOTOK as an error", () => {
    expect(unwrap({ status: "1", message: "OK", result: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(unwrap({ status: "0", message: "No transactions found", result: [] })).toEqual([]);
    expect(() => unwrap({ status: "0", message: "NOTOK", result: "Invalid API Key (#err2)|1" })).toThrow(EtherscanError);
    expect(() => unwrap({ status: "0", message: "NOTOK", result: "Missing/Invalid API Key" })).toThrow("Missing/Invalid API Key");
  });

  it("reads the creating transaction's sender and the factory it went through", () => {
    expect(
      normalizeCreation([{ contractAddress: "0x005a8a8129f46aff830276a658b05a7272b50f72", contractCreator: "0x73ee023da573097020f92534fbc26a66ae6ca258", contractFactory: "0xe85a59c628f7d27878aceb4bf3b35733630083a9" }]),
    ).toEqual({ creator: "0x73ee023da573097020f92534fbc26a66ae6ca258", factory: "0xe85a59c628f7d27878aceb4bf3b35733630083a9" });
    expect(normalizeCreation([{ contractCreator: "0xfbfeaf0da0f2fde5c66df570133ae35f3eb58c9a", contractFactory: "" }])).toEqual({ creator: "0xfbfeaf0da0f2fde5c66df570133ae35f3eb58c9a" });
    expect(normalizeCreation([])).toBeNull();
  });

  it("reads a contract's verified name and whether it is a proxy", () => {
    expect(normalizeSource([{ SourceCode: "pragma solidity", ContractName: "PepeToken", Proxy: "0", Implementation: "" }])).toEqual({ verified: true, name: "PepeToken", proxy: false });
    expect(normalizeSource([{ SourceCode: "", ContractName: "", Proxy: "0", Implementation: "" }])).toEqual({ verified: false, proxy: false });
    expect(normalizeSource([{ SourceCode: "x", ContractName: "ERC1967Proxy", Proxy: "1", Implementation: "0x000000000000000000000000000000000000beef" }])).toMatchObject({ proxy: true, implementation: "0x000000000000000000000000000000000000beef" });
  });

  it("turns the first transaction's timestamp into ms", () => {
    expect(normalizeFirstTx([{ timeStamp: "1438269988" }])).toBe(1438269988000);
    expect(normalizeFirstTx([])).toBeNull();
  });

  it("knows the chains the card shows", () => {
    expect(etherscanChain("base")).toBe(8453);
    expect(etherscanChain("ethereum")).toBe(1);
    expect(etherscanChain("solana")).toBeUndefined();
  });

  it("is declared as an optional host", () => {
    expect(manifest.optional_host_permissions).toContain(ETHERSCAN_ORIGIN);
  });
});
