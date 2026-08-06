# [Low] recoverERC20() Does Not Revert If Balance Is Zero — BlackHole

**Platform:** Code4rena
**Contest:** BlackHole (2025-05)
**Severity:** Low (QA)
**File:** `BlackClaims.sol`
**Finding link:** https://code4rena.com/audits/2025-05-blackhole/submissions/S-32

## Summary

`recoverERC20()` in `BlackClaims.sol` does not revert when the contract's token balance is zero. This permits redundant calls that appear to succeed even when there is nothing to recover, breaking the expected invariant that a second/empty recovery attempt should fail.

## Impact

- Wastes gas on redundant, no-op calls.
- Can mislead monitoring, governance tooling, or admin expectations that a call reverting/succeeding conveys meaningful state.
- May mask logical issues during testing or script automation, since tests expecting a revert on repeated recovery attempts silently fail to catch the missing check.

## Proof of Concept

Test cases from `RecoverERC20Test`:

```solidity
function testRecoverERC20WithAlreadyRecoveredShouldFail() public {
    // First call succeeds, draining the balance
    claims.recoverERC20(address(token));

    // Second call should revert due to zero balance, but it doesn't
    vm.expectRevert("not enough balance");
    claims.recoverERC20(address(token)); // This call fails the test
}

function testRecoverERC20WithInsufficientBalanceShouldFail() public {
    // Precondition: Drain the contract
    vm.prank(admin);
    claims.recoverERC20(address(token));

    // Second attempt expected to revert
    vm.expectRevert("not enough balance");
    claims.recoverERC20(address(token)); // This also fails the test
}
```

Both tests demonstrate that `recoverERC20()` succeeds on a second call against a zero balance, when it should revert.

## Recommendation

Add a zero-balance check before attempting the transfer:

```solidity
uint256 bal = IERC20(token).balanceOf(address(this));
require(bal > 0, "not enough balance");
IERC20(token).transfer(owner(), bal);
```

---
*Full submission on [Code4rena](https://code4rena.com/audits/2025-05-blackhole/submissions/S-32).*
