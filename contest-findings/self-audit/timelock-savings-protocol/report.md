# Audit Report: TimeLock Savings Protocol

**Auditor:** Redteamer
**Type:** Independent / self-directed audit
**Scope:** `Savings.sol`
**Test suite / PoC repo:** https://github.com/Darkmight231/Savings_FF

## Executive Summary

TimeLock Savings is a time-locked staking/savings contract where users deposit tokens for a minimum lock period in exchange for a reward. This review identified **2 High**, **1 Medium**, and **2 QA/Low** severity issues. The most severe findings allow the contract owner to drain all user deposits via an unrestricted emergency function, and allow the reward/accounting model to pay early withdrawers out of later depositors' principal — an insolvency risk under normal usage, not just an edge case.

## Findings Summary

| ID | Title | Severity |
|---|---|---|
| H-01 | Owner can rug-pull all user funds via `emergencyWithdraw()` | High |
| H-02 | Contract pays withdrawing users with other users' deposited funds | High |
| M-01 | Users pay early-withdrawal penalty even after meeting the lock requirement | Medium |
| QA-01 | `Deposited` event emits parameters in the wrong order | Low / QA |
| QA-02 | `calculateReward()` called with arguments in the wrong order | Low / QA |

---

## [H-01] Contract Owner Can Rug-Pull All User Funds

**Severity:** High
**Location:** `Savings.sol`, `emergencyWithdraw()` (~line 133)

### Description

`emergencyWithdraw()` is restricted only by `onlyOwner` and has no other constraints — no timelock, no cap, no pause-only condition, no multisig/governance gate implied by the code itself. It transfers the contract's **entire token balance** to the owner on demand.

```solidity
function emergencyWithdraw() external onlyOwner {
    uint256 balance = token.balanceOf(address(this));
    require(token.transfer(owner, balance), "Transfer failed");
}
```

### Impact

Total, unconditional loss of all user deposits at the discretion of a single privileged address. This is a centralization/rug-pull risk that defeats the purpose of a trustless savings protocol.

### Proof of Concept

```solidity
function test_emergencywithdraw() public {
    vm.startPrank(user1);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(10 ether);

    vm.startPrank(user1);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(10 ether);

    vm.startPrank(user2);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(10 ether);
    vm.stopPrank();

    vm.startPrank(owner);
    timeLockSavings.emergencyWithdraw();

    assertEq(token.balanceOf(address(timeLockSavings)), 0);
    assertEq(token.balanceOf(owner), 3e19);
}
```

Result: the owner drains the full 30 ether deposited by both users in a single call.

### Recommendation

