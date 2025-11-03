# Security Researcher :- Redteamer
# Bugs Found
- QA - 02
- Medium - 01
- High - 02


# QA - 01 - Deposit function emits wrong values

Description:
code affected: Savings.sol

In line 33, event Deposited(address indexed user, uint256 amount, uint256 depositId); but in line 56 - emit Deposited(msg.sender, userDeposits[msg.sender].length - 1, _amount);

the event expects user, amount, depositId but deposit emits user, depositId, amount, this will confuse the user and may lead to bad calculations in implemetation.

Recommendation:
change Deposited(msg.sender, userDeposits[msg.sender].length - 1, _amount); to Deposited(msg.sender, _amount, userDeposits[msg.sender].length - 1);

```diff
- emit Deposited(msg.sender, userDeposits[msg.sender].length - 1, _amount);
+ emit Deposited(msg.sender, _amount, userDeposits[msg.sender].length - 1);

```

# QA - 02 - Values varaiation in calculate reward

- ``` calculateReward ``` takes ``` uint256 _amount, uint256 _timeElapsed ``` in its function but uses ``` timeElapsed, amount ``` in withdraw function.
- in the ```else``` statement

```diff
- uint256 reward = calculateReward(timeElapsed, amount);
+ uint256 reward = calculateReward(amount, timeElapsed);
```


# M - 01 - User pay penalty fee even after meeting requirement


## Description: 
According to the contract documentation, minimum lock day is 60 days but user who withdraw exactly on 60 days pays a penalty fee. this breaks the contract logic and cause financial los to users

## Impact
- Loss of funds from the user
- User loses trust in protocol

## Poc

```solidity
    function test_withdraw() public{

        vm.startPrank(user1);
        token.approve(address(timeLockSavings), type(uint256).max);
        timeLockSavings.deposit(10 ether);

        vm.startPrank(user1);
        vm.warp(60 days);
        timeLockSavings.withdraw(0);
        assertGt(10 ether, token.balanceOf(user1));

    }
```

# H - 01 - Contract deployer can rug pull all funds

Description:
code affected: Savings.sol

In line 133 , ``` function emergencyWithdraw ```
code: 
```solidity
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(owner, balance), "Transfer failed");
    }
```

## Description

1. users deposit into the contract
2. owner of the contract uses emergencyWithdrawn function to withdraw all the balance of the contract
3. users loses all their money

## POC

```solidity
    function test_emergencywithdraw() public{

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

# H - 02 - contract pays users with other users fund.

## Description:

1. user 1 deposits 1000 and then 10 ether
2. user 2 deposits 100 ether
3. user 1 withdrawa after 90 days which makes him withdraw 1030 ether

## Impact
- The contract operates in a ponzi way, users are paid with other users fund and the early withdrawals earn while late withdrawals loses all or partial funds
- and losing even half of a fund for one who should withdraw full amount or full amount with reward will result in locking of amount in the contract, so user who withdraw late and have lost some of their funds to early withdrawals can even withdraw at all.

## POC
```solidity
    function test_withdraw() public{

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
        assertLt(token.balanceOf(user2), 100 ether)

    }
```
Error returned: 
```
 ├─ [27059] TimeLockSavings::withdraw(0)
    │   ├─ [1538] MockERC20::transfer(user2: [0x537C8f3d3E18dF5517a58B3fB9D9143697996802], 102999999614197511663 [1.029e20])
    │   │   └─ ← [Revert] ERC20InsufficientBalance(0x88F59F8826af5e695B13cA934d6c7999875A9EeA, 80000003858024727839 [8e19], 102999999614197511663 [1.029e20])
    │   └─ ← [Revert] ERC20InsufficientBalance(0x88F59F8826af5e695B13cA934d6c7999875A9EeA, 80000003858024727839 [8e19], 102999999614197511663 [1.029e20])
    └─ ← [Revert] ERC20InsufficientBalance(0x88F59F8826af5e695B13cA934d6c7999875A9EeA, 80000003858024727839 [8e19], 102999999614197511663 [1.029e20])

Suite result: FAILED. 0 passed; 1 failed; 0 skipped; finished in 3.02ms (1.06ms CPU time)

Ran 1 test suite in 53.56ms (3.02ms CPU time): 0 tests passed, 1 failed, 0 skipped (1 total tests)

Failing tests:
Encountered 1 failing test in test/Savings.t.sol:Savings
[FAIL: ERC20InsufficientBalance(0x88F59F8826af5e695B13cA934d6c7999875A9EeA, 80000003858024727839 [8e19], 102999999614197511663 [1.029e20])] test_withdraw() (gas: 471957)
```