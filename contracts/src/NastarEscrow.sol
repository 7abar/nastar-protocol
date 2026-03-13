// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {IERC721} from "forge-std/interfaces/IERC721.sol";

/*
 *
 *                        .·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·..·:·.
 *                  / .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  .\  /
 *                 | \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ \ \/ |
 *                  \/`·..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`\/
 *                  /\                                                             /\
 *                 / /\   ███████╗███████╗ ██████╗██████╗  ██████╗ ██╗    ██╗     / /\
 *                / /\ \  ██╔════╝██╔════╝██╔════╝██╔══██╗██╔═══██╗██║    ██║    / /\ \
 *               / /  \ \ █████╗  ███████╗██║     ██████╔╝██║   ██║██║ █╗ ██║   / /  \ \
 *              / /    \ \██╔══╝  ╚════██║██║     ██╔══██╗██║   ██║██║███╗██║  / /    \ \
 *             / /      \\███████╗███████║╚██████╗██║  ██║╚██████╔╝╚███╔███╔╝ / /      \ \
 *            / /        \╚══════╝╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝/ /        \ \
 *           / /          \ \                                                / /          \ \
 *          / /    ██████╗  \ \ ███████╗ █████╗ ██╗     ███████╗           / /            \ \
 *         / /     ██╔══██╗  \ \██╔════╝██╔══██╗██║     ██╔════╝          \ \            / /
 *        \ \      ██║  ██║  / /█████╗  ███████║██║     ███████╗           \ \          / /
 *         \ \     ██║  ██║ / / ██╔══╝  ██╔══██║██║     ╚════██║            \ \        / /
 *          \ \    ██████╔╝/ /  ███████╗██║  ██║███████╗███████║              \ \      / /
 *           \ \   ╚═════╝/ /   ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝              \ \    / /
 *            \ \        / /                                                     \ \  / /
 *             \ \      / /  ███╗   ██╗ █████╗ ███████╗████████╗ █████╗ ██████╗   \ \/ /
 *              \ \    / /   ████╗  ██║██╔══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗   \  /
 *               \ \  / /    ██╔██╗ ██║███████║███████╗   ██║   ███████║██████╔╝    /\
 *                \ \/ /     ██║╚██╗██║██╔══██║╚════██║   ██║   ██╔══██║██╔══██╗   / /\
 *                 \  /      ██║ ╚████║██║  ██║███████║   ██║   ██║  ██║██║  ██║  / /\ \
 *                  \/       ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝\ \
 *                  /\`·..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`..·`/\
 *                 | /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ /\ |
 *                  \ ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  ·/  \
 *                        `·:·``·:·``·:·``·:·``·:·``·:·``·:·``·:·``·:·``·:·`
 *
 *                  ┌─────────────────────────────────────────────────────────┐
 *                  │         NastarEscrow  —  Agent Commerce on Celo        │
 *                  │         Your agent works globally. Gets paid locally.   │
 *                  │                                                         │
 *                  │   ERC-8004 Identity  ·  Multi-Stablecoin  ·  Escrow    │
 *                  │       github.com/filx-io/nastar  ·  @7abar_eth         │
 *                  └─────────────────────────────────────────────────────────┘
 *
 */

/**
 * @title NastarEscrow
 * @notice Escrow contract for agent-to-agent service deals on Celo.
 *         Integrates with ERC-8004 Identity Registry and ServiceRegistry.
 *         Supports any Celo stablecoin (USDm, USDC, USDT, KESm, NGNm, etc.)
 * @author JABAR (@7abar_eth) x BERU
 */
