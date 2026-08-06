# [QA-01] Incomplete Dust Attack Protection Enables Micro-Trade Spam in Launchpad.buy()

**Platform:** Code4rena
**Contest:** GTE Perps and Launchpad (2025-08)
**Severity:** QA
**File:** `Launchpad.sol`
**Function:** `buy(BuyData calldata buyData)`
**Finding link:** https://code4rena.com/audits/2025-08-gte-perps-and-launchpad/submissions/S-484

## Summary

`buy()`'s dust-attack protection only rejects transactions where the quote cost is exactly zero (`amountInQuote == 0`). It does not guard against purchases with a minimal but non-zero cost, leaving the system open to micro-trade spam that consumes resources while paying almost nothing.

## Root Cause

```solidity
if (data.active && amountInQuote == 0) revert DustAttackInvalid();
```

This check only blocks the zero-cost edge case. A purchase with `amountOutBase = 1000 wei` and `amountInQuote = 1 wei` bypasses it entirely, since `amountInQuote` is non-zero.

## Attack Vector

1. Identify a token still in its bonding-curve phase (`data.active == true`).
2. Find the smallest non-zero `amountInQuote` the curve will accept for a purchase.
3. Repeatedly call `buy()` with that minimal amount.
4. Each call succeeds, emits a `Swap` event, and mutates bonding-curve state — at negligible cost to the attacker.

### Proof of Concept

```solidity
// BLOCKED: Zero-cost purchase
amountOutBase = 1 wei;
amountInQuote = 0 wei; // Triggers DustAttackInvalid()

// ALLOWED: Minimal non-zero cost purchase
amountOutBase = 1000 wei;
amountInQuote = 1 wei; // Bypasses current validation
```

```solidity
BuyData memory spamTrade = BuyData({
    token: targetToken,
    account: attacker,
    recipient: attacker,
    amountOutBase: 1000 wei,        // Tiny token amount
    maxAmountInQuote: 5 wei         // Minimal quote cost
});

for (uint256 i = 0; i < 500; i++) {
    launchpad.buy(spamTrade);
    // Each call generates a Swap event and mutates state
}
```

## Impact

- **Event log pollution:** floods `Swap` events with economically meaningless micro-transactions.
- **Analytics degradation:** corrupts trading metrics and price-discovery data derived from swap history.
- **Increased gas overhead:** forces the bonding curve to process a large volume of trivial state updates.
- **UX degradation:** legitimate traders see cluttered transaction/event histories.

**Economic profile:** attack cost is minimal (dust amount + gas), while the damage is amplified across all system users — gas cost is the only natural deterrent, and it's a weak one on low-fee chains.

## Recommendations

**Primary fix — minimum purchase thresholds:**

```solidity
uint256 public constant MIN_BASE_PURCHASE = 1e15; // e.g. 0.001 tokens minimum
uint256 public constant MIN_QUOTE_COST = 1e6;     // e.g. $1 minimum (6-decimal quote)

if (data.active) {
    if (amountInQuote == 0 ||
        amountOutBaseActual < MIN_BASE_PURCHASE ||
        amountInQuote < MIN_QUOTE_COST) {
        revert DustAttackInvalid();
    }
}
```

**Alternative approaches:**

- *Dynamic threshold*, scaled to current token price rather than a fixed constant:
  ```solidity
  uint256 minQuoteCost = data.curve.quoteQuoteForBase(buyData.token, MIN_BASE_PURCHASE, true);
  if (amountInQuote < minQuoteCost) revert DustAttackInvalid();
  ```
- *Rate limiting* per account as a secondary/complementary control:
  ```solidity
  mapping(address => uint256) lastPurchaseTime;
  uint256 constant MIN_PURCHASE_INTERVAL = 10 seconds;

  modifier rateLimited(address account) {
      require(block.timestamp >= lastPurchaseTime[account] + MIN_PURCHASE_INTERVAL);
      lastPurchaseTime[account] = block.timestamp;
      _;
  }
  ```

**Implementation notes:** thresholds should be quote-asset agnostic (percentage-based, to handle varying decimals), and must not interfere with legitimate small purchases near graduation. Precompute thresholds where possible to minimize runtime gas overhead.

---
*Full submission on [Code4rena](https://code4rena.com/audits/2025-08-gte-perps-and-launchpad/submissions/S-484).*
