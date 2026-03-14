// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IERC721} from "forge-std/interfaces/IERC721.sol";

/*
 *
 *                   .·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·.
 *             / .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  /
 *            | \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ |
 *             \/`·..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`\/
 *             /\                                                                      /\
 *            / /\                                                                    / /\
 *           / /\ \    ███╗   ██╗ █████╗ ███████╗████████╗ █████╗ ██████╗            / /\ \
 *          / /  \ \   ████╗  ██║██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗         / /  \ \
 *         / /    \ \  ██╔██╗ ██║███████║███████╗   ██║   ███████║██████╔╝        / /    \ \
 *        / /      \ \ ██║╚██╗██║██╔══██║╚════██║   ██║   ██╔══██║██╔══██╗      / /      \ \
 *       / /        \ \██║ ╚████║██║  ██║███████║   ██║   ██║  ██║██║  ██║     / /        \ \
 *      / /          \\╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝  / /          \ \
 *       \ \          / \                                                      / /          / /
 *        \ \        / /  Agent Commerce Protocol on Celo                     / /          / /
 *         \ \      / /   Your agent works globally. Gets paid locally.      / /         / /
 *          \ \    / /                                                      / /        / /
 *           \ \  / /     ERC-8004 Identity · Multi-Stablecoin · Escrow   / /       / /
 *            \ \/ /      github.com/7abar/nastar · @7abar_eth           / /      / /
 *             \  /                                                     / /     / /
 *              \/                                                     / /    / /
 *              /\`·..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`/ /  / /
 *             | /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ // / / /
 *              \ ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/
 *                   `·:·``·:·``·:·``·:·``·:·``·:·``·:·``·:·``·:·``·:·`
 *
 */

/**
 * @title NastarEscrow
 * @notice Escrow contract for agent-to-agent service deals on Celo.
 *         Integrates with ERC-8004 Identity Registry and ServiceRegistry.
 *         Supports any Celo stablecoin (USDm, USDC, USDT, KESm, NGNm, etc.)
 * @author JABAR x NASTAR
 *
 * Security model:
 *   - Funds are held by this contract until deal resolves
 *   - Seller address locked at creation (ownerOf(sellerAgentId) at deal time)
 *   - Disputes require DISPUTE_TIMEOUT to elapse before buyer can claim refund
 *   - State updated before external calls (CEI pattern)
 */
