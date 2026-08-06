# Wormhole VAA Inspector

An independent TypeScript CLI for strict Wormhole Verified Action Approval (VAA) decoding and guardian-signature validation.

## Capabilities

- Parses the binary VAA envelope with bounds checks and big-endian fields.
- Computes the canonical double-Keccak signing digest.
- Preserves `uint64` sequence values as `bigint`.
- Rejects duplicate guardian indexes, invalid recovery IDs, and truncated messages.
- Recovers guardian addresses, checks signatures, and enforces `(2n)/3 + 1` quorum.
- Emits a stable replay identity: `(emitterChain, emitterAddress, sequence)`.
- Decodes governance headers and Token Bridge transfer, attestation, and transfer-with-payload messages.
- Supports hex, base64, guardian-set JSON files, human-readable output, and JSON output offline.
- Retrieves the VAA's guardian set from the canonical Ethereum Core Bridge for one-command live validation.

This project intentionally implements the core decoder independently rather than wrapping the Wormhole SDK. The SDK can be used as an external oracle for differential tests later.

## Usage

```bash
npm install
npm test
npm run build
npx tsx src/cli.ts <vaa-hex> --guardian-set guardians.json --payload token-bridge --json
npx tsx src/cli.ts vaa.txt --encoding base64 --payload governance --json
npx tsx src/cli.ts vaa.txt --encoding base64 --auto-guardians --json
```

The input may be a value or a path to a text file. Without guardian keys, the tool performs structural decoding only. Validation failures return a nonzero exit code. A guardian-set file may be a JSON address array or `{ "keys": [...] }`.

`--auto-guardians` reads the indexed guardian set from Wormhole's Ethereum Core Bridge at `0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B`. It verifies Ethereum chain ID `1` and checks that contract code exists before accepting the response. The default RPC is PublicNode; use `--rpc-url https://...` to select another Ethereum mainnet RPC. The RPC is a trust dependency, so its URL and the queried contract are included in JSON output.

## Security Model

Structural validity means the bytes are correctly encoded. Cryptographic validity means guardian signatures and quorum are valid. Neither proves that a destination application safely handles replay, authorization, finality, or accounting. This tool reports those layers separately so an auditor does not confuse a valid VAA with a safe integration.

Payload decoding is opt-in because payload schemas are application contracts and should not be silently interpreted as universally safe.
