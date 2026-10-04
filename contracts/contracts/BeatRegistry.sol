// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BeatRegistry
/// @notice On-chain registry of beat ownership keyed by the beat's SHA-256
///         audio fingerprint. The backend computes fingerprints server-side
///         (see POST /v1/beats/upload) and checks registration read-only via
///         `isRegistered` / `getBeat` — no private key needed for reads.
contract BeatRegistry {
    struct Beat {
        address owner;
        uint256 timestamp;
        string metadataURI;
    }

    mapping(bytes32 => Beat) private _beats;

    event BeatRegistered(
        bytes32 indexed fingerprint,
        address indexed owner,
        string metadataURI
    );
    event BeatTransferred(
        bytes32 indexed fingerprint,
        address indexed from,
        address indexed to
    );

    /// @notice Register a beat fingerprint to its producer.
    /// @dev Takes the producer explicitly so a relayer (backend wallet) can
    ///      register on the producer's behalf without becoming the owner.
    /// @param fingerprint SHA-256 of the audio file, as bytes32.
    /// @param metadataURI Off-chain metadata (e.g. https://api.vbeats.app/v1/beats/<id>).
    /// @param producer Address recorded as the beat's owner.
    function registerBeat(
        bytes32 fingerprint,
        string calldata metadataURI,
        address producer
    ) external {
        require(fingerprint != bytes32(0), "BeatRegistry: empty fingerprint");
        require(producer != address(0), "BeatRegistry: zero producer");
        require(_beats[fingerprint].owner == address(0), "BeatRegistry: already registered");
        _beats[fingerprint] = Beat({
            owner: producer,
            timestamp: block.timestamp,
            metadataURI: metadataURI
        });
        emit BeatRegistered(fingerprint, producer, metadataURI);
    }

    /// @notice Transfer a registered beat to a new owner. Caller must be the owner.
    function transferBeat(bytes32 fingerprint, address to) external {
        require(_beats[fingerprint].owner == msg.sender, "BeatRegistry: not the owner");
        require(to != address(0), "BeatRegistry: zero address");
        address from = msg.sender;
        _beats[fingerprint].owner = to;
        emit BeatTransferred(fingerprint, from, to);
    }

    /// @notice Read a beat's owner, registration timestamp and metadata URI.
    /// @return owner The current owner (address(0) when unregistered).
    /// @return timestamp Unix time of registration (0 when unregistered).
    /// @return metadataURI The stored metadata URI ("" when unregistered).
    function getBeat(bytes32 fingerprint)
        external
        view
        returns (address owner, uint256 timestamp, string memory metadataURI)
    {
        Beat memory beat = _beats[fingerprint];
        return (beat.owner, beat.timestamp, beat.metadataURI);
    }

    /// @notice True when the fingerprint has a registered owner.
    function isRegistered(bytes32 fingerprint) external view returns (bool) {
        return _beats[fingerprint].owner != address(0);
    }
}