- Remove unrestricted fund-sweep capability entirely, or
- Gate it behind a timelock + multisig/governance, and
- Scope it to only recover accidental/non-principal tokens (never the protocol's own deposit token), following the standard "rescue function" pattern.

---

## [H-02] Contract Pays Withdrawing Users With Other Users' Funds

**Severity:** High
**Location:** `Savings.sol`, `deposit()` / `withdraw()` / reward accounting

### Description

The reward model does not separate each user's principal from the pooled reward liability. As a result, an early withdrawer's principal + reward payout can be funded out of a later depositor's principal rather than out of a genuine, pre-funded reward reserve — the contract behaves like a Ponzi scheme rather than a solvent yield product.

### Impact

- The protocol can become insolvent under normal usage (not an edge case): early withdrawers are paid in full while later or larger depositors may be unable to withdraw at all.
- Users who withdraw later can lose part or all of their principal, and may be permanently unable to withdraw if the contract balance is insufficient.

### Proof of Concept

```solidity
function test_withdraw() public {
    vm.startPrank(user1);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(1000 ether);

    vm.startPrank(user1);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(10 ether);

    vm.startPrank(user2);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(100 ether);

    vm.startPrank(user1);
    vm.warp(90 days);
    timeLockSavings.withdraw(0);

    vm.startPrank(user2);
    vm.warp(90 days);
    timeLockSavings.withdraw(0);

    assertGt(token.balanceOf(user1), 1000 ether);
    assertLt(token.balanceOf(user2), 100 ether);
}
```

Result: user2's withdrawal reverts with `ERC20InsufficientBalance` — the contract cannot pay out user2 because user1's inflated withdrawal already consumed the funds:

```
[Revert] ERC20InsufficientBalance(user2, 80000003858024727839 [8e19], 102999999614197511663 [1.029e20])
```

### Recommendation

- Fund reward payouts from a dedicated, pre-capitalized reward pool that is separate from user principal.
- Track each user's principal independently and never allow withdrawal logic to touch another user's deposited balance.
- Add a solvency invariant test: at any point, `sum(userClaimable) <= token.balanceOf(contract)`.

---

## [M-01] Early-Withdrawal Penalty Applied Even When Lock Requirement Is Exactly Met

**Severity:** Medium
**Location:** `Savings.sol`, `withdraw()`

### Description

Per the protocol's documented terms, the minimum lock period is 60 days. A user who withdraws at exactly 60 days should be treated as having met the lock requirement and should not be penalized. In practice, withdrawing at exactly `60 days` still applies the early-withdrawal penalty, an off-by-one/boundary condition error.

### Impact

Users who follow the protocol's stated terms exactly are charged a penalty they were told they would not incur — direct, unexpected loss of funds and a breach of documented contract behavior.

### Proof of Concept

```solidity
function test_withdraw() public {
    vm.startPrank(user1);
    token.approve(address(timeLockSavings), type(uint256).max);
    timeLockSavings.deposit(10 ether);

    vm.startPrank(user1);
    vm.warp(60 days);
    timeLockSavings.withdraw(0);
    assertGt(10 ether, token.balanceOf(user1));
}
```

Result: the user receives less than their 10 ether principal back, despite withdrawing exactly at the documented 60-day minimum.

### Recommendation

Review the boundary condition in the lock-period check (likely `<` vs `<=`) so that `timeElapsed >= minLockPeriod` is treated as satisfying the lock requirement.

---

## [QA-01] `Deposited` Event Emits Parameters in the Wrong Order

**Severity:** Low / QA
**Location:** `Savings.sol`, line 33 (event declaration) vs. line 56 (emit)

### Description

The event is declared as:

```solidity
event Deposited(address indexed user, uint256 amount, uint256 depositId);
```

but emitted as:

```solidity
emit Deposited(msg.sender, userDeposits[msg.sender].length - 1, _amount);
```

This swaps `amount` and `depositId`, so any off-chain consumer (indexers, front-ends, subgraphs) decoding the event by field name will read the deposit ID as the amount and vice versa.

### Impact

Downstream integrations relying on this event will display or compute incorrect values, potentially leading to user-facing confusion or broken accounting in integrated systems.

### Recommendation

```diff
- emit Deposited(msg.sender, userDeposits[msg.sender].length - 1, _amount);
+ emit Deposited(msg.sender, _amount, userDeposits[msg.sender].length - 1);
```

---

## [QA-02] `calculateReward()` Called With Arguments in the Wrong Order

**Severity:** Low / QA
**Location:** `Savings.sol`, `withdraw()`

### Description

`calculateReward` is defined to take `(uint256 _amount, uint256 _timeElapsed)`, but is called in the `withdraw()` function's `else` branch as `calculateReward(timeElapsed, amount)` — the arguments are swapped.

### Impact

Reward calculations in the affected branch will use the wrong values for amount and elapsed time, producing incorrect reward payouts (either over- or under-payment depending on the function's internal math).

### Recommendation

```diff
- uint256 reward = calculateReward(timeElapsed, amount);
+ uint256 reward = calculateReward(amount, timeElapsed);
```

---

## Methodology

Manual line-by-line review of `Savings.sol`, followed by Foundry-based proof-of-concept tests to validate exploitability of each finding rather than relying on static analysis alone. All PoCs above are reproducible against the test repo linked at the top of this report.