contract NastarEscrow {
    // ──────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────

    enum DealStatus {
        Created,    // Buyer created deal, funds escrowed
        Accepted,   // Seller accepted the deal
        Delivered,  // Seller marked as delivered
        Completed,  // Buyer confirmed, funds released to seller
        Disputed,   // Buyer disputes delivery
        Refunded,   // Funds returned to buyer
        Expired     // Deal expired without acceptance or delivery
    }

    struct Deal {
        uint256 dealId;
        uint256 serviceId;
        uint256 buyerAgentId;    // ERC-8004 NFT ID
        uint256 sellerAgentId;   // ERC-8004 NFT ID
        address buyer;
        address seller;          // ownerOf(sellerAgentId) at deal creation
        address paymentToken;    // Stablecoin used
        uint256 amount;
        string taskDescription;
        string deliveryProof;    // IPFS hash or URL of deliverable
        DealStatus status;
        uint256 createdAt;
        uint256 deadline;        // Unix timestamp
        uint256 completedAt;
        uint256 disputedAt;      // Timestamp when buyer opened dispute
    }

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    IERC721 public immutable identityRegistry;
    address public immutable serviceRegistry;

    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;

    // agentId => dealId[]
    mapping(uint256 => uint256[]) public agentDealsAsBuyer;
    mapping(uint256 => uint256[]) public agentDealsAsSeller;

    // ──────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────

    /// @notice Seller has 3 days to respond after a dispute before buyer can claim refund.
    uint256 public constant DISPUTE_TIMEOUT = 3 days;

    /// @notice Maximum allowed deal deadline from creation.
    uint256 public constant MAX_DEADLINE = 30 days;

    /// @notice Seller can force-claim payment if buyer is unresponsive this long after delivery.
    uint256 public constant DELIVERY_TIMEOUT = 7 days;

    /// @notice If buyer disputes but never claims refund, seller can reclaim after this timeout.
    /// Prevents permanent fund lock from abandoned disputes.
    uint256 public constant ABANDONED_DISPUTE_TIMEOUT = 30 days;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event DealCreated(
        uint256 indexed dealId,
        uint256 indexed buyerAgentId,
        uint256 indexed sellerAgentId,
        uint256 serviceId,
        address paymentToken,
        uint256 amount,
        uint256 deadline
    );

    event DealAccepted(uint256 indexed dealId, uint256 indexed sellerAgentId);
    event DealDelivered(uint256 indexed dealId, string deliveryProof);
    event DealCompleted(uint256 indexed dealId, uint256 amount);
    event DealDisputed(uint256 indexed dealId, uint256 indexed buyerAgentId, uint256 disputedAt);
    event DealRefunded(uint256 indexed dealId, uint256 amount);
    event DealExpired(uint256 indexed dealId);

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error NotAgentOwner();
    error NotBuyer();
    error NotSeller();
    error InvalidStatus(DealStatus expected, DealStatus actual);
    error NotRefundable();
    error DeadlineTooLong();
    error DealExpiredError();
    error TransferFailed();
    error ZeroAmount();
    error ZeroAddress();
    error DisputeTimeoutNotReached(uint256 canRefundAt, uint256 now_);
    error DeliveryTimeoutNotReached(uint256 canClaimAt, uint256 now_);
    error AbandonedDisputeTimeoutNotReached(uint256 canClaimAt, uint256 now_);
    error SelfDeal();

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _identityRegistry, address _serviceRegistry) {
        if (_identityRegistry == address(0) || _serviceRegistry == address(0)) revert ZeroAddress();
        identityRegistry = IERC721(_identityRegistry);
        serviceRegistry = _serviceRegistry;
    }

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Create a deal and escrow payment.
     *         Buyer must own the buyerAgentId NFT and have approved this contract.
     * @param serviceId       Service listing ID in ServiceRegistry.
     * @param buyerAgentId    ERC-8004 NFT ID of the buyer agent.
     * @param sellerAgentId   ERC-8004 NFT ID of the seller agent.
     * @param paymentToken    ERC-20 token used for payment.
     * @param amount          Amount in token's smallest unit (must be > 0).
     * @param taskDescription Plain-text description of the task.
     * @param deadline        Unix timestamp for completion (max 30 days from now).
     */
    function createDeal(
        uint256 serviceId,
        uint256 buyerAgentId,
        uint256 sellerAgentId,
        address paymentToken,
        uint256 amount,
        string calldata taskDescription,
        uint256 deadline
    ) external returns (uint256 dealId) {
        // Validations
        if (identityRegistry.ownerOf(buyerAgentId) != msg.sender) revert NotAgentOwner();
        if (buyerAgentId == sellerAgentId) revert SelfDeal();
        if (amount == 0) revert ZeroAmount();
        if (paymentToken == address(0)) revert ZeroAddress();
        if (deadline > block.timestamp + MAX_DEADLINE) revert DeadlineTooLong();
        if (deadline <= block.timestamp) revert DealExpiredError();

        // Capture seller address at deal creation time
        address seller = identityRegistry.ownerOf(sellerAgentId);

        // CEI: assign state before external call
        dealId = nextDealId++;

        deals[dealId] = Deal({
            dealId: dealId,
            serviceId: serviceId,
            buyerAgentId: buyerAgentId,
            sellerAgentId: sellerAgentId,
            buyer: msg.sender,
            seller: seller,
            paymentToken: paymentToken,
            amount: amount,
            taskDescription: taskDescription,
            deliveryProof: "",
            status: DealStatus.Created,
            createdAt: block.timestamp,
            deadline: deadline,
            completedAt: 0,
            disputedAt: 0
        });

        agentDealsAsBuyer[buyerAgentId].push(dealId);
        agentDealsAsSeller[sellerAgentId].push(dealId);

        emit DealCreated(dealId, buyerAgentId, sellerAgentId, serviceId, paymentToken, amount, deadline);

        // Transfer payment to escrow (after state update)
        bool success = IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Seller accepts a deal. Must be called by the address that owned
     *         the seller NFT at deal creation time.
     */
    function acceptDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Created);
        if (deal.seller != msg.sender) revert NotSeller();
        if (block.timestamp > deal.deadline) revert DealExpiredError();

        deal.status = DealStatus.Accepted;
        emit DealAccepted(dealId, deal.sellerAgentId);
    }

    /**
     * @notice Seller marks deal as delivered with proof of work.
     *         Must be called before the deadline — late delivery is not allowed.
     * @param proof IPFS hash, URL, or any string identifying the deliverable.
     */
    function deliverDeal(uint256 dealId, string calldata proof) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Accepted);
        if (deal.seller != msg.sender) revert NotSeller();
        if (block.timestamp > deal.deadline) revert DealExpiredError();

        deal.deliveryProof = proof;
        deal.status = DealStatus.Delivered;
        emit DealDelivered(dealId, proof);
    }

    /**
     * @notice Buyer confirms delivery, releasing escrowed funds to seller.
     */
    function confirmDelivery(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Delivered);
        if (deal.buyer != msg.sender) revert NotBuyer();

        // CEI: update state before transfer
        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;
        address seller = deal.seller;
        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        emit DealCompleted(dealId, amount);

        bool success = IERC20(token).transfer(seller, amount);
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Buyer disputes a delivered deal, starting the DISPUTE_TIMEOUT clock.
     *         Seller has DISPUTE_TIMEOUT seconds to respond (off-chain) before
     *         the buyer can claim a refund.
     */
    function disputeDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Delivered);
        if (deal.buyer != msg.sender) revert NotBuyer();

        deal.status = DealStatus.Disputed;
        deal.disputedAt = block.timestamp;
        emit DealDisputed(dealId, deal.buyerAgentId, block.timestamp);
    }

    /**
     * @notice Claim a refund. Three valid scenarios:
     *   1. Deal was never accepted before the deadline (seller no-show).
     *   2. Deal was accepted but not delivered before the deadline.
     *   3. Deal was disputed AND DISPUTE_TIMEOUT has elapsed (no arbitration MVP).
     */
    function claimRefund(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        if (deal.buyer != msg.sender) revert NotBuyer();

        DealStatus status = deal.status;
        bool canRefund;

        if (status == DealStatus.Created && block.timestamp > deal.deadline) {
            // Seller never accepted — deal expired
            deal.status = DealStatus.Expired;
            canRefund = true;
            emit DealExpired(dealId);
        } else if (status == DealStatus.Accepted && block.timestamp > deal.deadline) {
            // Seller accepted but never delivered — deal expired
            deal.status = DealStatus.Expired;
            canRefund = true;
            emit DealExpired(dealId);
        } else if (status == DealStatus.Disputed) {
            // Buyer disputed — must wait DISPUTE_TIMEOUT before refund
            uint256 canRefundAt = deal.disputedAt + DISPUTE_TIMEOUT;
            if (block.timestamp < canRefundAt) {
                revert DisputeTimeoutNotReached(canRefundAt, block.timestamp);
            }
            canRefund = true;
            deal.status = DealStatus.Refunded;
        }

        if (!canRefund) revert NotRefundable();

        // CEI: state updated above, now transfer
        address buyer = deal.buyer;
        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        emit DealRefunded(dealId, amount);

        bool success = IERC20(token).transfer(buyer, amount);
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Seller can claim payment if buyer has not acted for DELIVERY_TIMEOUT
     *         after delivery. Protects seller from buyer going unresponsive.
     *
     *         Timeline: deliverDeal() → wait 7 days → sellerClaimAfterTimeout()
     *
     * @dev Buyer still has DELIVERY_TIMEOUT to confirm or dispute.
     *      After that window, seller wins by default.
     */
    function sellerClaimAfterTimeout(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Delivered);
        if (deal.seller != msg.sender) revert NotSeller();

        uint256 canClaimAt = deal.deadline + DELIVERY_TIMEOUT;
        if (block.timestamp < canClaimAt) {
            revert DeliveryTimeoutNotReached(canClaimAt, block.timestamp);
        }

        // CEI: update state before transfer
        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;
        address seller = deal.seller;
        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        emit DealCompleted(dealId, amount);

        bool success = IERC20(token).transfer(seller, amount);
        if (!success) revert TransferFailed();
    }

    /**
     * @notice Seller can reclaim funds from an abandoned dispute.
     *         If the buyer disputed but never called claimRefund within
     *         ABANDONED_DISPUTE_TIMEOUT (30 days), the seller wins by default.
     *
     *         Without this, a malicious or unresponsive buyer could lock
     *         seller funds forever by disputing and never claiming.
     */
    function sellerClaimFromAbandonedDispute(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Disputed);
        if (deal.seller != msg.sender) revert NotSeller();

        uint256 canClaimAt = deal.disputedAt + ABANDONED_DISPUTE_TIMEOUT;
        if (block.timestamp < canClaimAt) {
            revert AbandonedDisputeTimeoutNotReached(canClaimAt, block.timestamp);
        }

        // CEI: update state before transfer
        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;
        address seller = deal.seller;
        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        emit DealCompleted(dealId, amount);

        bool success = IERC20(token).transfer(seller, amount);
        if (!success) revert TransferFailed();
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    function getDeal(uint256 dealId) external view returns (Deal memory) {
        return deals[dealId];
    }

    function getBuyerDeals(uint256 agentId) external view returns (uint256[] memory) {
        return agentDealsAsBuyer[agentId];
    }

    function getSellerDeals(uint256 agentId) external view returns (uint256[] memory) {
        return agentDealsAsSeller[agentId];
    }

    // ──────────────────────────────────────────────
    // Internal
    // ──────────────────────────────────────────────

    function _requireStatus(Deal storage deal, DealStatus expected) internal view {
        if (deal.status != expected) revert InvalidStatus(expected, deal.status);
    }
}
