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

/// @title BeatOffers — buyers send offers on beats.
/// @notice A verified buyer locks ETH as an offer for lease licenses or the
/// exclusive 1-of-1. The producer accepts (atomic swap: licenses -> buyer,
/// ETH -> producer), rejects (instant refund), or lets it expire. The buyer
/// can cancel for a full refund any time before acceptance. To accept, the
/// producer must have approved this contract to move their licenses.
contract BeatOffers is ERC1155Holder, Ownable, ReentrancyGuard {
    IBeatRegistry public immutable registry;
    IVouch public vouch;
    uint256 private _nextOfferId = 1;

    struct Offer {
        address buyer;
        address nft;
        bytes32 fingerprint;
        bool exclusive;
        uint256 amount; // licenses wanted (1 for the exclusive)
        uint256 priceWei; // total ETH locked = buyer's current bid
        uint256 askPriceWei; // producer's counter-ask, 0 = none
        bool isFinal; // take-it-or-leave-it: shortened fuse, Volt presents it
        uint64 expiresAt;
        bool active;
    }

    mapping(uint256 => Offer) public offers;

    event OfferMade(
        uint256 indexed offerId,
        bytes32 indexed fingerprint,
        address indexed buyer,
        bool exclusive,
        uint256 amount,
        uint256 priceWei,
        uint64 expiresAt
    );
    event OfferAccepted(uint256 indexed offerId, address indexed producer, uint256 priceWei);
    event OfferCancelled(uint256 indexed offerId);
    event OfferRejected(uint256 indexed offerId);
    event OfferExpired(uint256 indexed offerId);
    event BidUpdated(uint256 indexed offerId, uint256 newBidWei);
    event AskPlaced(uint256 indexed offerId, uint256 askPriceWei);
    event AskWithdrawn(uint256 indexed offerId);
    /// @notice A bid/ask went final: 24h take-it-or-leave-it fuse.
    event OfferFinalized(uint256 indexed offerId, uint64 expiresAt);

    constructor(address registry_, address vouch_) Ownable(msg.sender) {
        require(registry_ != address(0), "BeatOffers: zero registry");
        require(vouch_ != address(0), "BeatOffers: zero vouch");
        registry = IBeatRegistry(registry_);
        vouch = IVouch(vouch_);
    }

    function setVouch(address vouch_) external onlyOwner {
        require(vouch_ != address(0), "BeatOffers: zero vouch");
        vouch = IVouch(vouch_);
    }

    /// @notice Token ID is derived from (nft, fingerprint) — never stored.
    function _tokenId(Offer storage o) internal view returns (uint256) {
        return
            o.exclusive
                ? IBeatNFT(o.nft).exclusiveTokenId(o.fingerprint)
                : IBeatNFT(o.nft).leaseTokenId(o.fingerprint);
    }

    function _producerOf(Offer storage o) internal view returns (address) {
        (address producer, , ) = registry.getBeat(o.fingerprint);
        return producer;
    }

    /// @notice Buyer locks an offer. Duration 1 hour .. 90 days.
    function makeOffer(
        address nft,
        bytes32 fingerprint,
        bool exclusive,
        uint256 amount,
        uint64 durationSeconds
    ) external payable returns (uint256) {
        return
            _makeOffer(
                msg.sender,
                nft,
                fingerprint,
                exclusive,
                amount,
                durationSeconds,
                msg.value
            );
    }

    /// @notice Buyer opens with a FINAL offer straight away: take-it-or-leave-it,
    /// 24-hour fuse.
    function makeFinalOffer(
        address nft,
        bytes32 fingerprint,
        bool exclusive,
        uint256 amount
    ) external payable returns (uint256) {
        uint256 offerId = _makeOffer(
            msg.sender,
            nft,
            fingerprint,
            exclusive,
            amount,
            FINAL_FUSE,
            msg.value
        );
        Offer storage o = offers[offerId];
        o.isFinal = true;
        emit OfferFinalized(offerId, o.expiresAt);
        return offerId;
    }

    /// @dev Shared offer-creation logic (internal so msg.sender is the buyer).
    function _makeOffer(
        address buyer,
        address nft,
        bytes32 fingerprint,
        bool exclusive,
        uint256 amount,
        uint64 durationSeconds,
        uint256 valueWei
    ) internal returns (uint256) {
        require(registry.isRegistered(fingerprint), "BeatOffers: beat not registered");
        require(vouch.isVerified(buyer), "BeatOffers: buyer not verified");
        require(valueWei > 0, "BeatOffers: zero offer");
        require(
            durationSeconds >= 1 hours && durationSeconds <= 90 days,
            "BeatOffers: bad duration"
        );
        if (exclusive) {
            require(amount == 1, "BeatOffers: exclusive is 1-of-1");
        } else {
            require(amount > 0, "BeatOffers: zero amount");
        }

        uint256 offerId = _nextOfferId++;
        Offer storage o = offers[offerId];
        o.buyer = buyer;
        o.nft = nft;
        o.fingerprint = fingerprint;
        o.exclusive = exclusive;
        o.amount = amount;
        o.priceWei = valueWei;
        o.askPriceWei = 0;
        o.isFinal = false;
        o.expiresAt = uint64(block.timestamp) + durationSeconds;
        o.active = true;

        emit OfferMade(
            offerId,
            fingerprint,
            buyer,
            exclusive,
            amount,
            valueWei,
            o.expiresAt
        );
        return offerId;
    }

    /// @dev Execute the deal at salePrice (<= locked bid): licenses -> buyer,
    /// salePrice -> producer, any remainder -> buyer.
    function _settle(Offer storage o, uint256 offerId, uint256 salePrice) internal {
        address producer = _producerOf(o);
        uint256 tokenId = _tokenId(o);
        require(
            IERC1155(o.nft).balanceOf(producer, tokenId) >= o.amount,
            "BeatOffers: producer lacks licenses"
        );
        uint256 locked = o.priceWei;
        address buyer = o.buyer;
        o.active = false;
        o.askPriceWei = 0;
        IERC1155(o.nft).safeTransferFrom(producer, buyer, tokenId, o.amount, "");
        (bool ok1, ) = producer.call{value: salePrice}("");
        require(ok1, "BeatOffers: payout failed");
        if (locked > salePrice) {
            (bool ok2, ) = buyer.call{value: locked - salePrice}("");
            require(ok2, "BeatOffers: refund failed");
        }
        emit OfferAccepted(offerId, producer, salePrice);
    }

    /// @notice Producer accepts the buyer's current bid: atomic swap of
    /// licenses -> buyer and locked ETH -> producer. Producer must have
    /// approved this contract.
    function acceptOffer(uint256 offerId) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == _producerOf(o), "BeatOffers: not the beat owner");
        _settle(o, offerId, o.priceWei);
    }

    /// @notice Buyer adds ETH to their bid.
    function raiseOffer(uint256 offerId) external payable nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == o.buyer, "BeatOffers: not the buyer");
        require(msg.value > 0, "BeatOffers: zero raise");
        o.priceWei += msg.value;
        emit BidUpdated(offerId, o.priceWei);
    }

    /// @notice Buyer lowers their bid; the difference is refunded immediately.
    function lowerOffer(uint256 offerId, uint256 newBidWei) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == o.buyer, "BeatOffers: not the buyer");
        require(newBidWei > 0 && newBidWei < o.priceWei, "BeatOffers: bad new bid");
        uint256 refund = o.priceWei - newBidWei;
        o.priceWei = newBidWei;
        (bool ok, ) = o.buyer.call{value: refund}("");
        require(ok, "BeatOffers: refund failed");
        emit BidUpdated(offerId, newBidWei);
    }

    /// @notice Producer counters with an asking price. If the ask is at or
    /// below the buyer's locked bid, the deal executes immediately at the
    /// ask price and the difference is refunded to the buyer.
    function counterOffer(uint256 offerId, uint256 askPriceWei) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == _producerOf(o), "BeatOffers: not the beat owner");
        require(askPriceWei > 0, "BeatOffers: zero ask");
        if (askPriceWei <= o.priceWei) {
            _settle(o, offerId, askPriceWei);
        } else {
            o.askPriceWei = askPriceWei;
            emit AskPlaced(offerId, askPriceWei);
        }
    }

    /// @notice Producer withdraws their counter-ask; the buyer's bid stands.
    function withdrawAsk(uint256 offerId) external {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(msg.sender == _producerOf(o), "BeatOffers: not the beat owner");
        require(o.askPriceWei > 0, "BeatOffers: no ask");
        o.askPriceWei = 0;
        emit AskWithdrawn(offerId);
    }

    /// @notice Final-offer fuse: 24 hours, take it or leave it.
    uint64 public constant FINAL_FUSE = 24 hours;

    /// @dev Shorten an offer's expiry to the final fuse. Never extends it.
    function _applyFinalFuse(Offer storage o, uint256 offerId) internal {
        o.isFinal = true;
        uint64 fuseEnd = uint64(block.timestamp) + FINAL_FUSE;
        if (fuseEnd < o.expiresAt) {
            o.expiresAt = fuseEnd;
        }
        emit OfferFinalized(offerId, o.expiresAt);
    }

    /// @notice Buyer escalates their bid to FINAL: take-it-or-leave-it,
    /// 24-hour fuse. This is the move Volt suggests when talks stall.
    function markBidFinal(uint256 offerId) external {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == o.buyer, "BeatOffers: not the buyer");
        require(!o.isFinal, "BeatOffers: already final");
        _applyFinalFuse(o, offerId);
    }

    /// @notice Producer counters with a FINAL ask: 24-hour fuse. If the
    /// final ask is at or below the locked bid, the deal executes
    /// immediately at the ask price.
    function counterFinal(uint256 offerId, uint256 askPriceWei) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == _producerOf(o), "BeatOffers: not the beat owner");
        require(!o.isFinal, "BeatOffers: already final");
        require(askPriceWei > 0, "BeatOffers: zero ask");
        if (askPriceWei <= o.priceWei) {
            _settle(o, offerId, askPriceWei);
        } else {
            o.askPriceWei = askPriceWei;
            emit AskPlaced(offerId, askPriceWei);
            _applyFinalFuse(o, offerId);
        }
    }

    /// @notice Buyer meets the producer's ask: tops up the difference when
    /// the ask exceeds the locked bid, then the deal executes at the ask.
    function acceptAsk(uint256 offerId) external payable nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp <= o.expiresAt, "BeatOffers: expired");
        require(msg.sender == o.buyer, "BeatOffers: not the buyer");
        uint256 ask = o.askPriceWei;
        require(ask > 0, "BeatOffers: no ask");
        if (ask > o.priceWei) {
            require(msg.value == ask - o.priceWei, "BeatOffers: wrong top-up");
            o.priceWei = ask;
        } else {
            require(msg.value == 0, "BeatOffers: no top-up needed");
        }
        _settle(o, offerId, ask);
    }

    /// @notice Buyer cancels before acceptance: full refund.
    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(msg.sender == o.buyer, "BeatOffers: not the buyer");
        o.active = false;
        (bool ok, ) = o.buyer.call{value: o.priceWei}("");
        require(ok, "BeatOffers: refund failed");
        emit OfferCancelled(offerId);
    }

    /// @notice Producer declines: locked ETH goes straight back to the buyer.
    function rejectOffer(uint256 offerId) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(msg.sender == _producerOf(o), "BeatOffers: not the beat owner");
        o.active = false;
        (bool ok, ) = o.buyer.call{value: o.priceWei}("");
        require(ok, "BeatOffers: refund failed");
        emit OfferRejected(offerId);
    }

    /// @notice After expiry the buyer reclaims the locked ETH.
    function reclaimExpired(uint256 offerId) external nonReentrant {
        Offer storage o = offers[offerId];
        require(o.active, "BeatOffers: inactive");
        require(block.timestamp > o.expiresAt, "BeatOffers: not expired");
        require(msg.sender == o.buyer, "BeatOffers: not the buyer");
        o.active = false;
        (bool ok, ) = o.buyer.call{value: o.priceWei}("");
        require(ok, "BeatOffers: refund failed");
        emit OfferExpired(offerId);
    }
}
