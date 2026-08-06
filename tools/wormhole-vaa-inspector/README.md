# Wormhole VAA Inspector

Wormhole VAA Inspector is an independent TypeScript command-line tool for decoding Wormhole Verified Action Approvals (VAAs), validating guardian signatures, and inspecting supported application payloads.

The decoder is implemented directly from the VAA binary format rather than wrapping the Wormhole SDK. It separates structural decoding, cryptographic validation, and application payload interpretation so each result can be assessed independently.

## Capabilities

- Parses the binary VAA envelope with strict bounds checks and big-endian fields.
- Computes the canonical double-Keccak signing digest over the VAA body.
- Preserves `uint64` sequence values as `bigint`.
- Rejects truncated messages, duplicate or unordered guardian indexes, and invalid recovery IDs.
- Recovers guardian addresses and enforces the `floor(2n/3) + 1` quorum rule.
- Emits the replay identity `(emitterChain, emitterAddress, sequence)`.
- Decodes Token Bridge transfers, attestations, and transfers with payloads.
- Decodes Wormhole governance payload headers.
- Accepts hexadecimal and canonical base64 input, inline or from a text file.
- Supports offline guardian files and live guardian-set retrieval from Ethereum.
- Produces human-readable summaries or structured JSON.

## Prerequisites

Install the following before running the project:

