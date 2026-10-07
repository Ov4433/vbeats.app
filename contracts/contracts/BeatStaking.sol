// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IBeatRegistry {
    function getBeat(bytes32 fingerprint)
        external
        view
        returns (address owner, uint256 timestamp, string memory metadataURI);
    function isRegistered(bytes32 fingerprint) external view returns (bool);
}

interface IBeatNFT {
    function leaseTokenId(bytes32 fingerprint) external pure returns (uint256);
    function exclusiveTokenId(bytes32 fingerprint) external pure returns (uint256);
}

interface IVouch {
    function isVerified(address account) external view returns (bool);
}

/// @title BeatStaking — stake-to-lease for Verified Beats Studio beats.
/// @notice A staker locks ETH for N days and holds the lease licenses while
/// the stake is active (the tokens stay with them afterwards as a ticket
/// stub; the on-chain expiry is the source of truth for lease rights).
/// - Nobody buys the exclusive before expiry → the locked stake splits:
///   50% producer, 25% back to the staker, 25% VBeats platform.
/// - Someone buys the exclusive mid-lease → the staker is refunded in full,
///   the buyer takes the 1-of-1, the producer takes the buyout price.
/// Stakers must hold a VOUCH (verified, no scammer activity).
contract BeatStaking is ERC1155Holder, Ownable, ReentrancyGuard {
    IBeatRegistry public immutable registry;
    IVouch public vouch;
    /// @notice VBeats treasury: receives the 25% platform cut on every expiry.
    address public platform;

    uint256 private _nextListingId = 1;
    uint256 private _nextStakeId = 1;

    struct Listing {
        address producer;
        address nft;
        uint256 licensesPerStake;
        uint256 licensesAvailable;
        uint256 dailyRateWei;
        uint256 buyoutPriceWei;
        uint64 maxDays;
        bytes32 fingerprint;
        uint256 activeStakeId; // 0 = none
        bool exclusiveHeld;
        bool boughtOut;
        bool active;
    }

    struct Stake {
        uint256 listingId;
        address staker;
        uint256 amountWei;
        uint64 expiresAt;
        bool settled;
    }

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Stake) public stakes;

    event StakeListed(
        uint256 indexed listingId,
        bytes32 indexed fingerprint,
        uint256 dailyRateWei,
        uint256 buyoutPriceWei,
        uint64 maxDays
    );
    event Staked(
        uint256 indexed stakeId,
        uint256 indexed listingId,
        address indexed staker,
        uint64 days_,
        uint256 amountWei,
        uint64 expiresAt
    );
    event BoughtOut(uint256 indexed listingId, address indexed buyer, uint256 priceWei);
    event StakeSettled(
        uint256 indexed stakeId,
        uint256 producerShare,
        uint256 stakerRefund,
        uint256 platformShare
    );
    event ListingCancelled(uint256 indexed listingId);
    event RemainingReclaimed(uint256 indexed listingId);

    constructor(address registry_, address vouch_, address platform_) Ownable(msg.sender) {
        require(registry_ != address(0), "BeatStaking: zero registry");
        require(vouch_ != address(0), "BeatStaking: zero vouch");
        require(platform_ != address(0), "BeatStaking: zero platform");
        registry = IBeatRegistry(registry_);
        vouch = IVouch(vouch_);
        platform = platform_;
    }

    function setVouch(address vouch_) external onlyOwner {
        require(vouch_ != address(0), "BeatStaking: zero vouch");
        vouch = IVouch(vouch_);
    }

    function setPlatform(address platform_) external onlyOwner {
        require(platform_ != address(0), "BeatStaking: zero platform");
        platform = platform_;
    }

    /// @notice Token IDs are derived from (nft, fingerprint) — never stored.
    function _leaseTokenId(Listing storage l) internal view returns (uint256) {
        return IBeatNFT(l.nft).leaseTokenId(l.fingerprint);
    }

    function _exclusiveTokenId(Listing storage l) internal view returns (uint256) {
        return IBeatNFT(l.nft).exclusiveTokenId(l.fingerprint);
    }

    /// @notice Producer lists a beat for stake-to-lease. Deposits
    /// `licenseDeposit` lease licenses plus the exclusive 1-of-1.
    function listStake(
        address nft,
        bytes32 fingerprint,
        uint256 licensesPerStake,
        uint256 licenseDeposit,
        uint256 dailyRateWei,
        uint256 buyoutPriceWei,
        uint64 maxDays
    ) external returns (uint256) {
        require(registry.isRegistered(fingerprint), "BeatStaking: beat not registered");
        (address owner, , ) = registry.getBeat(fingerprint);
        require(msg.sender == owner, "BeatStaking: not the beat owner");
        require(licensesPerStake > 0, "BeatStaking: zero licenses per stake");
        require(licenseDeposit >= licensesPerStake, "BeatStaking: deposit too small");
        require(dailyRateWei > 0, "BeatStaking: zero daily rate");
        require(buyoutPriceWei > 0, "BeatStaking: zero buyout price");
        require(maxDays >= 1 && maxDays <= 365, "BeatStaking: bad max days");

        uint256 listingId = _nextListingId++;
        // Individual storage writes (not one struct literal) to dodge
        // "stack too deep".
        Listing storage l = listings[listingId];
        l.producer = msg.sender;
        l.nft = nft;
        l.licensesPerStake = licensesPerStake;
        l.licensesAvailable = licenseDeposit;
        l.dailyRateWei = dailyRateWei;
        l.buyoutPriceWei = buyoutPriceWei;
        l.maxDays = maxDays;
        l.fingerprint = fingerprint;
        l.activeStakeId = 0;
        l.exclusiveHeld = true;
        l.boughtOut = false;
        l.active = true;

        IERC1155(nft).safeTransferFrom(msg.sender, address(this), _leaseTokenId(l), licenseDeposit, "");
        IERC1155(nft).safeTransferFrom(msg.sender, address(this), _exclusiveTokenId(l), 1, "");
        emit StakeListed(listingId, fingerprint, dailyRateWei, buyoutPriceWei, maxDays);
        return listingId;
    }

    /// @notice Verified staker locks dailyRate * days and takes the lease.
    /// One active stake per listing at a time.
    function stake(uint256 listingId, uint64 days_) external payable nonReentrant {
        Listing storage l = listings[listingId];
        require(l.active && !l.boughtOut, "BeatStaking: not active");
        require(l.activeStakeId == 0, "BeatStaking: already staked");
        require(vouch.isVerified(msg.sender), "BeatStaking: staker not verified");
        require(days_ >= 1 && days_ <= l.maxDays, "BeatStaking: bad day count");
        require(l.licensesAvailable >= l.licensesPerStake, "BeatStaking: no licenses left");
        uint256 amount = l.dailyRateWei * days_;
        require(msg.value == amount, "BeatStaking: wrong stake");

        l.licensesAvailable -= l.licensesPerStake;
        uint256 stakeId = _nextStakeId++;
        l.activeStakeId = stakeId;
        stakes[stakeId] = Stake({
            listingId: listingId,
            staker: msg.sender,
            amountWei: amount,
            expiresAt: uint64(block.timestamp) + days_ * 1 days,
            settled: false
        });

        IERC1155(l.nft).safeTransferFrom(
            address(this), msg.sender, _leaseTokenId(l), l.licensesPerStake, ""
        );
        emit Staked(stakeId, listingId, msg.sender, days_, amount, stakes[stakeId].expiresAt);
    }

    /// @notice Buy the exclusive 1-of-1 mid-lease (or un-staked). The active
    /// staker is refunded in full; the buyer takes the exclusive; the
    /// producer takes the buyout price.
    function buyout(uint256 listingId) external payable nonReentrant {
        Listing storage l = listings[listingId];
        require(l.active && !l.boughtOut, "BeatStaking: not active");
        require(msg.value == l.buyoutPriceWei, "BeatStaking: wrong payment");

        l.boughtOut = true;
        l.active = false;
        l.exclusiveHeld = false;

        uint256 sid = l.activeStakeId;
        if (sid != 0) {
            Stake storage s = stakes[sid];
            s.settled = true;
            l.activeStakeId = 0;
            (bool rok, ) = s.staker.call{value: s.amountWei}("");
            require(rok, "BeatStaking: staker refund failed");
        }

        IERC1155(l.nft).safeTransferFrom(address(this), msg.sender, _exclusiveTokenId(l), 1, "");
        (address producer, , ) = registry.getBeat(l.fingerprint);
        (bool ok, ) = producer.call{value: l.buyoutPriceWei}("");
        require(ok, "BeatStaking: payout failed");
        emit BoughtOut(listingId, msg.sender, l.buyoutPriceWei);
    }

    /// @notice After expiry with no buyout: split the locked stake 50%
    /// producer / 25% back to the staker / 25% platform. Callable by anyone.
    function settleExpired(uint256 listingId) external nonReentrant {
        Listing storage l = listings[listingId];
        require(l.active && !l.boughtOut, "BeatStaking: not active");
        uint256 sid = l.activeStakeId;
        require(sid != 0, "BeatStaking: no active stake");
        Stake storage s = stakes[sid];
        require(!s.settled, "BeatStaking: already settled");
        require(block.timestamp > s.expiresAt, "BeatStaking: lease not expired");

        s.settled = true;
        l.activeStakeId = 0;

        uint256 amount = s.amountWei;
        uint256 producerShare = amount / 2;
        uint256 stakerRefund = amount / 4;
        uint256 platformShare = amount - producerShare - stakerRefund; // dust-safe

        (address producer, , ) = registry.getBeat(l.fingerprint);
        (bool ok1, ) = producer.call{value: producerShare}("");
        require(ok1, "BeatStaking: producer payout failed");
        (bool ok2, ) = s.staker.call{value: stakerRefund}("");
        require(ok2, "BeatStaking: staker refund failed");
        (bool ok3, ) = platform.call{value: platformShare}("");
        require(ok3, "BeatStaking: platform payout failed");
        emit StakeSettled(sid, producerShare, stakerRefund, platformShare);
    }

    /// @notice Producer cancels an unstaked listing: everything comes home.
    function cancelListing(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(msg.sender == l.producer, "BeatStaking: not the producer");
        require(l.active && !l.boughtOut, "BeatStaking: not active");
        require(l.activeStakeId == 0, "BeatStaking: stake active");
        l.active = false;
        l.exclusiveHeld = false;
        uint256 licenses = l.licensesAvailable;
        l.licensesAvailable = 0;
        if (licenses > 0) {
            IERC1155(l.nft).safeTransferFrom(address(this), l.producer, _leaseTokenId(l), licenses, "");
        }
        IERC1155(l.nft).safeTransferFrom(address(this), l.producer, _exclusiveTokenId(l), 1, "");
        emit ListingCancelled(listingId);
    }

    /// @notice Producer reclaims leftover licenses (and the exclusive if it
    /// was never bought) after a listing closes.
    function reclaimRemaining(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(msg.sender == l.producer, "BeatStaking: not the producer");
        require(!l.active, "BeatStaking: still active");
        uint256 licenses = l.licensesAvailable;
        bool hasExclusive = l.exclusiveHeld;
        require(licenses > 0 || hasExclusive, "BeatStaking: nothing left");
        l.licensesAvailable = 0;
        l.exclusiveHeld = false;
        if (licenses > 0) {
            IERC1155(l.nft).safeTransferFrom(address(this), l.producer, _leaseTokenId(l), licenses, "");
        }
        if (hasExclusive) {
            IERC1155(l.nft).safeTransferFrom(address(this), l.producer, _exclusiveTokenId(l), 1, "");
        }
        emit RemainingReclaimed(listingId);
    }
}
