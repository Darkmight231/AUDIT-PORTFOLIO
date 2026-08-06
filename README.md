# Smart Contract Security Audit Portfolio

Security researcher focused on EVM smart contract auditing — competitive audit contests and independent protocol reviews. Findings range from Critical-severity fund-loss vulnerabilities to logic/QA issues, with working Foundry proof-of-concept exploits.

## Track Record

| Severity | Count | Source |
|---|---|---|
| High | 2 | Self-audit (Savings Protocol x2) |
| Medium | 2 | Cantina (Avon — ERC4626 inflation), Self-audit (Savings Protocol) |
| Low / QA / Informational | 4 | Code4rena (BlackHole, GTE Perps and Launchpad), Cantina (Aqua Network), Self-audit (Savings Protocol) |

**Platforms:** [Code4rena](https://code4rena.com) · [Cantina](https://cantina.xyz)

## Contest Findings (Public, Judged)

Findings submitted and validated in live competitive audit contests.

| Protocol | Platform | Severity | Summary | Link |
|---|---|---|---|---|
| Avon | Cantina | Medium | ERC4626 inflation attack — share price manipulation via donation enables theft from subsequent depositors (confirmed, duplicate of #437, 13 submissions) | [report](./contest-findings/cantina/avonpool-erc4626-inflation.md) |
| Aqua Network | Cantina | Informational | Missing bounds check on `fee_fraction` allows a pool to launch with a confiscatory (up to 100%) swap fee (confirmed, duplicate of #338, 11 submissions) | [report](./contest-findings/cantina/aqua-network-fee-bounds.md) |
| GTE Perps and Launchpad | Code4rena | QA | Incomplete dust-attack protection in `Launchpad.buy()` enables micro-trade spam | [report](./contest-findings/code4rena/gte-launchpad-dust-attack.md) |
| BlackHole | Code4rena | Low | `recoverERC20()` does not revert on zero balance | [report](./contest-findings/code4rena/blackhole-recovererc20.md) |

## Other Submissions (Ruled Invalid / Known Issue)

Included for transparency and to show analysis process — these were **not** counted as valid findings by contest judges, so they don't factor into the track record above.

| Protocol | Platform | Ruling | Summary | Link |
|---|---|---|---|---|
| Megapot | Code4rena | Invalid — Out of Scope, known issue (33 duplicates) | Self-referral in `buyTickets()`/`claimWinnings()` lets a buyer reclaim their own referral fee, discounting tickets and inflating winnings at LPs' expense | [report](./contest-findings/code4rena/megapot-self-referral-invalid.md) |

## Independent Audits (Self-Directed)

Full audit reports on selected codebases, written to professional standards with reproducible Foundry PoCs.

| Protocol | Findings | Report |
|---|---|---|
| TimeLock Savings Protocol | 2 High, 1 Medium, 2 QA | [Full report](./self-audits/timelock-savings-protocol/report.md) · [Test repo](https://github.com/Darkmight231/Savings_FF) |

Highlights:
- **[H-01]** Contract owner can drain 100% of deposited user funds via unrestricted `emergencyWithdraw()`
- **[H-02]** Reward accounting flaw lets early withdrawals be paid out of later depositors' principal (Ponzi-like insolvency)
- **[M-01]** Users charged an early-withdrawal penalty even when they meet the exact minimum lock period

## Tooling & Skills

- **Languages:** Solidity, TypeScript, Rust (Soroban/Stellar)
- **Frameworks:** Foundry, Hardhat
- **Focus areas:** ERC4626 vault mechanics, access control, DoS/griefing vectors, accounting/invariant bugs, DeFi economic exploits
- **Methodology:** manual review + PoC-driven validation (every non-trivial finding backed by a runnable exploit test)

## Contact

- GitHub: [Darkmight231](https://github.com/Darkmight231)
- Code4rena / Cantina profile: `Redteamer`