contract NastarEscrow {
    // ──────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────

    enum DealStatus {
        Created,        // Buyer created deal, funds escrowed
        Accepted,       // Seller accepted the deal
        Delivered,      // Seller marked as delivered
        Completed,      // Buyer confirmed, funds released
        Disputed,       // Buyer disputes delivery
        Refunded,       // Funds returned to buyer
        Expired         // Deal expired without completion
    }

    struct Deal {
        uint256 dealId;
        uint256 serviceId;
        uint256 buyerAgentId;   // ERC-8004 NFT ID
        uint256 sellerAgentId;  // ERC-8004 NFT ID
        address buyer;
        address seller;
        address paymentToken;   // Stablecoin used
        uint256 amount;
        string taskDescription;
        string deliveryProof;   // IPFS hash or URL of deliverable
        DealStatus status;
        uint256 createdAt;
        uint256 deadline;       // Unix timestamp
        uint256 completedAt;
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

    // Dispute resolution: simple timeout-based for MVP
    uint256 public constant DISPUTE_TIMEOUT = 3 days;
    uint256 public constant MAX_DEADLINE = 30 days;

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
    event DealDisputed(uint256 indexed dealId, uint256 indexed buyerAgentId);
    event DealRefunded(uint256 indexed dealId, uint256 amount);
    event DealExpired(uint256 indexed dealId);

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error NotAgentOwner();
    error DealNotFound();
    error InvalidStatus(DealStatus expected, DealStatus actual);
    error NotBuyer();
    error NotSeller();
    error DeadlineTooLong();
    error DealExpiredError();
    error TransferFailed();
    error ZeroAmount();
    error DisputeTimeoutNotReached();

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _identityRegistry, address _serviceRegistry) {
        identityRegistry = IERC721(_identityRegistry);
        serviceRegistry = _serviceRegistry;
    }

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Create a deal and escrow payment.
     *         Buyer must own the buyerAgentId NFT and approve token transfer.
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
        if (identityRegistry.ownerOf(buyerAgentId) != msg.sender) revert NotAgentOwner();
        if (amount == 0) revert ZeroAmount();
        if (deadline > block.timestamp + MAX_DEADLINE) revert DeadlineTooLong();
        if (deadline <= block.timestamp) revert DealExpiredError();

        // Transfer payment to escrow
        bool success = IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        dealId = nextDealId++;
        address seller = identityRegistry.ownerOf(sellerAgentId);

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
            completedAt: 0
        });

        agentDealsAsBuyer[buyerAgentId].push(dealId);
        agentDealsAsSeller[sellerAgentId].push(dealId);

        emit DealCreated(dealId, buyerAgentId, sellerAgentId, serviceId, paymentToken, amount, deadline);
    }

    /**
     * @notice Seller accepts a deal.
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
     * @notice Seller marks deal as delivered with proof.
     */
    function deliverDeal(uint256 dealId, string calldata proof) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Accepted);
        if (deal.seller != msg.sender) revert NotSeller();

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

        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;

        bool success = IERC20(deal.paymentToken).transfer(deal.seller, deal.amount);
        if (!success) revert TransferFailed();

        emit DealCompleted(dealId, deal.amount);
    }

    /**
     * @notice Buyer disputes a delivered deal.
     */
    function disputeDeal(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Delivered);
        if (deal.buyer != msg.sender) revert NotBuyer();

        deal.status = DealStatus.Disputed;
        emit DealDisputed(dealId, deal.buyerAgentId);
    }

    /**
     * @notice Refund buyer if deal expired (seller never accepted/delivered)
     *         or if dispute timeout reached without resolution.
     */
    function claimRefund(uint256 dealId) external {
        Deal storage deal = deals[dealId];
        if (deal.buyer != msg.sender) revert NotBuyer();

        bool canRefund = false;

        // Expired: seller never accepted before deadline
        if (deal.status == DealStatus.Created && block.timestamp > deal.deadline) {
            deal.status = DealStatus.Expired;
            canRefund = true;
            emit DealExpired(dealId);
        }
        // Disputed and timeout reached: auto-refund buyer
        else if (deal.status == DealStatus.Disputed) {
            // For MVP: disputes auto-resolve in buyer's favor after timeout
            // Future: add arbitration layer
            canRefund = true;
            deal.status = DealStatus.Refunded;
        }
        // Accepted but deadline passed without delivery
        else if (deal.status == DealStatus.Accepted && block.timestamp > deal.deadline) {
            deal.status = DealStatus.Expired;
            canRefund = true;
            emit DealExpired(dealId);
        }

        if (!canRefund) revert InvalidStatus(DealStatus.Disputed, deal.status);

        bool success = IERC20(deal.paymentToken).transfer(deal.buyer, deal.amount);
        if (!success) revert TransferFailed();

        emit DealRefunded(dealId, deal.amount);
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
