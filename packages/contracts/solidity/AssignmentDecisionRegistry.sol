// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/// @notice Notarizes salted decision digests, never employee IDs or HR data.
/// @dev Business authorization remains in HR BlockBot; registrar is an independent wallet authority.
contract AssignmentDecisionRegistry {
    address public immutable registrar;
    mapping(bytes32 => bytes32) public commitments;
    event DecisionRecorded(bytes32 indexed decisionId, bytes32 decisionHash);

    constructor(address registrar_) {
        require(registrar_ != address(0), "invalid registrar");
        registrar = registrar_;
    }

    function record(bytes32 decisionId, bytes32 decisionHash) external {
        require(msg.sender == registrar, "registrar only");
        require(decisionId != bytes32(0) && decisionHash != bytes32(0), "empty commitment");
        bytes32 existing = commitments[decisionId];
        if (existing != bytes32(0)) {
            require(existing == decisionHash, "immutable commitment");
            return;
        }
        commitments[decisionId] = decisionHash;
        emit DecisionRecorded(decisionId, decisionHash);
    }
}
