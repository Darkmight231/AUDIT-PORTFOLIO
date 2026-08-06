# [Invalid / Known Issue] User Can Buy Ticket at Discounted Price and Withdraw Max Winnings via Self-Referral — Megapot

**Platform:** Code4rena
**Contest:** Megapot
**Status:** ⚠️ Ruled **Invalid — Out of Scope, known issue** (pre-documented in the protocol's V12 known-issues list before the contest opened)
**Duplicates:** 33 other researchers submitted the same issue
**Finding link:** https://code4rena.com/audits/2025-11-megapot/submissions/S-428

> **Note:** This finding is included for transparency and to show the analysis/PoC process, not as a credentialed result. The judge confirmed it was already a known issue disclosed by the protocol prior to the audit, so it does not count as a valid contest finding.

## Summary

`buyTickets()` in `Jackpot.sol` lets a buyer name themselves as their own referrer. Since referral fees are normally paid out of the LP pool to whoever is designated as referrer, self-referral lets a user reclaim their own referral fee — effectively buying tickets at a discount and, on winning tickets, withdrawing more than the intended payout — at the LPs' expense.

## Description

`_validateBuyTicketInputs` checks for a zero address and other basic conditions, but never checks whether `referrer == buyer`. This allows:

- **Scenario 1 — discounted ticket purchase:** a user buys a ticket naming themselves as referrer, then calls `claimReferralFees()` to recover the referral fee (6.5% in the observed test), netting a ticket for less than face value.
- **Scenario 2 — inflated winnings:** a user with a winning ticket calls `claimWinnings()` naming themselves as referrer, then `claimReferralFees()`, recovering the referral cut (5% in the observed test) on top of their winnings.

In both cases, the fee that should flow to LPs instead flows back to the buyer, reducing LP revenue.

## Proof of Concept

Scenario 1 (Hardhat/TypeScript test) — buyer purchases a $1 ticket naming themselves as referrer, then claims the referral fee back:

```typescript
const ticketIds = await jackpot.connect(buyerOne.wallet).buyTickets.staticCall(
  [winningTicket],
  buyerOne.address,
  [buyerOne.address],
  [PRECISE_UNIT],
  ethers.encodeBytes32String("test-referral")
);

await jackpot.connect(buyerOne.wallet).buyTickets(
  [winningTicket],
  buyerOne.address,
  [buyerOne.address],
  [PRECISE_UNIT],
  ethers.encodeBytes32String("test-referral")
);

await jackpot.connect(buyerOne.wallet).claimReferralFees();
```

Result: buyer's balance goes from 100,000,000 to 99,065,000 after paying for the ticket — i.e. they paid 935,000 (0.935 USDC) instead of the full 1,000,000 (1 USDC) ticket price.

Scenario 2 — buyer wins a ticket, claims winnings, then claims the referral fee on top:

```typescript
await jackpot.connect(buyerOne.wallet).claimWinnings([winningTicketId]);
const finalBalance = await usdcMock.balanceOf(buyerOne.address);

await jackpot.connect(buyerOne.wallet).claimReferralFees();
const finalBalanceWithReferralFee = await usdcMock.balanceOf(buyerOne.address);

expect(finalBalanceWithReferralFee).to.be.greaterThan(finalBalance);
```

Result: balance increases from 166,264,013,000 to 175,009,605,000 after the additional referral-fee claim on top of the winnings payout.

## Recommendation

Prevent a buyer from specifying their own address as referrer, e.g.:

```solidity
require(referrer != buyer, "Cannot self-refer");
```

## Why This Was Ruled Invalid

The judge (0xnev) marked this **Invalid / Out of Scope**, noting it was a known issue already disclosed in the protocol's V12 documentation prior to the contest. 33 total submissions flagged the same root cause, consistent with it being a pre-known, widely-spotted issue rather than a novel finding.

---
*Full submission and judging discussion on [Code4rena](https://code4rena.com/audits/2025-11-megapot/submissions/S-428).*
