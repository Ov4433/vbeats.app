// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VbeatsStaking — stake 1,000 VBEATS to sell.
/// @notice Membership stake for Verified Beats Studio (Star decision,
/// 2026-11-13: "Yes, build staking at 1,000 VBEATS"; gate refined
/// 23:34 CT: "Stake to sell, buying stays open"). Stake exactly
/// 1,000 VBEATS (18 decimals) and the wallet counts as a member: selling
/// / listing, Make a song, the producer dashboard and the feature inbox
/// unlock. The free studio stays free, buying beats in ETH stays open
/// to everyone, and voting keeps its existing hold-based weights — no
/// stake required to vote or buy.
///
/// There is NO yield, NO slashing and NO lockup: unstake() returns the
/// full 1,000 VBEATS. The reward for staking IS the access.
///
/// This is NOT BeatStaking (0x0915dfab… on Base) — that contract is ETH
/// stake-to-lease for beats, a different thing. This contract lives on
/// Robinhood Chain (chainId 4663), where VBEATS lives
/// (0x41b049ad7d0b25e7e534b1986e46a643185f3e24), and holds VBEATS only.
/// Buys stay ETH on Base; VBEATS is never a payment path for beats.
///
/// Source only — NOT deployed. Deploy step is in CHANGELOG.md.
contract VbeatsStaking is Ownable {
    /// @notice Exactly how much VBEATS a stake is: 1,000 VBEATS, 18 decimals.
    uint256 public constant STAKE_AMOUNT = 1000 ether;

    /// @notice The VBEATS token this contract holds.
    IERC20 public immutable token;

    /// @notice staker => VBEATS currently staked (0 or STAKE_AMOUNT).
    mapping(address => uint256) public stakedAmount;

    event Staked(address indexed staker, uint256 amount);
    event Unstaked(address indexed staker, uint256 amount);

    /// @param vbeatsToken_ The VBEATS token address on Robinhood Chain.
    /// The ONLY constructor argument.
    constructor(address vbeatsToken_) Ownable(msg.sender) {
        require(vbeatsToken_ != address(0), "VbeatsStaking: zero token");
        token = IERC20(vbeatsToken_);
    }

    /// @notice Stake exactly 1,000 VBEATS. The caller must approve this
    /// contract for 1,000 VBEATS first (two wallet confirmations:
    /// approve, then stake — standard ERC20 staking). One stake per
    /// wallet: staking again while staked reverts.
    function stake() external {
        require(stakedAmount[msg.sender] == 0, "VbeatsStaking: already staked");
        require(
            token.transferFrom(msg.sender, address(this), STAKE_AMOUNT),
            "VbeatsStaking: transfer failed"
        );
        stakedAmount[msg.sender] = STAKE_AMOUNT;
        emit Staked(msg.sender, STAKE_AMOUNT);
    }

    /// @notice Unstake and get the full 1,000 VBEATS back. No lockup,
    /// no slashing, no fee — the whole stake returns.
    function unstake() external {
        uint256 amount = stakedAmount[msg.sender];
        require(amount > 0, "VbeatsStaking: nothing staked");
        stakedAmount[msg.sender] = 0;
        require(
            token.transfer(msg.sender, amount),
            "VbeatsStaking: transfer failed"
        );
        emit Unstaked(msg.sender, amount);
    }

    /// @notice Whether this wallet currently has the full 1,000 VBEATS staked.
    function isStaked(address account) external view returns (bool) {
        return stakedAmount[account] >= STAKE_AMOUNT;
    }
}
