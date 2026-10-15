// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IVouch {
    function isVerified(address account) external view returns (bool);
}

interface ICollabRegistry {
    function getCollab(bytes32 takeFingerprint)
        external
        view
        returns (
            bytes32 beatFingerprint,
            address producer,
            address rapper,
            uint16 producerShareBps,
            bool approved
        );
}

/// @title BeatEscrow — the verified lane for BeatNFT sales.
/// @notice The on-chain version of "the coin goes out and comes back": the
/// producer lists licenses (deposited here, tagged with the beat's
/// fingerprint as the lot#), a VOUCH-holding buyer locks the exact ETH, and
/// `settle` atomically swaps NFT -> buyer and ETH -> the payees in one call.
/// Every settlement takes the platform fee off the top, then — when the lot
/// is an approved collab take — splits the remainder between producer and
/// rapper per the CollabRegistry terms. Nobody trusts anyone's math.
/// Either side can unwind before settlement. Works for lease batches and for
/// the exclusive 1-of-1 alike.
contract BeatEscrow is ERC1155Holder, Ownable {
    IVouch public vouch;
    ICollabRegistry public collabRegistry;
    address public treasury;
    uint16 public platformFeeBps; // 500 = 5%
    uint16 public constant MAX_FEE_BPS = 1000; // never above 10%
    uint256 private _nextListingId = 1;

    struct Listing {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 amount;
        uint256 priceWei;
        bytes32 fingerprint; // lot#
        address buyer;
        uint64 expiresAt; // after this, the seller can reclaim + refund
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        bytes32 indexed fingerprint,
        uint256 tokenId,
        uint256 amount,
        uint256 priceWei
    );
    event Funded(uint256 indexed listingId, address indexed buyer, uint256 valueWei);
    event Settled(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed seller,
        uint256 valueWei
    );
    event Cancelled(uint256 indexed listingId);
    event Refunded(uint256 indexed listingId, address indexed buyer);
    event Reclaimed(uint256 indexed listingId);
    event SettledSplit(
        uint256 indexed listingId,
        address indexed producer,
        address indexed rapper,
        uint256 producerWei,
        uint256 rapperWei
    );

    constructor(
        address vouch_,
        address collab_,
        address treasury_,
        uint16 platformFeeBps_
    ) Ownable(msg.sender) {
        require(vouch_ != address(0), "BeatEscrow: zero vouch");
        require(treasury_ != address(0), "BeatEscrow: zero treasury");
        require(platformFeeBps_ <= MAX_FEE_BPS, "BeatEscrow: fee too high");
        vouch = IVouch(vouch_);
        collabRegistry = ICollabRegistry(collab_);
        treasury = treasury_;
        platformFeeBps = platformFeeBps_;
    }

    function setVouch(address vouch_) external onlyOwner {
        require(vouch_ != address(0), "BeatEscrow: zero vouch");
        vouch = IVouch(vouch_);
    }

    /// @notice Point escrow at the collab registry (or address(0) to disable splits).
    function setCollabRegistry(address collab_) external onlyOwner {
        collabRegistry = ICollabRegistry(collab_);
    }

    /// @notice Move the platform fee destination (multisig, before real money flows).
    function setTreasury(address treasury_) external onlyOwner {
        require(treasury_ != address(0), "BeatEscrow: zero treasury");
        treasury = treasury_;
    }

    /// @notice Adjust the platform fee, capped at 10%.
    function setPlatformFeeBps(uint16 platformFeeBps_) external onlyOwner {
        require(platformFeeBps_ <= MAX_FEE_BPS, "BeatEscrow: fee too high");
        platformFeeBps = platformFeeBps_;
    }

    /// @notice Producer lists `amount` licenses: they move into escrow now.
    /// @param expirySeconds how long the buyer has to complete the deal
    ///        (min 1 hour, max 90 days) before the seller can reclaim.
    function list(
        address nft,
        uint256 tokenId,
        uint256 amount,
        uint256 priceWei,
        bytes32 fingerprint,
        uint64 expirySeconds
    ) external returns (uint256) {
        require(amount > 0, "BeatEscrow: zero amount");
        require(priceWei > 0, "BeatEscrow: zero price");
        require(fingerprint != bytes32(0), "BeatEscrow: zero fingerprint");
        require(expirySeconds >= 1 hours, "BeatEscrow: expiry too short");
        require(expirySeconds <= 90 days, "BeatEscrow: expiry too long");
        uint256 listingId = _nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            amount: amount,
            priceWei: priceWei,
            fingerprint: fingerprint,
            buyer: address(0),
            expiresAt: uint64(block.timestamp) + expirySeconds,
            active: true
        });
        IERC1155(nft).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        emit Listed(listingId, msg.sender, fingerprint, tokenId, amount, priceWei);
        return listingId;
    }

    /// @notice Verified buyer locks the exact price. The "reader" check.
    function fund(uint256 listingId) external payable {
        Listing storage l = listings[listingId];
        require(l.active, "BeatEscrow: inactive");
        require(l.buyer == address(0), "BeatEscrow: already funded");
        require(vouch.isVerified(msg.sender), "BeatEscrow: buyer not verified");
        require(msg.value == l.priceWei, "BeatEscrow: wrong payment");
        l.buyer = msg.sender;
        emit Funded(listingId, msg.sender, msg.value);
    }

    /// @notice Atomically swap: NFT -> buyer, ETH -> payees. Callable by anyone
    /// once funded; re-checks the buyer's vouch so a revoked buyer can't settle.
    /// The platform fee comes off the top to the treasury; when the lot is an
    /// approved collab take, the remainder splits producer/rapper per the
    /// registered terms, otherwise it all goes to the seller.
    function settle(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "BeatEscrow: inactive");
        require(l.buyer != address(0), "BeatEscrow: not funded");
        require(vouch.isVerified(l.buyer), "BeatEscrow: buyer verification lapsed");
        l.active = false;
        IERC1155(l.nft).safeTransferFrom(address(this), l.buyer, l.tokenId, l.amount, "");

        uint256 fee = (l.priceWei * platformFeeBps) / 10000;
        uint256 remainder = l.priceWei - fee;
        if (fee > 0) {
            (bool feeOk, ) = treasury.call{value: fee}("");
            require(feeOk, "BeatEscrow: fee payout failed");
        }

        (address producer, uint16 producerBps, bool isCollab) = _collabTerms(l.fingerprint);
        if (isCollab) {
            (, , address rapper, , ) = collabRegistry.getCollab(l.fingerprint);
            uint256 producerCut = (remainder * producerBps) / 10000;
            uint256 rapperCut = remainder - producerCut;
            (bool pOk, ) = producer.call{value: producerCut}("");
            require(pOk, "BeatEscrow: producer payout failed");
            (bool rOk, ) = rapper.call{value: rapperCut}("");
            require(rOk, "BeatEscrow: rapper payout failed");
            emit SettledSplit(listingId, producer, rapper, producerCut, rapperCut);
        } else {
            (bool ok, ) = l.seller.call{value: remainder}("");
            require(ok, "BeatEscrow: payout failed");
        }
        emit Settled(listingId, l.buyer, l.seller, l.priceWei);
    }

    /// @notice Look up approved collab terms for a lot fingerprint. Returns
    /// (producer, producerBps, isCollab).
    function _collabTerms(bytes32 fingerprint)
        internal
        view
        returns (address, uint16, bool)
    {
        if (address(collabRegistry) == address(0)) return (address(0), 0, false);
        (, address producer, , uint16 producerBps, bool approved) =
            collabRegistry.getCollab(fingerprint);
        if (!approved || producer == address(0)) return (address(0), 0, false);
        return (producer, producerBps, true);
    }

    /// @notice Seller pulls an unfunded listing: licenses come home.
    function cancel(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "BeatEscrow: inactive");
        require(msg.sender == l.seller, "BeatEscrow: not the seller");
        require(l.buyer == address(0), "BeatEscrow: already funded");
        l.active = false;
        IERC1155(l.nft).safeTransferFrom(address(this), l.seller, l.tokenId, l.amount, "");
        emit Cancelled(listingId);
    }

    /// @notice Buyer backs out before settlement: ETH back, licenses to seller.
    function refund(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "BeatEscrow: inactive");
        require(msg.sender == l.buyer, "BeatEscrow: not the buyer");
        l.active = false;
        IERC1155(l.nft).safeTransferFrom(address(this), l.seller, l.tokenId, l.amount, "");
        (bool ok, ) = l.buyer.call{value: l.priceWei}("");
        require(ok, "BeatEscrow: refund failed");
        emit Refunded(listingId, l.buyer);
    }

    /// @notice After expiry, the seller unwinds a stuck deal: licenses come
    /// home and the buyer's ETH is returned. Covers the case where the
    /// buyer's vouch was revoked after funding, so `settle` can never run.
    function reclaim(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "BeatEscrow: inactive");
        require(msg.sender == l.seller, "BeatEscrow: not the seller");
        require(l.buyer != address(0), "BeatEscrow: not funded");
        require(block.timestamp > l.expiresAt, "BeatEscrow: not expired");
        l.active = false;
        IERC1155(l.nft).safeTransferFrom(address(this), l.seller, l.tokenId, l.amount, "");
        (bool ok, ) = l.buyer.call{value: l.priceWei}("");
        require(ok, "BeatEscrow: reclaim refund failed");
        emit Reclaimed(listingId);
    }
}
