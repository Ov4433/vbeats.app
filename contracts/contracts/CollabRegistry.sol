// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IBeatRegistry {
    function getBeat(bytes32 fingerprint)
        external
        view
        returns (address owner, uint256 timestamp, string memory metadataURI);
}

/// @title CollabRegistry — the on-chain home of producer/rapper collaborations.
/// @notice A rapper records a vocal take over a producer's registered beat and
/// proposes a collab: the take stays private until the producer approves it —
/// unless the producer flipped the beat to "open collabs", in which case the
/// collab goes live immediately. The default revenue split is 50/50
/// (5000 bps to the producer, the rest to the rapper); either side can request
/// a renegotiation and the other must accept it before it takes effect.
/// BeatEscrow reads the approved terms at settlement and splits payouts
/// automatically, so nobody has to trust anyone's math.
contract CollabRegistry {
    IBeatRegistry public registry;

    uint16 public constant DEFAULT_PRODUCER_BPS = 5000; // 50/50
    uint16 public constant MIN_SHARE_BPS = 1000; // nobody gets squeezed below 10%
    uint16 public constant MAX_SHARE_BPS = 9000; // or above 90%

    struct Collab {
        bytes32 beatFingerprint;
        address producer;
        address rapper;
        uint16 producerShareBps;
        bool approved;
        uint16 pendingShareBps; // 0 = no renegotiation open
        address pendingProposer;
    }

    /// @notice beat fingerprint => open for collabs (no approval needed)
    mapping(bytes32 => bool) public openForCollabs;
    /// @notice take fingerprint => collab terms
    mapping(bytes32 => Collab) private _collabs;

    event OpenToggled(bytes32 indexed beatFingerprint, bool open);
    event CollabProposed(
        bytes32 indexed takeFingerprint,
        bytes32 indexed beatFingerprint,
        address indexed rapper,
        uint16 producerShareBps,
        bool autoApproved
    );
    event CollabApproved(bytes32 indexed takeFingerprint, address indexed producer);
    event SplitRequested(
        bytes32 indexed takeFingerprint,
        address indexed proposer,
        uint16 newProducerShareBps
    );
    event SplitUpdated(bytes32 indexed takeFingerprint, uint16 producerShareBps);

    constructor(address registry_) {
        require(registry_ != address(0), "CollabRegistry: zero registry");
        registry = IBeatRegistry(registry_);
    }

    /// @notice The beat's owner flips the beat between approval-required
    /// (default) and open collabs (any rapper's take goes live instantly).
    function setOpenCollabs(bytes32 beatFingerprint, bool open) external {
        (address owner, , ) = registry.getBeat(beatFingerprint);
        require(owner != address(0), "CollabRegistry: beat not registered");
        require(msg.sender == owner, "CollabRegistry: not the producer");
        openForCollabs[beatFingerprint] = open;
        emit OpenToggled(beatFingerprint, open);
    }

    /// @notice A rapper proposes a collab for their vocal take over a beat.
    /// @param producerShareBps basis points of sale revenue to the producer
    ///        (0 = accept the 50/50 default; otherwise 1000..9000).
    function proposeCollab(
        bytes32 beatFingerprint,
        bytes32 takeFingerprint,
        uint16 producerShareBps
    ) external {
        (address owner, , ) = registry.getBeat(beatFingerprint);
        require(owner != address(0), "CollabRegistry: beat not registered");
        require(takeFingerprint != bytes32(0), "CollabRegistry: zero take");
        require(takeFingerprint != beatFingerprint, "CollabRegistry: take is the beat");
        require(msg.sender != owner, "CollabRegistry: producer cannot collab with self");
        require(_collabs[takeFingerprint].rapper == address(0), "CollabRegistry: take already proposed");

        uint16 share = producerShareBps == 0 ? DEFAULT_PRODUCER_BPS : producerShareBps;
        require(share >= MIN_SHARE_BPS && share <= MAX_SHARE_BPS, "CollabRegistry: share out of range");

        bool autoApproved = openForCollabs[beatFingerprint];
        _collabs[takeFingerprint] = Collab({
            beatFingerprint: beatFingerprint,
            producer: owner,
            rapper: msg.sender,
            producerShareBps: share,
            approved: autoApproved,
            pendingShareBps: 0,
            pendingProposer: address(0)
        });
        emit CollabProposed(takeFingerprint, beatFingerprint, msg.sender, share, autoApproved);
    }

    /// @notice The producer approves a proposed take: the collab goes public.
    function approveCollab(bytes32 takeFingerprint) external {
        Collab storage c = _collabs[takeFingerprint];
        require(c.rapper != address(0), "CollabRegistry: unknown take");
        require(!c.approved, "CollabRegistry: already approved");
        require(msg.sender == c.producer, "CollabRegistry: not the producer");
        c.approved = true;
        emit CollabApproved(takeFingerprint, msg.sender);
    }

    /// @notice Either side requests a new split; it takes effect only when
    /// the other side accepts it.
    function requestSplit(bytes32 takeFingerprint, uint16 newProducerShareBps) external {
        Collab storage c = _collabs[takeFingerprint];
        require(c.rapper != address(0), "CollabRegistry: unknown take");
        require(
            msg.sender == c.producer || msg.sender == c.rapper,
            "CollabRegistry: not a party"
        );
        require(
            newProducerShareBps >= MIN_SHARE_BPS && newProducerShareBps <= MAX_SHARE_BPS,
            "CollabRegistry: share out of range"
        );
        require(newProducerShareBps != c.producerShareBps, "CollabRegistry: unchanged");
        c.pendingShareBps = newProducerShareBps;
        c.pendingProposer = msg.sender;
        emit SplitRequested(takeFingerprint, msg.sender, newProducerShareBps);
    }

    /// @notice The counterparty accepts the pending split: it becomes the
    /// live terms for all future settlements.
    function acceptSplit(bytes32 takeFingerprint) external {
        Collab storage c = _collabs[takeFingerprint];
        require(c.pendingProposer != address(0), "CollabRegistry: no pending split");
        require(msg.sender != c.pendingProposer, "CollabRegistry: proposer cannot accept");
        require(
            msg.sender == c.producer || msg.sender == c.rapper,
            "CollabRegistry: not a party"
        );
        c.producerShareBps = c.pendingShareBps;
        c.pendingShareBps = 0;
        c.pendingProposer = address(0);
        emit SplitUpdated(takeFingerprint, c.producerShareBps);
    }

    /// @notice Read a take's collab terms. producer == address(0) when unknown.
    function getCollab(bytes32 takeFingerprint)
        external
        view
        returns (
            bytes32 beatFingerprint,
            address producer,
            address rapper,
            uint16 producerShareBps,
            bool approved
        )
    {
        Collab memory c = _collabs[takeFingerprint];
        return (c.beatFingerprint, c.producer, c.rapper, c.producerShareBps, c.approved);
    }
}
