import { Interface, getAddress } from "ethers";
import { VaaValidationError } from "./errors.js";

export const ETHEREUM_CORE_BRIDGE = "0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B";
export const DEFAULT_ETHEREUM_RPC = "https://ethereum-rpc.publicnode.com";

const CORE_INTERFACE = new Interface([
  "function getGuardianSet(uint32) view returns ((address[] keys,uint32 expirationTime))"
]);

export interface GuardianSet {
  index: number;
  keys: string[];
  expirationTime: number;
  source: {
    chainId: number;
    contract: string;
    rpcUrl: string;
  };
}

type FetchLike = (input: string, init: RequestInit) => Promise<Pick<Response, "ok" | "status" | "json">>;

interface JsonRpcEnvelope {
  result?: unknown;
  error?: { code?: number; message?: string };
}

async function rpc(fetchImpl: FetchLike, rpcUrl: string, method: string, params: unknown[]): Promise<unknown> {
  let response: Pick<Response, "ok" | "status" | "json">;
  try {
    response = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch (error) {
    throw new VaaValidationError(`guardian-set RPC request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new VaaValidationError(`guardian-set RPC returned HTTP ${response.status}`);
  const payload = await response.json() as JsonRpcEnvelope;
  if (payload.error) throw new VaaValidationError(`guardian-set RPC error ${payload.error.code ?? "unknown"}: ${payload.error.message ?? "no message"}`);
  if (payload.result === undefined) throw new VaaValidationError("guardian-set RPC response has no result");
  return payload.result;
}

export async function fetchGuardianSet(
  index: number,
  rpcUrl = DEFAULT_ETHEREUM_RPC,
  fetchImpl: FetchLike = fetch
): Promise<GuardianSet> {
  if (!Number.isSafeInteger(index) || index < 0 || index > 0xffff_ffff) throw new VaaValidationError("invalid guardian-set index");
  let parsedUrl: URL;
  try { parsedUrl = new URL(rpcUrl); }
  catch { throw new VaaValidationError("RPC URL is invalid"); }
  if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
    throw new VaaValidationError("RPC URL must use HTTPS unless it targets localhost");
  }

  const chainIdResult = await rpc(fetchImpl, rpcUrl, "eth_chainId", []);
  if (typeof chainIdResult !== "string" || !/^0x[0-9a-f]+$/i.test(chainIdResult)) throw new VaaValidationError("RPC returned an invalid chain ID");
  const chainId = Number.parseInt(chainIdResult.slice(2), 16);
  if (chainId !== 1) throw new VaaValidationError(`expected Ethereum mainnet chain ID 1, received ${chainId}`);

  const code = await rpc(fetchImpl, rpcUrl, "eth_getCode", [ETHEREUM_CORE_BRIDGE, "latest"]);
  if (typeof code !== "string" || code === "0x" || code === "0x0") throw new VaaValidationError("Wormhole Core Bridge contract code was not found");

  const data = CORE_INTERFACE.encodeFunctionData("getGuardianSet", [index]);
  const encoded = await rpc(fetchImpl, rpcUrl, "eth_call", [{ to: ETHEREUM_CORE_BRIDGE, data }, "latest"]);
  if (typeof encoded !== "string") throw new VaaValidationError("guardian-set call returned non-hex data");
  let keys: string[];
  let expirationTime: number;
  try {
    // ethers Result extends Array, so a tuple field named `keys` collides with Array.prototype.keys.
    const tuple = CORE_INTERFACE.decodeFunctionResult("getGuardianSet", encoded)[0] as readonly [readonly string[], bigint];
    keys = Array.from(tuple[0], getAddress);
    expirationTime = Number(tuple[1]);
  } catch {
    throw new VaaValidationError("could not decode guardian set returned by Core Bridge");
  }
  if (keys.length === 0) throw new VaaValidationError(`guardian set ${index} does not exist`);
  if (keys.length > 255) throw new VaaValidationError("guardian set exceeds VAA index capacity");
  if (new Set(keys).size !== keys.length) throw new VaaValidationError("guardian set contains duplicate addresses");
  return { index, keys, expirationTime, source: { chainId, contract: ETHEREUM_CORE_BRIDGE, rpcUrl } };
}
