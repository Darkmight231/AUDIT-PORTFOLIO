# Security Review: Wormchain `x/tokenfactory` Module

**Type:** Independent review, Immunefi bug bounty scope
**Target:** Wormchain — Wormhole's Cosmos SDK-based appchain
**Module reviewed:** `x/tokenfactory` (denom minting, admin authority, cross-module interactions)
**Outcome:** No qualifying vulnerability found — all 10 investigated hypotheses ruled out with code-level justification
**Status:** Closed, no submission
**Dependency versions verified against:** `cosmos-sdk v0.45.11`, `wasmd v0.30.0`, `wasmvm v1.1.1`

## Why This Report Exists

Not every audit ends in a finding — and a thorough negative result is still evidence of real methodology. This report documents every attack hypothesis investigated against Wormchain's `x/tokenfactory` module, the specific code paths traced to test each one, and the exact reason each was ruled out. The goal here isn't to claim a bug; it's to show the process: systematically enumerating attacker capabilities against a Cosmos SDK module, tracing every code path that could realize them, and closing each one with a concrete, falsifiable reason rather than a guess.

## Scope & Approach

`x/tokenfactory` lets users create and manage custom `factory/*` denoms with admin-gated minting. Given its role as a privileged minting surface, the review focused on: authorization bypass, storage-key collision, message-sender spoofing, cross-module abuse, and known CVEs in adjacent components (CosmWasm, IBC transfer). Each hypothesis below was tested by tracing the actual call graph in the codebase, not by inspection of documentation alone.

## Hypotheses Investigated

### 1. Non-Admin TokenFactory Minting
**Hypothesis:** A non-admin account can mint `factory/*` tokens.
**Finding:** Ruled out. Both runtime mint paths — the SDK `MsgMint` handler and the CosmWasm `PerformMint` handler — converge on a single function, `msgServer.Mint()`, which enforces `msg.Sender == authorityMetadata.GetAdmin()` before the internal `mintTo()` is ever invoked. `mintTo()` itself is unexported with exactly one caller, closing off any alternate entry point.

### 2. Unauthorized Admin Takeover
**Hypothesis:** An attacker becomes a denom's admin without going through `MsgChangeAdmin`.
**Finding:** Ruled out. `setAuthorityMetadata()` is the only function that writes admin state to the KVStore, and it has exactly three callers: `setAdmin()` (`admins.go`) — called only from `msgServer.ChangeAdmin()`, and itself requiring the caller to already be the current admin — `createDenomAfterValidation()` (sets the admin to the creator of a brand-new denom only), and `InitGenesis()` (executes once, at genesis).

### 3. KVStore Prefix Collision / Denom Spoofing
**Hypothesis:** Two distinct denom strings resolve to the same storage key, letting an attacker read or write another denom's `AuthorityMetadata`.
**Finding:** Ruled out. `GetDenomPrefixStore()` uses `|` as a key delimiter, and `sdk.ValidateDenom()` enforces a strict `[a-zA-Z0-9/._-]` character set that excludes `|`. Since neither denom string can itself contain the delimiter, the constructed key `"denoms|" + denom + "|authoritymetadata"` is injective — collision is mathematically impossible without a denom string equal to another.

### 4. Forged `msg.Sender` via Protobuf/AnteHandler Bypass
**Hypothesis:** `msgServer.Mint()` receives a `msg.Sender` that doesn't match the cryptographic signer.
**Finding:** Ruled out on both paths. On the SDK path, `GetSigners()` returns the message's declared sender, and the chain's `SigVerificationDecorator` enforces that this matches the actual signature. On the CosmWasm path, `PerformMint()` hardcodes `msg.Sender` to the contract address injected directly by the Wasm VM — not attacker-controlled contract state.

