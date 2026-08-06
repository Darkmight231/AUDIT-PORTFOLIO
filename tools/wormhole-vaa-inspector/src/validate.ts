import { getAddress, recoverAddress } from "ethers";
import { Vaa, replayKey } from "./decode.js";
import { VaaValidationError } from "./errors.js";

export interface ValidationResult {
  valid: boolean;
  quorum: number;
  validSignatures: number;
  replayKey: string;
  recoveredGuardians: string[];
}

export function quorum(guardianCount: number): number {
  if (!Number.isSafeInteger(guardianCount) || guardianCount < 1) throw new VaaValidationError("guardian set must not be empty");
  return Math.floor((guardianCount * 2) / 3) + 1;
}

export function validateVaa(vaa: Vaa, guardians: string[]): ValidationResult {
  const addresses = guardians.map((address) => getAddress(address));
  const required = quorum(addresses.length);
  const recoveredGuardians: string[] = [];
  for (const signature of vaa.signatures) {
    if (signature.guardianIndex >= addresses.length) throw new VaaValidationError(`guardian index ${signature.guardianIndex} is out of bounds`);
    let recovered: string;
    try {
      recovered = getAddress(recoverAddress(vaa.digest, { r: signature.r, s: signature.s, v: signature.recoveryId }));
    } catch {
      throw new VaaValidationError(`signature ${signature.guardianIndex} is not canonical secp256k1`);
    }
    if (recovered !== addresses[signature.guardianIndex]) throw new VaaValidationError(`signature ${signature.guardianIndex} does not match guardian key`);
    recoveredGuardians.push(recovered);
  }
  if (recoveredGuardians.length < required) throw new VaaValidationError(`insufficient quorum: ${recoveredGuardians.length}/${required}`);
  return { valid: true, quorum: required, validSignatures: recoveredGuardians.length, replayKey: replayKey(vaa), recoveredGuardians };
}
