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
contract VoltPass is ERC721, Ownable {
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant MINT_PRICE = 0.005 ether;
    uint256 private _nextId = 1;

    /// @notice How many of the first mints are free (0 = paid from the start,
    /// the spec default). Owner can raise it for a hype wave — e.g. 100.
    uint256 public freeWave;

    /// @notice Relayer allowed to consume a pass's gasless first export.
    address public relayer;

    /// holder => tokenId (0 = no pass)
    mapping(address => uint256) public passOf;
    /// tokenId => whether its one free export/mint was consumed
    mapping(uint256 => bool) public freeMintUsed;

    event PassMinted(address indexed account, uint256 tokenId, bool free);
    event FreeWaveSet(uint256 freeWave);
    event RelayerSet(address indexed relayer);
    event FreeMintConsumed(uint256 indexed tokenId, address indexed relayer);
    event Withdrawn(address indexed to, uint256 amount);

    constructor() ERC721("Volt Founding Producer Pass", "VOLTPASS") Ownable(msg.sender) {}

    /// @notice Mint the caller's founding pass. Paid at 0.005 ETH unless this
    /// mint falls inside the free wave.
    function mint() external payable returns (uint256) {
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
