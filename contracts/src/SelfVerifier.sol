// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title SelfVerifier
 * @notice Integrates Self Protocol ZK proof-of-human verification for Nastar agents.
 *         Verified agents get a "Self Verified" badge, adding Sybil resistance
 *         to the marketplace. Uses Self's IdentityVerificationHub V2 on Celo.
 * @author JABAR x NASTAR
 *
 * Self Protocol: https://self.xyz
 * Celo Mainnet Hub: 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF
 * Celo Sepolia Hub: 0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74
 */

interface IIdentityVerificationHubV2 {
    struct VerificationResult {
        bool isValid;
        bytes32 attestationId;
        bytes32 userIdentifier;
        uint256 nullifier;
    }

    function verify(
        bytes calldata proof,
        bytes calldata publicInputs
    ) external view returns (VerificationResult memory);
}

contract SelfVerifier {
    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    /// @notice Self Protocol IdentityVerificationHub V2 address
    address public immutable selfHub;

    /// @notice Mapping: wallet address => verified
    mapping(address => bool) public isVerified;

    /// @notice Mapping: nullifier => used (prevents double-verification)
    mapping(uint256 => bool) public nullifierUsed;

    /// @notice Total verified addresses
    uint256 public totalVerified;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event HumanVerified(address indexed user, uint256 nullifier, uint256 timestamp);

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error AlreadyVerified();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error ZeroAddress();

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    /// @param _selfHub Address of Self Protocol's IdentityVerificationHub V2
    constructor(address _selfHub) {
        if (_selfHub == address(0)) revert ZeroAddress();
        selfHub = _selfHub;
    }

    // ──────────────────────────────────────────────
    // Verification
    // ──────────────────────────────────────────────

    /**
     * @notice Verify a user is human via Self Protocol ZK proof.
     *         Stores verification status on-chain. Prevents double-use
     *         of the same passport nullifier.
     * @param proof The ZK proof bytes from Self app
     * @param publicInputs The public inputs for verification
     */
    function verifySelf(bytes calldata proof, bytes calldata publicInputs) external {
        if (isVerified[msg.sender]) revert AlreadyVerified();

        IIdentityVerificationHubV2.VerificationResult memory result =
            IIdentityVerificationHubV2(selfHub).verify(proof, publicInputs);

        if (!result.isValid) revert InvalidProof();
        if (nullifierUsed[result.nullifier]) revert NullifierAlreadyUsed();

        isVerified[msg.sender] = true;
        nullifierUsed[result.nullifier] = true;
        totalVerified++;

        emit HumanVerified(msg.sender, result.nullifier, block.timestamp);
    }

    /**
     * @notice Check if an address is Self-verified (view function for other contracts)
     */
    function checkVerified(address user) external view returns (bool) {
        return isVerified[user];
    }
}
