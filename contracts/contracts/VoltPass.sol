// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VoltPass — the Founding Producer Pass for Verified Beats Studio.
/// @notice Soulbound (non-transferable) Phase-1 access key: holding it is what
/// lets a producer upload before the public launch. One pass per account, so a
/// founding producer is a real person, not a wallet that bought ten keys.
/// Each pass also carries ONE gasless first export/mint — the studio relayer
/// performs the mint on the producer's behalf and marks the entitlement used.
/// 1,000 passes at 0.005 ETH on Base. Spec: volt-pass-drop-spec.md.
///
/// v2 (2026-10-20): the buy-in moved to the VBEATS token — hold 10 VBEATS,
/// claim the pass free on the site. The backend verifies the holding on
/// Robinhood Chain, then the relayer mints the pass here via mintFor().
/// The old public paid mint still exists but ships CLOSED
/// (publicMintOpen = false) so the token stays the only door; the owner
/// can open it later for a direct sale. Zero v1 passes were ever minted,
/// so v2 replaces v1 (0x72C2…8228) with nothing lost.
contract VoltPass is ERC721, Ownable {
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant MINT_PRICE = 0.005 ether;
    uint256 private _nextId = 1;

    /// @notice How many of the first mints are free (0 = paid from the start,
    /// the spec default). Owner can raise it for a hype wave — e.g. 100.
    /// Applies to the public mint() only; claim mints via mintFor are free.
    uint256 public freeWave;

    /// @notice Whether the public paid mint() is open. Ships closed: in the
    /// token-gated model the only way in is mintFor after a holding check.
    bool public publicMintOpen;

    /// @notice Relayer allowed to mint claim passes and consume a pass's
    /// gasless first export.
    address public relayer;

    /// holder => tokenId (0 = no pass)
    mapping(address => uint256) public passOf;
    /// tokenId => whether its one free export/mint was consumed
    mapping(uint256 => bool) public freeMintUsed;

    event PassMinted(address indexed account, uint256 tokenId, bool free);
    event FreeWaveSet(uint256 freeWave);
    event PublicMintSet(bool open);
    event RelayerSet(address indexed relayer);
    event FreeMintConsumed(uint256 indexed tokenId, address indexed relayer);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address initialRelayer) ERC721("Volt Founding Producer Pass", "VOLTPASS") Ownable(msg.sender) {
        if (initialRelayer != address(0)) {
            relayer = initialRelayer;
            emit RelayerSet(initialRelayer);
        }
    }

    /// @notice Mint the caller's founding pass. Paid at 0.005 ETH unless this
    /// mint falls inside the free wave. Only runs while the owner has the
    /// public mint open — it ships closed (see publicMintOpen).
    function mint() external payable returns (uint256) {
        require(publicMintOpen, "VoltPass: public mint closed");
        require(_nextId <= MAX_SUPPLY, "VoltPass: sold out");
        require(passOf[msg.sender] == 0, "VoltPass: one pass per account");
        bool free = _nextId <= freeWave;
        if (free) {
            require(msg.value == 0, "VoltPass: wave mints are free");
        } else {
            require(msg.value >= MINT_PRICE, "VoltPass: wrong price");
        }
        uint256 tokenId = _nextId++;
        passOf[msg.sender] = tokenId;
        _safeMint(msg.sender, tokenId);
        emit PassMinted(msg.sender, tokenId, free);
        return tokenId;
    }

    /// @notice Mint a pass to `to` — the token-gated claim path. Only the
    /// owner or the relayer may call it; the backend calls it (via the
    /// relayer) after verifying the claimant holds the required VBEATS
    /// balance. No payment: the token holding is the buy-in. Gasless for
    /// the claimant — the relayer pays the Base gas.
    function mintFor(address to) external returns (uint256) {
        require(
            msg.sender == relayer || msg.sender == owner(),
            "VoltPass: not authorized"
        );
        require(to != address(0), "VoltPass: zero address");
        require(_nextId <= MAX_SUPPLY, "VoltPass: sold out");
        require(passOf[to] == 0, "VoltPass: one pass per account");
        uint256 tokenId = _nextId++;
        passOf[to] = tokenId;
        _safeMint(to, tokenId);
        emit PassMinted(to, tokenId, true);
        return tokenId;
    }

    /// @notice Open or close the public paid mint.
    function setPublicMintOpen(bool open) external onlyOwner {
        publicMintOpen = open;
        emit PublicMintSet(open);
    }

    /// @notice Set the free-mint wave size (the "first ~100 free" decision).
    function setFreeWave(uint256 n) external onlyOwner {
        freeWave = n;
        emit FreeWaveSet(n);
    }

    /// @notice Set the relayer that performs gasless first exports.
    function setRelayer(address r) external onlyOwner {
        relayer = r;
        emit RelayerSet(r);
    }

    /// @notice Mark a pass's one free export/mint as consumed. Called by the
    /// studio relayer after it performs the gasless first mint.
    function consumeFreeMint(uint256 tokenId) external {
        require(
            msg.sender == relayer || msg.sender == owner(),
            "VoltPass: not relayer"
        );
        require(_ownerOf(tokenId) != address(0), "VoltPass: no such pass");
        require(!freeMintUsed[tokenId], "VoltPass: free mint already used");
        freeMintUsed[tokenId] = true;
        emit FreeMintConsumed(tokenId, msg.sender);
    }

    /// @notice The upload-gate reader: true when this account holds a pass.
    function hasPass(address account) external view returns (bool) {
        return passOf[account] != 0;
    }

    /// @notice How many passes have been minted so far.
    function totalMinted() external view returns (uint256) {
        return _nextId - 1;
    }

    /// @notice Sweep mint proceeds to the studio treasury.
    function withdraw() external onlyOwner {
        uint256 amount = address(this).balance;
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "VoltPass: withdraw failed");
        emit Withdrawn(owner(), amount);
    }

    /// @notice Soulbound: allow mint (from == 0) and burn (to == 0) only.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "VoltPass: soulbound");
        return super._update(to, tokenId, auth);
    }
}
