import { Interface, Wallet } from "ethers";
import { describe, expect, it } from "vitest";
import { ETHEREUM_CORE_BRIDGE, fetchGuardianSet } from "../src/guardian-set.js";
import { VaaValidationError } from "../src/errors.js";

const coreInterface = new Interface([
  "function getGuardianSet(uint32) view returns ((address[] keys,uint32 expirationTime))"
]);

function mockRpc(results: unknown[]) {
  let call = 0;
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: "2.0", id: 1, result: results[call++] })
  });
}

describe("automatic guardian-set retrieval", () => {
  it("decodes a set returned by the Ethereum Core Bridge", async () => {
    const keys = [Wallet.createRandom().address, Wallet.createRandom().address];
    const encoded = coreInterface.encodeFunctionResult("getGuardianSet", [[keys, 1234]]);
    const set = await fetchGuardianSet(7, "https://rpc.example", mockRpc(["0x1", "0x6000", encoded]));
    expect(set.keys).toEqual(keys);
    expect(set.expirationTime).toBe(1234);
    expect(set.source.contract).toBe(ETHEREUM_CORE_BRIDGE);
  });

  it("rejects an RPC connected to the wrong chain", async () => {
    await expect(fetchGuardianSet(7, "https://rpc.example", mockRpc(["0x5"]))).rejects.toThrow("expected Ethereum mainnet");
  });

  it("rejects a missing Core Bridge contract", async () => {
    await expect(fetchGuardianSet(7, "https://rpc.example", mockRpc(["0x1", "0x"]))).rejects.toThrow("contract code was not found");
  });

  it("rejects insecure remote RPC URLs", async () => {
    await expect(fetchGuardianSet(7, "http://rpc.example", mockRpc([]))).rejects.toBeInstanceOf(VaaValidationError);
  });
});
