# [Medium] ERC4626 Inflation Attack in Vault.sol — Avon

**Platform:** Cantina
**Contest:** Avon / Avon-Contracts (private competition)
**Severity:** Medium (Likelihood: Medium, Impact: High)
**Status:** Confirmed — duplicate of #437 (13 total submissions of this issue)
**Finding link:** https://cantina.xyz/code/708eecf5-a6a0-46c1-a949-277f7408decc/findings/270

## Summary

`Vault.sol`, which inherits from OpenZeppelin's ERC4626, is vulnerable to the classic first-depositor / share-price inflation attack. An attacker who deposits first and then donates assets directly to the vault (bypassing `deposit()`) can inflate the share price so that a subsequent depositor's shares round down to zero — letting the attacker capture the victim's funds on redemption.

## Impact

Direct, permanent loss of funds for the victim: a user can deposit a large sum and receive zero shares, while the attacker (still holding 100% of shares) redeems the full vault balance, including the victim's deposit.

Notably, `Vault.sol`'s `_accrueInterest()` function treats the attacker's donation as a "gain" and mints a performance fee to the vault manager. This unintentionally dilutes the attacker's shares — making the attack unprofitable for the attacker — but does **not** protect the victim, who still loses their deposit; the funds are simply redistributed between attacker and manager instead of returned.

Likelihood was assessed as Medium/Low rather than High because the attack requires a near-empty vault (attacker must be first or near-first depositor), no front-running by legitimate users, and enough attacker capital to fund a meaningful donation.

## Root Cause

The vault computes shares as a function of `totalAssets()` and `totalSupply()` without minimum-deposit protection, virtual share offsets, or any guard against direct token transfers inflating `totalAssets()` independent of `deposit()`/`mint()`. This lets an attacker:

1. Deposit a minimal amount (e.g. 1 unit) as the first depositor, receiving 1 share.
2. Transfer a large amount of the underlying asset directly to the vault, inflating `totalAssets()` while `totalSupply()` stays at 1.
3. When a victim deposits, their share rounds down toward zero due to the now-inflated price per share.
4. Attacker redeems their 1 share for a proportional claim on the inflated vault, capturing the victim's deposit (net of the performance fee minted to the manager).

## Proof of Concept

Foundry test (run against a vault seeded with `INITIAL_LOAN_AMOUNT = 1001` for clarity):

```solidity
function testInflationAttack() public {
    // lender1 deposits a minimal amount
    vm.startPrank(lender1);
    loanToken.approve(address(vault), 1000e6);
    vault.deposit(1, lender1);
    // then donates directly to the vault, front-running lender2's deposit
    loanToken.transfer(address(vault), 1000);
    vm.stopPrank();

    // lender2 deposits after the donation
    vm.startPrank(lender2);
    loanToken.approve(address(vault), 1000e6);
    vault.deposit(500, lender2);
    vm.stopPrank();

    vm.startPrank(lender1);
    uint256 shares1 = vault.balanceOf(lender1);
    vault.redeem(shares1, lender1, lender1);
    vm.stopPrank();

    vm.startPrank(lender2);
    uint256 shares2 = vault.balanceOf(lender2);
    vault.redeem(shares2, lender2, lender2);
    vm.stopPrank();

    // lender2 ends up with a significant loss relative to their deposit
    assertEq(loanToken.balanceOf(lender1), 751);
    assertEq(loanToken.balanceOf(lender2), 501);
}
```

Result: lender2 deposits 500 and only recovers 501 total value context aside — well below what an untouched vault would return, confirming value was diverted away from the victim.

## Recommendation

Adopt standard mitigations for ERC4626 inflation attacks:
- Use OpenZeppelin's `ERC4626` implementation with the `_decimalsOffset()` virtual shares/assets mechanism, and/or
- Require and permanently lock a minimum initial deposit (burn to `address(0)` or a dead address) at vault deployment, and/or
- Track internal accounting for `totalAssets()` rather than relying on live `balanceOf(address(this))`, so direct donations can't manipulate share price.

---
*Confirmed as a duplicate of finding #437 (13 researchers submitted this issue). Full judging discussion available on the [Cantina finding page](https://cantina.xyz/code/708eecf5-a6a0-46c1-a949-277f7408decc/findings/270).*
