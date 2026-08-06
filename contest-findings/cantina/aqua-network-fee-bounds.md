# Lack of Fee Bounds Check — Aqua Network (Aquarius)

**Platform:** Cantina
**Contest:** Aqua Network / Aquarius (public competition)
**Severity:** Informational
**Status:** Confirmed — duplicate of #338 (11 total submissions of this issue)
**Language/stack:** Rust / Soroban (Stellar)
**Code affected:** [`liquidity_pool/src/contract.rs#L94`](https://github.com/AquaToken/soroban-amm/blob/4b1d38423a78536b86b543478642f988697a36c/liquidity_pool/src/contract.rs#L94)
**Finding link:** https://cantina.xyz/code/990ce947-05da-443e-b397-be38a65f0bff/findings/139

## Summary

The `fee_fraction` parameter passed during liquidity pool initialization has no input validation or bounds check, allowing a pool deployer to set an unreasonably high — or effectively confiscatory — swap fee (e.g. 100% or higher).

## Description

Nothing constrains `fee_fraction` to a safe, protocol-defined range (e.g. a sensible maximum such as 1%, i.e. 100 out of `FEE_MULTIPLIER = 10_000`). Since this value directly determines the swap fee charged to users, an unbounded value can:

- Drain users' assets during swaps (the entire input amount can be taken as fee).
- Render the AMM effectively unusable, discouraging liquidity provision or causing capital lock-in.
- Cause mispricing that breaks integrations relying on expected fee behavior.

## Proof of Concept

```rust
// Initialize the pool with a 100% swap fee
let malicious_fee_fraction = 10_000u32; // 100% of swap amount taken as fee

LiquidityPool::initialize_all(
    env.clone(),
    admin_address,
    privileged_addrs,
    router_address,
    lp_token_wasm_hash,
    tokens,
    malicious_fee_fraction,
    reward_config,
    plane_address,
);

// Later, when a user swaps:
let amount_in = 1_000_000u128;
let amount_out = get_amount_out(env, amount_in);
// Actual result: amount_out ≈ 0 due to 100% fee
```

The swap executes successfully, but the entire input amount is consumed as fee — a silent, total loss for the user unless caught manually before swapping.

## Recommendation

Implement strict bounds checks on `fee_fraction` at initialization time and in any future fee-update logic:

```rust
const MAX_FEE_BPS: u32 = 100; // 1%
if fee_fraction == 0 || fee_fraction > MAX_FEE_BPS {
    panic_with_error!(e, LiquidityPoolValidationError::InvalidFeeFraction);
}
```

## Notes on Severity

This finding was confirmed as a duplicate of #338 ("Pool Creation Allows Zero-Fee Stableswap Pools"), with 11 total researchers flagging the same underlying missing-bounds-check issue. Severity was ultimately set to Informational by the judge despite likelihood and impact initially being assessed as High — worth noting for context if this comes up in an interview, since it illustrates that final contest severity doesn't always track the technical impact of a finding.

---
*Full judging discussion available on the [Cantina finding page](https://cantina.xyz/code/990ce947-05da-443e-b397-be38a65f0bff/findings/139).*
