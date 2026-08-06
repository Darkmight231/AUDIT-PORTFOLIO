import { Wallet, concat, getBytes, hexlify, keccak256, zeroPadValue } from "ethers";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decodeVaa } from "../src/decode.js";
import { VaaDecodeError, VaaValidationError } from "../src/errors.js";
import { quorum, validateVaa } from "../src/validate.js";
import { decodeGovernancePayload, decodeTokenBridgePayload } from "../src/payloads.js";

const wallets = [
  new Wallet("0x0123456789012345678901234567890123456789012345678901234567890123"),
  new Wallet("0x1123456789012345678901234567890123456789012345678901234567890123"),
  new Wallet("0x2123456789012345678901234567890123456789012345678901234567890123")
];
function body(): string {
  return hexlify(concat(["0x00000001", "0x00000002", "0x0002", zeroPadValue("0x1234", 32), "0x0000000000000009", "0x01", "0xaabbcc"]));
}
async function signedVaa(): Promise<string> {
  const digestInput = keccak256(keccak256(body()));
  const signatures = await Promise.all(wallets.map(async (wallet, index) => {
    const sig = wallet.signingKey.sign(digestInput);
    return concat([new Uint8Array([index]), sig.r, sig.s, new Uint8Array([sig.yParity])]);
  }));
  return hexlify(concat(["0x01", "0x00000000", new Uint8Array([3]), ...signatures, body()]));
}

describe("Wormhole VAA inspector", () => {
  it("decodes the envelope and preserves uint64 sequence as bigint", async () => {
    const vaa = decodeVaa(await signedVaa());
    expect(vaa.sequence).toBe(9n);
    expect(vaa.emitterChain).toBe(2);
    expect(vaa.payload).toBe("0xaabbcc");
  });
  it("rejects duplicate guardian indexes", async () => {
    const duplicate = getBytes(await signedVaa());
    duplicate[72] = duplicate[6];
    expect(() => decodeVaa(hexlify(duplicate))).toThrow(VaaDecodeError);
  });
  it("validates signatures and quorum", async () => {
    const vaa = decodeVaa(await signedVaa());
    const result = validateVaa(vaa, wallets.map((wallet) => wallet.address));
    expect(result.valid).toBe(true);
    expect(result.quorum).toBe(3);
  });
  it("rejects a guardian key mismatch", async () => {
    const vaa = decodeVaa(await signedVaa());
    expect(() => validateVaa(vaa, [wallets[2].address, wallets[1].address, wallets[0].address])).toThrow(VaaValidationError);
  });
  it("uses Wormhole's 2/3 plus one quorum", () => {
    expect(quorum(19)).toBe(13);
    expect(quorum(3)).toBe(3);
  });
  it("rejects truncated input", () => {
    expect(() => decodeVaa("0x01")).toThrow(VaaDecodeError);
  });
  it("accepts canonical base64 input", async () => {
    const hex = await signedVaa();
    const base64 = Buffer.from(hex.slice(2), "hex").toString("base64");
    expect(decodeVaa(base64, "base64").sequence).toBe(9n);
  });
  it("decodes governance headers", () => {
    const module = hexlify(Buffer.concat([Buffer.from("Core"), Buffer.alloc(28)]));
    expect(decodeGovernancePayload(hexlify(concat([module, "0x01", "0x0002", "0xaabb"])))).toEqual({ type: "governance", module: "Core", action: 1, targetChain: 2, actionPayload: "0xaabb" });
  });
  it("decodes Token Bridge transfers without precision loss", () => {
    const amount = (1n << 200n) + 7n;
    const amountHex = amount.toString(16).padStart(64, "0");
    const payload = hexlify(concat(["0x01", `0x${amountHex}`, zeroPadValue("0x11", 32), "0x0002", zeroPadValue("0x22", 32), "0x0004", zeroPadValue("0x00", 32)]));
    const decoded = decodeTokenBridgePayload(payload);
    expect(decoded.type).toBe("transfer");
    if (decoded.type === "transfer") expect(decoded.amount).toBe(amount);
  });
  it("never leaks uncontrolled exceptions for arbitrary malformed bytes", () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 512 }), (bytes) => {
      try { decodeVaa(hexlify(bytes)); }
      catch (error) { expect(error).toBeInstanceOf(VaaDecodeError); }
    }), { numRuns: 250 });
  });
});
