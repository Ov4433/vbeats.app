// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IBeatRegistry {
    function getBeat(bytes32 fingerprint)
        external
        view
        returns (address owner, uint256 timestamp, string memory metadataURI);
    function isRegistered(bytes32 fingerprint) external view returns (bool);
}

/// @title BeatNFT
/// @notice ERC-1155 licenses for Verified Beats Studio beats.
///         Each license type gets its own token ID, derived deterministically
///         from the beat's SHA-256 fingerprint:
///         - leases:    tokenId = uint256(fingerprint)
///         - exclusive: tokenId = uint256(keccak256("BeatNFT:exclusive", fingerprint))
///         so the 1-of-1 exclusive can never collide with lease editions.
///         - Producers mint lease editions (any supply they choose).
///         - One exclusive 1-of-1 can be minted per beat.
///         - EIP-2981 royalties (10%) pay the producer on secondary sales.
///         - `buy` lets anyone purchase listed licenses with ETH; the
///           producer sets the per-license price with `setPrice`.
contract BeatNFT is ERC1155, ERC1155Holder, ERC2981, Ownable {
    IBeatRegistry public immutable registry;

    /// @notice Default royalty in basis points (1000 = 10%). Adjustable by the
    ///         owner — exact pricing is still TBD, nothing is locked in.
    uint96 public royaltyBps = 1000;
    /// @notice Hard cap: royalties can never exceed 25%.
    uint96 public constant MAX_ROYALTY_BPS = 2500;

    /// fingerprint => lease editions minted so far
    mapping(bytes32 => uint256) public leaseMinted;
    /// fingerprint => exclusive 1-of-1 already minted
    mapping(bytes32 => bool) public exclusiveMinted;
    /// tokenId => sale price per license in wei (0 = not listed)
    mapping(uint256 => uint256) public licensePrice;
    /// tokenId => fingerprint, recorded at mint so uri() can resolve either
    /// license type back to its registry entry.
    mapping(uint256 => bytes32) public tokenFingerprint;

    event LicenseMinted(
        bytes32 indexed fingerprint,
        address indexed to,
        uint256 amount,
        bool exclusive
    );
    event LicensePriceSet(bytes32 indexed fingerprint, bool exclusive, uint256 priceWei);
    event LicenseBought(
        bytes32 indexed fingerprint,
        bool exclusive,
        address indexed buyer,
        uint256 amount,
        uint256 paidWei
    );

    constructor(address registry_) ERC1155("") Ownable(msg.sender) {
        require(registry_ != address(0), "BeatNFT: zero registry");
        registry = IBeatRegistry(registry_);
    }

    /// @notice Token ID for a beat's lease editions.
    function leaseTokenId(bytes32 fingerprint) public pure returns (uint256) {
        return uint256(fingerprint);
    }

    /// @notice Token ID for a beat's exclusive 1-of-1. Deterministic and
    ///         disjoint from the lease ID by construction.
    function exclusiveTokenId(bytes32 fingerprint) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked("BeatNFT:exclusive", fingerprint)));
    }

    /// @notice Resolve a license type to its token ID.
    function licenseTokenId(bytes32 fingerprint, bool exclusive)
        public
        pure
        returns (uint256)
    {
        return exclusive ? exclusiveTokenId(fingerprint) : leaseTokenId(fingerprint);
    }

    /// @notice Metadata comes straight from the beat's registry entry, so the
    ///         token always describes the exact registered audio.
    function uri(uint256 tokenId) public view override returns (string memory) {
        bytes32 fingerprint = tokenFingerprint[tokenId];
        require(fingerprint != bytes32(0), "BeatNFT: unknown token");
        (, , string memory metadataURI) = registry.getBeat(fingerprint);
        return metadataURI;
    }

    modifier onlyBeatOwner(bytes32 fingerprint) {
        require(registry.isRegistered(fingerprint), "BeatNFT: beat not registered");
        (address owner, , ) = registry.getBeat(fingerprint);
        require(msg.sender == owner, "BeatNFT: not the beat owner");
        _;
    }

    /// @notice Mint `amount` lease licenses of a beat to `to`.
    function mintLease(bytes32 fingerprint, address to, uint256 amount)
        external
        onlyBeatOwner(fingerprint)
    {
        require(to != address(0), "BeatNFT: zero address");
        require(amount > 0, "BeatNFT: zero amount");
        uint256 tokenId = leaseTokenId(fingerprint);
        _mint(to, tokenId, amount, "");
        tokenFingerprint[tokenId] = fingerprint;
        leaseMinted[fingerprint] += amount;
        (address owner, , ) = registry.getBeat(fingerprint);
        _setTokenRoyalty(tokenId, owner, royaltyBps);
        emit LicenseMinted(fingerprint, to, amount, false);
    }

    /// @notice Mint the single exclusive 1-of-1 license. One per beat, ever.
    function mintExclusive(bytes32 fingerprint, address to)
        external
        onlyBeatOwner(fingerprint)
    {
        require(to != address(0), "BeatNFT: zero address");
        require(!exclusiveMinted[fingerprint], "BeatNFT: exclusive already minted");
        uint256 tokenId = exclusiveTokenId(fingerprint);
        exclusiveMinted[fingerprint] = true;
        _mint(to, tokenId, 1, "");
        tokenFingerprint[tokenId] = fingerprint;
        (address owner, , ) = registry.getBeat(fingerprint);
        _setTokenRoyalty(tokenId, owner, royaltyBps);
        emit LicenseMinted(fingerprint, to, 1, true);
    }

    /// @notice Producer lists licenses at `priceWei` each (0 = delist).
    function setPrice(bytes32 fingerprint, bool exclusive, uint256 priceWei)
        external
        onlyBeatOwner(fingerprint)
    {
        uint256 tokenId = licenseTokenId(fingerprint, exclusive);
        licensePrice[tokenId] = priceWei;
        emit LicensePriceSet(fingerprint, exclusive, priceWei);
    }

    /// @notice Buy `amount` licenses at the listed price. ETH goes to the producer.
    function buy(bytes32 fingerprint, bool exclusive, uint256 amount) external payable {
        uint256 tokenId = licenseTokenId(fingerprint, exclusive);
        uint256 price = licensePrice[tokenId];
        require(price > 0, "BeatNFT: not for sale");
        require(amount > 0, "BeatNFT: zero amount");
        require(msg.value == price * amount, "BeatNFT: wrong payment");
        require(balanceOf(address(this), tokenId) >= amount, "BeatNFT: sold out");
        (address owner, , ) = registry.getBeat(fingerprint);
        _safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
        (bool ok, ) = owner.call{value: msg.value}("");
        require(ok, "BeatNFT: payout failed");
        emit LicenseBought(fingerprint, exclusive, msg.sender, amount, msg.value);
    }

    /// @notice Producer stocks the contract with licenses to sell via `buy`.
    function stockForSale(bytes32 fingerprint, bool exclusive, uint256 amount)
        external
        onlyBeatOwner(fingerprint)
    {
        uint256 tokenId = licenseTokenId(fingerprint, exclusive);
        _safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
    }

    /// @notice Update the default royalty (basis points, capped at 25%).
    ///         Applies to beats minted after the change.
    function setRoyaltyBps(uint96 bps) external onlyOwner {
        require(bps <= MAX_ROYALTY_BPS, "BeatNFT: royalty too high");
        royaltyBps = bps;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC1155Holder, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