- [Git](https://git-scm.com/downloads)
- [Node.js 22](https://nodejs.org/) or another current Node.js release with `AbortSignal.timeout`
- npm, which is included with Node.js

Confirm the tools are available:

```bash
git --version
node --version
npm --version
```

## Installation

The project is stored in the `smart-contract-audit-portfolio` repository.

```bash
git clone https://github.com/Darkmight231/smart-contract-audit-portfolio.git
cd smart-contract-audit-portfolio/tools/wormhole-vaa-inspector
npm ci
```

Use `npm ci` for a reproducible install from `package-lock.json`. Use `npm install` only when intentionally updating dependencies.

Verify the installation:

```bash
npm test
npm run build
```

A successful test run currently reports 14 passing tests. A successful build writes compiled JavaScript to `dist/`.

## Command Syntax

Run directly from TypeScript during development:

```bash
npx tsx src/cli.ts <value-or-file> [options]
```

Or build first and run the compiled CLI:

```bash
npm run build
node dist/cli.js <value-or-file> [options]
```

`<value-or-file>` can be either:

- An inline hexadecimal or base64 VAA
- A path to a UTF-8 text file containing the VAA

## Options

| Option | Value | Purpose |
|---|---|---|
| `--encoding` | `hex` or `base64` | Selects the input encoding. Defaults to `hex`. |
| `--payload` | `token-bridge` or `governance` | Decodes a supported application payload. Payload decoding is opt-in. |
| `--guardian <address>` | Ethereum address | Adds one guardian address. Repeat the option in guardian-index order. |
| `--guardian-set <file>` | JSON file path | Loads a complete guardian set for offline signature validation. |
| `--auto-guardians` | None | Fetches the VAA's indexed guardian set from the Ethereum Core Bridge. |
| `--rpc-url <url>` | HTTPS URL | Overrides the Ethereum RPC used by `--auto-guardians`. |
| `--json` | None | Prints the complete result as formatted JSON. |

Unknown options, missing values, and unsupported option values print the usage line and exit with status `2`.

## Quick Start

### Decode Hexadecimal Input

Structural decoding does not require guardian addresses:

```bash
npx tsx src/cli.ts 0x<VAA_HEX>
```

To read the same value from a file:

```bash
npx tsx src/cli.ts ./vaa.txt
```

Hex input may include a leading `0x`. Whitespace around file content is ignored. The value must otherwise be non-empty, contain an even number of hexadecimal characters, and decode to no more than 1 MiB.

### Decode Base64 Input

Pass `--encoding base64` for canonical base64:

```bash
npx tsx src/cli.ts ./vaa-base64.txt --encoding base64
```

Inline base64 is also supported:

```bash
npx tsx src/cli.ts "<VAA_BASE64>" --encoding base64 --json
```

The decoder requires canonical base64, including valid padding and a length divisible by four.

### Decode a Token Bridge Payload

```bash
npx tsx src/cli.ts ./vaa.txt --payload token-bridge --json
```

Supported Token Bridge payload IDs are:

| ID | Decoded type | Important fields |
|---|---|---|
| `1` | Transfer | Amount, token address and chain, recipient and chain, fee |
| `2` | Attestation | Token address and chain, decimals, symbol, name |
| `3` | Transfer with payload | Amount, token, recipient, sender, application payload |

Selecting the wrong payload decoder causes a decoding error instead of silently interpreting the data.

### Decode a Governance Payload

```bash
npx tsx src/cli.ts ./vaa.txt --payload governance --json
```

The decoded result contains the 32-byte module name, action ID, target chain, and the remaining action-specific payload.

## Signature Validation

Decoding alone confirms that the VAA is structurally well formed. Signature validation additionally requires the guardian set referenced by the VAA's `guardianSetIndex`.

### Automatic Guardian Retrieval

For one-command live validation:

```bash
npx tsx src/cli.ts ./vaa.txt --auto-guardians --json
```

By default, the CLI queries:

- RPC: `https://ethereum-rpc.publicnode.com`
- Ethereum chain ID: `1`
- Wormhole Core Bridge: `0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B`

Use a different Ethereum mainnet RPC when required:

```bash
npx tsx src/cli.ts ./vaa.txt --auto-guardians --rpc-url https://YOUR_ETHEREUM_RPC --json
```

The CLI verifies that the endpoint reports Ethereum mainnet and that contract code exists at the canonical Core Bridge address before calling `getGuardianSet`. Remote RPC URLs must use HTTPS. Plain HTTP is accepted only for `localhost` and `127.0.0.1`.

The RPC provider is a trust dependency because it controls the state returned to the CLI. JSON output records the RPC URL, chain ID, contract address, guardian-set index, keys, and expiration time used for validation.

### Offline Guardian-Set File

For deterministic offline validation, create a JSON file whose addresses are ordered by guardian index.

Array format:

```json
[
  "0x1111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222"
]
```

Object format:

```json
{
  "keys": [
    "0x1111111111111111111111111111111111111111",
    "0x2222222222222222222222222222222222222222"
  ]
}
```

Then run:

```bash
npx tsx src/cli.ts ./vaa.txt --guardian-set ./guardians.json --json
```

The addresses must represent the exact guardian set referenced by the VAA. Do not reorder, sort, or remove addresses; each VAA signature identifies its signer by array index.

### Individual Guardian Arguments

Guardian addresses can also be supplied one at a time:

```bash
npx tsx src/cli.ts ./vaa.txt \
  --guardian 0x1111111111111111111111111111111111111111 \
  --guardian 0x2222222222222222222222222222222222222222 \
  --json
```

Repeat `--guardian` in guardian-index order. A complete set is required because quorum is calculated from the number of supplied addresses, not only from the signatures present in the VAA.

Use only one trusted guardian source for a validation run. Combining `--guardian`, `--guardian-set`, and `--auto-guardians` appends the addresses together and does not merge or deduplicate sets.

## Output

### Human-Readable Output

Without `--json`, the CLI prints a compact summary:

```text
VAA v1 | guardian set <index>
Emitter: chain <chain-id>, <32-byte-address>
Sequence: <sequence> | Payload: <byte-count> bytes
Digest: <double-keccak-digest>
Signatures: <valid>/<required> valid | replay key <chain>:<emitter>:<sequence>
```

The signatures line appears only when guardian addresses were supplied or retrieved.

### JSON Output

Use JSON for audit artifacts, scripts, or downstream analysis:

```bash
npx tsx src/cli.ts ./vaa.txt --auto-guardians --payload token-bridge --json
```

The JSON document includes:

- VAA version and guardian-set index
- Parsed signatures
- Timestamp and nonce
- Emitter chain and address
- Sequence as a decimal string
- Consistency level
- Raw payload and signed body
- Double-Keccak digest
- Optional decoded application payload
- Optional fetched guardian-set metadata
- Optional signature-validation result and replay key

Protocol integers that may exceed JavaScript's safe integer range are serialized as decimal strings.

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Decoding and all requested validation completed successfully. |
| `1` | Input, decoding, RPC, payload, guardian, signature, or quorum validation failed. |
| `2` | Command syntax or options were invalid. |

Error details are written to standard error, making the CLI suitable for shell scripts and CI checks.

## Common Errors

### `input must be a non-empty even-length hexadecimal string`

Confirm that the input contains only hexadecimal characters, has an even length, and uses `--encoding base64` if the source is base64.

### `input must be canonical base64`

Confirm that padding is present when required, remove embedded whitespace, and verify that the encoded length is divisible by four.

### `signature ... does not match guardian key`

The supplied guardian set is incorrect, out of order, or does not match the VAA's `guardianSetIndex`.

### `insufficient quorum`

The VAA does not contain enough valid signatures for `floor(2n/3) + 1` of the supplied guardian set.

### `expected Ethereum mainnet chain ID 1`

The configured RPC points to another network. Use an Ethereum mainnet endpoint.

### `RPC URL must use HTTPS unless it targets localhost`

Use an HTTPS endpoint. For a local development node, use `http://localhost:<port>` or `http://127.0.0.1:<port>`.

### `vitest` or `tsc` is not recognized

Install dependencies in the project directory before running tests or building:

```bash
npm ci
```

## Development

Run the test suite:

```bash
npm test
```

Run the strict TypeScript build:

```bash
npm run build
```

Run the development CLI without compiling first:

```bash
npm run dev -- ./vaa.txt --json
```

The project uses:

- TypeScript with `strict` mode and NodeNext modules
- Vitest for unit and integration tests
- `ethers` for Keccak hashing, ABI calls, address normalization, and secp256k1 recovery
- GitHub Actions on Node.js 22 for build and test verification

## Security Model

The tool reports different layers of validity separately:

| Layer | What it establishes | What it does not establish |
|---|---|---|
| Structural decoding | The bytes follow the supported VAA envelope format. | Guardian authorization or application safety. |
| Signature validation | Signatures match the supplied guardian set and satisfy quorum. | That the guardian source or RPC is trustworthy. |
| Payload decoding | Fields match a selected supported payload schema. | That executing the message is authorized, replay-safe, or economically sound. |

A cryptographically valid VAA is not proof that a destination application safely handles replay protection, emitter authorization, finality, accounting, or payload semantics. Payload decoding remains opt-in for this reason.

For the detailed threat model, review checklist, and known limitations, see [SECURITY_ANALYSIS.md](./SECURITY_ANALYSIS.md).

## Known Limitations

- Automatic guardian retrieval trusts the configured Ethereum RPC's view of mainnet state.
- Guardian-set expiration metadata is returned but not interpreted against a VAA because expiry is external to the VAA itself.
- Payload support is limited to Wormhole governance headers and the implemented Token Bridge message types.
- Application-specific payload bytes in transfer-with-payload messages remain opaque.
- Signature low-`s` handling follows `ethers` recovery behavior.
- The tool does not submit, relay, redeem, or execute VAAs.

## License

No license file is currently included. Copyright remains with the repository owner unless a license is added.
