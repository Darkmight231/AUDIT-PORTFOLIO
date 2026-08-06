import { decodeBytes32String, hexlify } from "ethers";
import { VaaDecodeError } from "./errors.js";

class PayloadReader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  remaining(): number { return this.bytes.length - this.offset; }
  read(length: number): Uint8Array {
    if (this.remaining() < length) throw new VaaDecodeError(`truncated payload, need ${length} bytes`, this.offset);
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  u8(): number { return this.read(1)[0]; }
  u16(): number { const b = this.read(2); return (b[0] << 8) | b[1]; }
  uint(length: number): bigint {
    let value = 0n;
    for (const byte of this.read(length)) value = (value << 8n) | BigInt(byte);
    return value;
  }
  rest(): string { return hexlify(this.read(this.remaining())); }
}

export type TokenBridgePayload =
  | { type: "transfer"; amount: bigint; tokenAddress: string; tokenChain: number; recipient: string; recipientChain: number; fee: bigint }
  | { type: "attestation"; tokenAddress: string; tokenChain: number; decimals: number; symbol: string; name: string }
  | { type: "transfer-with-payload"; amount: bigint; tokenAddress: string; tokenChain: number; recipient: string; recipientChain: number; sender: string; applicationPayload: string };

export interface GovernancePayload { type: "governance"; module: string; action: number; targetChain: number; actionPayload: string }

function text(bytes: Uint8Array): string {
  try { return decodeBytes32String(hexlify(bytes)); }
  catch { return Buffer.from(bytes).toString("utf8").replace(/\0+$/g, ""); }
}

export function decodeTokenBridgePayload(payload: string): TokenBridgePayload {
  const reader = new PayloadReader(Uint8Array.from(Buffer.from(payload.replace(/^0x/, ""), "hex")));
  const id = reader.u8();
  if (id === 1) {
    const result: TokenBridgePayload = { type: "transfer", amount: reader.uint(32), tokenAddress: hexlify(reader.read(32)), tokenChain: reader.u16(), recipient: hexlify(reader.read(32)), recipientChain: reader.u16(), fee: reader.uint(32) };
    if (reader.remaining() !== 0) throw new VaaDecodeError("unexpected trailing bytes in transfer payload");
    return result;
  }
  if (id === 2) {
    const result: TokenBridgePayload = { type: "attestation", tokenAddress: hexlify(reader.read(32)), tokenChain: reader.u16(), decimals: reader.u8(), symbol: text(reader.read(32)), name: text(reader.read(32)) };
    if (reader.remaining() !== 0) throw new VaaDecodeError("unexpected trailing bytes in attestation payload");
    return result;
  }
  if (id === 3) return { type: "transfer-with-payload", amount: reader.uint(32), tokenAddress: hexlify(reader.read(32)), tokenChain: reader.u16(), recipient: hexlify(reader.read(32)), recipientChain: reader.u16(), sender: hexlify(reader.read(32)), applicationPayload: reader.rest() };
  throw new VaaDecodeError(`unknown Token Bridge payload id ${id}`);
}

export function decodeGovernancePayload(payload: string): GovernancePayload {
  const reader = new PayloadReader(Uint8Array.from(Buffer.from(payload.replace(/^0x/, ""), "hex")));
  return { type: "governance", module: text(reader.read(32)), action: reader.u8(), targetChain: reader.u16(), actionPayload: reader.rest() };
}