### 5. Cross-Module `bankKeeper.MintCoins()` Abuse
**Hypothesis:** A different module with minting capability mints `factory/*` tokens directly through `x/bank`, bypassing `x/tokenfactory`'s admin check.
**Finding:** Ruled out, on operational rather than hardcoded grounds. Only three modules hold `Minter` permission in `maccPerms`: `x/mint`, `x/transfer`, and `x/tokenfactory` itself (already admin-gated). `x/mint` is not code-restricted to a fixed denom — it reads and mints whatever `params.MintDenom` is set to, which is a governance-controlled parameter rather than a hardcoded whitelist. Under normal operation this is operationally limited to `x/mint`'s own denom, but the protection is governance trust, not an enforced restriction — this is exactly why Finding #6 below treats a governance-driven change to `MintDenom` as a distinct (out-of-scope) risk rather than something already ruled out here. `x/transfer` is restricted to `ibc/{hash}` denoms by its own logic. `x/wormhole` has no mint permission at all (`nil` in `maccPerms`); `x/wasm` holds only `Burner`.

### 6. Governance Parameter Hijack of `x/mint`
**Hypothesis:** A governance proposal changes `x/mint`'s `MintDenom` parameter to a `factory/*` string, inflating supply via the module's `BeginBlocker`.
**Finding:** Not pursued further. This is theoretically constructible but requires a supermajority governance takeover or a compromised Guardian quorum — both are out-of-scope trust assumptions, since governance is trusted by design in the Cosmos SDK threat model.

### 7. `x/authz` `MsgExec` Delegation Attack
**Hypothesis:** An attacker uses `MsgExec` to execute `MsgMint` on a victim's behalf.
**Finding:** Ruled out. `MsgExec` preserves the granter's identity as `msg.Sender` for the wrapped message. If the granter is not the denom's admin, `msgServer.Mint()` still returns `ErrUnauthorized` — delegation doesn't change who the effective sender is for authorization purposes.

### 8. CosmWasm Capability Bypass (CVE-2025-25500)
**Hypothesis:** An older CosmWasm version allows a known capability-restriction bypass.
**Finding:** Not pursued further. Wormchain runs `wasmd v0.30.0` / `wasmvm v1.1.1`, and the chain hardens its capability set at the app level (`tokenFactoryCapabilities = []string{}`, i.e. no capabilities exposed to contracts by default). Contract deployment is additionally governance-gated via Guardian VAA signatures — arbitrary users cannot deploy unvetted contracts, which removes the precondition the CVE depends on.

### 9. TokenFactory Sudo Hook Gas Exploit (CVE-2025-61595)
**Hypothesis:** Send hooks (`BeforeSend`/sudo callbacks) cause exponential gas amplification.
**Finding:** Ruled out. Grepping the codebase for `sudo`, `BeforeSend`, and `TrackBeforeSend` in `x/tokenfactory` returned zero results — Wormchain's fork of the module predates the sudo-hook feature entirely, so the attack surface doesn't exist in this codebase.

### 10. `sdk.ValidateDenom()` Enforcement Gaps
**Hypothesis:** A denom string containing `|`, control bytes, or Unicode is persisted to state without validation, enabling downstream exploitation.
**Finding:** Ruled out. Every code path that persists a denom — `MsgCreateDenom`, `PerformCreateDenom`, and `InitGenesis` — calls `sdk.ValidateDenom()` at least twice before the write occurs.

## Conclusion

No exploitable vulnerability was identified in `x/tokenfactory`'s minting authorization, storage-key derivation, or cross-module interaction surface. The module's admin-gating is enforced consistently across every entry point (SDK message handler, CosmWasm contract call, and delegated execution via `x/authz`), and its denom-validation logic closes off the injection/collision vectors that were tested. Two governance/CVE-adjacent hypotheses were scoped out as relying on trust assumptions or preconditions outside this module's control, rather than being technically ruled out.

---
*Reviewed as part of the Wormhole/Wormchain scope on [Immunefi](https://immunefi.com).*
