// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

/// @title BeatShard — the swap coin.
/// @notice A beat's BeatNFT licenses lock in this vault and "break" into
/// fungible SHARD coins for cheap peer-to-peer transfer; burning SHARDs
/// rebuilds the NFT. One vault per (nft, tokenId) so shards of different
/// beats can never mix. 1 license == 1 SHARD, always.
contract BeatShard is ERC20, ERC1155Holder {
    IERC1155 public immutable nft;
    uint256 public immutable tokenId;
    bytes32 public immutable fingerprint; // lot# this vault wraps

    event Wrapped(address indexed account, uint256 licenses, uint256 shards);
    event Unwrapped(address indexed account, uint256 shards, uint256 licenses);

    constructor(
        address nft_,
        uint256 tokenId_,
        bytes32 fingerprint_,
        string memory name_,
        string memory symbol_
    ) ERC20(name_, symbol_) {
        require(nft_ != address(0), "BeatShard: zero nft");
        nft = IERC1155(nft_);
        tokenId = tokenId_;
        fingerprint = fingerprint_;
    }

    /// @notice Lock `amount` licenses, mint the same number of SHARDs.
    function wrap(uint256 amount) external {
        require(amount > 0, "BeatShard: zero amount");
        nft.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
        _mint(msg.sender, amount);
        emit Wrapped(msg.sender, amount, amount);
    }

    /// @notice Burn SHARDs, get the licenses back.
    function unwrap(uint256 shardAmount) external {
        require(shardAmount > 0, "BeatShard: zero amount");
        _burn(msg.sender, shardAmount);
        nft.safeTransferFrom(address(this), msg.sender, tokenId, shardAmount, "");
        emit Unwrapped(msg.sender, shardAmount, shardAmount);
    }
}

/// @title ShardFactory — deploys one BeatShard vault per beat license type.
contract ShardFactory {
    event VaultDeployed(
        address indexed vault,
        address indexed nft,
        uint256 tokenId,
        bytes32 indexed fingerprint
    );

    function create(
        address nft,
        uint256 tokenId,
        bytes32 fingerprint,
        string calldata name,
        string calldata symbol
    ) external returns (address) {
        BeatShard vault = new BeatShard(nft, tokenId, fingerprint, name, symbol);
        emit VaultDeployed(address(vault), nft, tokenId, fingerprint);
        return address(vault);
    }
}
