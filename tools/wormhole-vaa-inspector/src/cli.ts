#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { decodeVaa } from "./decode.js";
import { decodeGovernancePayload, decodeTokenBridgePayload } from "./payloads.js";
import { DEFAULT_ETHEREUM_RPC, fetchGuardianSet } from "./guardian-set.js";
import { validateVaa } from "./validate.js";

function usage(): never {
  console.error("Usage: vaa-inspect <value|file> [--encoding hex|base64] [--payload token-bridge|governance] [--auto-guardians] [--rpc-url url] [--guardian <address> ...] [--guardian-set file] [--json]");
  process.exit(2);
}

const args = process.argv.slice(2);
if (!args[0]) usage();
const json = args.includes("--json");
const guardians: string[] = [];
let encoding: "hex" | "base64" = "hex";
let payloadType: "token-bridge" | "governance" | undefined;
let guardianSetFile: string | undefined;
let autoGuardians = false;
let rpcUrl = DEFAULT_ETHEREUM_RPC;
for (let i = 1; i < args.length; i++) {
  if (args[i] === "--guardian" && args[i + 1]) guardians.push(args[++i]);
  else if (args[i] === "--guardian-set" && args[i + 1]) guardianSetFile = args[++i];
  else if (args[i] === "--auto-guardians") autoGuardians = true;
  else if (args[i] === "--rpc-url" && args[i + 1]) rpcUrl = args[++i];
  else if (args[i] === "--encoding" && (args[i + 1] === "hex" || args[i + 1] === "base64")) encoding = args[++i] as "hex" | "base64";
  else if (args[i] === "--payload" && (args[i + 1] === "token-bridge" || args[i + 1] === "governance")) payloadType = args[++i] as "token-bridge" | "governance";
  else if (args[i] !== "--json") usage();
}
try {
  const inline = encoding === "hex" ? args[0].startsWith("0x") || /^[0-9a-f]+$/i.test(args[0]) : /^[A-Za-z0-9+/]+={0,2}$/.test(args[0]);
  const source = inline ? args[0] : await readFile(args[0], "utf8");
  if (guardianSetFile) {
    const parsed: unknown = JSON.parse(await readFile(guardianSetFile, "utf8"));
    const keys = Array.isArray(parsed) ? parsed : typeof parsed === "object" && parsed !== null && "keys" in parsed ? (parsed as { keys: unknown }).keys : undefined;
    if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) throw new Error("guardian set file must be a JSON string array or an object with a string-array keys field");
    guardians.push(...keys);
  }
  const vaa = decodeVaa(source, encoding);
  const fetchedGuardianSet = autoGuardians ? await fetchGuardianSet(vaa.guardianSetIndex, rpcUrl) : undefined;
  if (fetchedGuardianSet) guardians.push(...fetchedGuardianSet.keys);
  const result = guardians.length > 0 ? validateVaa(vaa, guardians) : undefined;
  const decodedPayload = payloadType === "token-bridge" ? decodeTokenBridgePayload(vaa.payload) : payloadType === "governance" ? decodeGovernancePayload(vaa.payload) : undefined;
  const output = { ...vaa, sequence: vaa.sequence.toString(), decodedPayload, guardianSet: fetchedGuardianSet, validation: result };
  if (json) console.log(JSON.stringify(output, (_key, value: unknown) => typeof value === "bigint" ? value.toString() : value, 2));
  else {
    console.log(`VAA v${vaa.version} | guardian set ${vaa.guardianSetIndex}`);
    console.log(`Emitter: chain ${vaa.emitterChain}, ${vaa.emitterAddress}`);
    console.log(`Sequence: ${vaa.sequence} | Payload: ${vaa.payload.length / 2 - 1} bytes`);
    console.log(`Digest: ${vaa.digest}`);
    if (result) console.log(`Signatures: ${result.validSignatures}/${result.quorum} valid | replay key ${result.replayKey}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
