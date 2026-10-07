// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VouchSBT — the verification coin for Verified Beats Studio.
/// @notice Soulbound (non-transferable): the studio issues one per verified
/// buyer. It can never be sold or sent to another wallet, so a scammer cannot
/// buy someone else's good reputation. The escrow lane requires it, and the
/// studio can revoke it if scammer activity is ever attached to the account.
contract VouchSBT is ERC721, Ownable {
    uint256 private _nextId = 1;

    /// holder => tokenId (0 = not verified)
    mapping(address => uint256) public vouchOf;

    event Vouched(address indexed account, uint256 tokenId);
    event Unvouched(address indexed account, uint256 tokenId);

    constructor() ERC721("VBeats Verified", "VOUCH") Ownable(msg.sender) {}

    /// @notice Issue a verification coin to a vetted buyer. One per account.
    function issue(address account) external onlyOwner returns (uint256) {
        require(account != address(0), "VouchSBT: zero address");
        require(vouchOf[account] == 0, "VouchSBT: already vouched");
        uint256 tokenId = _nextId++;
        vouchOf[account] = tokenId;
        _safeMint(account, tokenId);
        emit Vouched(account, tokenId);
        return tokenId;
    }

    /// @notice Revoke a buyer's verification (e.g. scammer activity found).
    function revoke(address account) external onlyOwner {
        uint256 tokenId = vouchOf[account];
        require(tokenId != 0, "VouchSBT: not vouched");
        delete vouchOf[account];
        _burn(tokenId);
        emit Unvouched(account, tokenId);
    }

    /// @notice The "reader": true when this account currently holds a vouch.
    function isVerified(address account) external view returns (bool) {
        return vouchOf[account] != 0;
    }

    /// @notice Soulbound: allow mint (from == 0) and burn (to == 0) only.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "VouchSBT: soulbound");
        return super._update(to, tokenId, auth);
    }
}
