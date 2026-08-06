import { getBytes, hexlify, keccak256 } from "ethers";
import { VaaDecodeError } from "./errors.js";

const MAX_VAA_BYTES = 1024 * 1024;

export interface VaaSignature {
  guardianIndex: number;
  r: string;
  s: string;
  recoveryId: number;
}

export interface Vaa {
  version: number;
  guardianSetIndex: number;
  signatures: VaaSignature[];
  timestamp: number;
  nonce: number;
  emitterChain: number;
  emitterAddress: string;
  sequence: bigint;
  consistencyLevel: number;
  payload: string;
  body: string;
  digest: string;
}

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  get position(): number { return this.offset; }
  remaining(): number { return this.bytes.length - this.offset; }
  read(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || this.remaining() < length) {
      throw new VaaDecodeError(`truncated input, need ${length} bytes`, this.offset);
    }
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  u8(): number { return this.read(1)[0]; }
  u16(): number { return (this.u8() << 8) | this.u8(); }
  u32(): number { return (this.u16() * 0x10000) + this.u16(); }
  u64(): bigint {
    let value = 0n;
    for (const byte of this.read(8)) value = (value << 8n) | BigInt(byte);
    return value;
  }
}

export function parseVaaInput(input: string, encoding: "hex" | "base64" = "hex"): Uint8Array {
  if (encoding === "base64") {
    const normalized = input.trim();
    if (normalized.length === 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
      throw new VaaDecodeError("input must be canonical base64");
    }
    const bytes = Uint8Array.from(Buffer.from(normalized, "base64"));
    if (Buffer.from(bytes).toString("base64") !== normalized) throw new VaaDecodeError("input must be canonical base64");
    if (bytes.length > MAX_VAA_BYTES) throw new VaaDecodeError(`VAA exceeds ${MAX_VAA_BYTES} byte limit`);
    return bytes;
  }
  const normalized = input.trim().replace(/^0x/i, "");
  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
    throw new VaaDecodeError("input must be a non-empty even-length hexadecimal string");
  }
  const bytes = getBytes(`0x${normalized}`);
  if (bytes.length > MAX_VAA_BYTES) throw new VaaDecodeError(`VAA exceeds ${MAX_VAA_BYTES} byte limit`);
  return bytes;
}

export function decodeVaa(input: string, encoding: "hex" | "base64" = "hex"): Vaa {
  const bytes = parseVaaInput(input, encoding);
  const reader = new Reader(bytes);
  const version = reader.u8();
  if (version !== 1) throw new VaaDecodeError(`unsupported VAA version ${version}`, 0);
  const guardianSetIndex = reader.u32();
  const signatureCount = reader.u8();
  if (signatureCount === 0) throw new VaaDecodeError("VAA must contain at least one signature", reader.position - 1);
  const signatures: VaaSignature[] = [];
  const seen = new Set<number>();
  let previousIndex = -1;
  for (let i = 0; i < signatureCount; i++) {
    const guardianIndex = reader.u8();
    if (seen.has(guardianIndex)) throw new VaaDecodeError(`duplicate guardian index ${guardianIndex}`, reader.position - 1);
    if (guardianIndex <= previousIndex) throw new VaaDecodeError("guardian indexes must be strictly increasing", reader.position - 1);
    seen.add(guardianIndex);
    previousIndex = guardianIndex;
    const r = hexlify(reader.read(32));
    const s = hexlify(reader.read(32));
    const recoveryId = reader.u8();
    if (recoveryId > 1) throw new VaaDecodeError(`invalid recovery id ${recoveryId}`, reader.position - 1);
    signatures.push({ guardianIndex, r, s, recoveryId });
  }
  const bodyStart = reader.position;
  const timestamp = reader.u32();
  const nonce = reader.u32();
  const emitterChain = reader.u16();
  const emitterAddress = hexlify(reader.read(32));
  const sequence = reader.u64();
  const consistencyLevel = reader.u8();
  const payload = hexlify(reader.read(reader.remaining()));
  const body = hexlify(bytes.slice(bodyStart));
  const digest = keccak256(keccak256(body));
  return { version, guardianSetIndex, signatures, timestamp, nonce, emitterChain, emitterAddress, sequence, consistencyLevel, payload, body, digest };
}

export function replayKey(vaa: Vaa): string {
  return `${vaa.emitterChain}:${vaa.emitterAddress}:${vaa.sequence.toString()}`;
}
