// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IVouch {
    function isVerified(address account) external view returns (bool);
}

/// @title BeatEscrow — the verified lane for BeatNFT sales.
/// @notice The on-chain version of "the coin goes out and comes back": the
/// producer lists licenses (deposited here, tagged with the beat's
/// fingerprint as the lot#), a VOUCH-holding buyer locks the exact ETH, and
/// `settle` atomically swaps NFT -> buyer and ETH -> producer in one call.
/// Either side can unwind before settlement. Works for lease batches and for
/// the exclusive 1-of-1 alike.
contract BeatEscrow is ERC1155Holder, Ownable {
    IVouch public vouch;
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

    constructor(address vouch_) Ownable(msg.sender) {
        require(vouch_ != address(0), "BeatEscrow: zero vouch");
        vouch = IVouch(vouch_);
    }

    function setVouch(address vouch_) external onlyOwner {
        require(vouch_ != address(0), "BeatEscrow: zero vouch");
        vouch = IVouch(vouch_);
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

    /// @notice Atomically swap: NFT -> buyer, ETH -> seller. Callable by anyone
    /// once funded; re-checks the buyer's vouch so a revoked buyer can't settle.
    function settle(uint256 listingId) external {
        Listing storage l = listings[listingId];
        require(l.active, "BeatEscrow: inactive");
        require(l.buyer != address(0), "BeatEscrow: not funded");
        require(vouch.isVerified(l.buyer), "BeatEscrow: buyer verification lapsed");
        l.active = false;
        IERC1155(l.nft).safeTransferFrom(address(this), l.buyer, l.tokenId, l.amount, "");
        (bool ok, ) = l.seller.call{value: l.priceWei}("");
        require(ok, "BeatEscrow: payout failed");
        emit Settled(listingId, l.buyer, l.seller, l.priceWei);
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
