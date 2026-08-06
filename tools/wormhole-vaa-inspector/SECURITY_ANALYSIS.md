# Security Analysis

## Threat Model

The CLI treats every input byte and guardian address as attacker-controlled. It must fail closed on malformed lengths, unsupported versions, duplicate signers, invalid indexes, invalid signatures, and insufficient quorum.

## Review Checklist

- No protocol integer is converted through JavaScript `number` when it may exceed the safe integer range.
- The signing digest is calculated over the body only and double-hashed with Keccak-256.
- Guardian indexes are unique and bounded by the supplied guardian set.
- Quorum is calculated as `floor(2n/3) + 1`, matching Wormchain and the core contracts.
- Replay identity includes emitter chain, emitter address, and sequence.
- Structural and cryptographic validity are not presented as destination execution safety.
- Automatic guardian retrieval verifies chain ID and contract presence but still trusts the configured Ethereum RPC's view of state.

## Known Limitations

- The CLI can fetch guardian sets from Ethereum, while manual guardian files preserve deterministic offline validation.
- It does not infer whether a guardian set has expired because expiry metadata is external to a VAA.
- It decodes supported payload schemas but does not assert that their application-specific semantics are safe.
- Signature low-`s` policy is delegated to `ethers` recovery behavior and should receive an explicit policy test before production use.
