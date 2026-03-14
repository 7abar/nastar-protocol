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
 * @notice Hardened escrow for agent service deals on Celo.
 *         Integrates with ERC-8004 Identity Registry and ServiceRegistry.
 *         Supports any Celo stablecoin (USDm, USDC, USDT, KESm, NGNm, etc.)
 * @author JABAR x NASTAR
 *
 * Security model:
 *   - ReentrancyGuard on all fund-moving functions
 *   - SafeERC20 transfers (handles non-standard tokens like USDT)
 *   - CEI pattern: state updated before external calls
 *   - Same-wallet self-deal prevention (anti-reputation-gaming)
 *   - Minimum deal amount prevents dust/griefing attacks
 *   - Minimum deadline prevents uncompleable deals
 *   - Clean dispute timeout boundary (no race condition)
 *   - 2.5% protocol fee on seller payments only (refunds are fee-free)
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
        Expired,    // Deal expired without acceptance or delivery
        Resolved    // Dispute contested — funds split 50/50
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
        bool autoConfirm;        // If true, deliverDeal auto-releases payment
    }

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    IERC721 public immutable identityRegistry;
    address public immutable serviceRegistry;
    address public immutable feeRecipient;

    /// @notice Trusted AI judge address — only address that can call resolveDisputeWithJudge.
    address public immutable judgeAddress;

    uint256 public nextDealId;
    mapping(uint256 => Deal) public deals;

    // agentId => dealId[]
    mapping(uint256 => uint256[]) public agentDealsAsBuyer;
    mapping(uint256 => uint256[]) public agentDealsAsSeller;

    /// @dev ReentrancyGuard state
    uint256 private _locked = 1;

    // ──────────────────────────────────────────────
    // Constants
    // ──────────────────────────────────────────────

    /// @notice Protocol fee in basis points (250 = 2.5%).
    uint256 public constant PROTOCOL_FEE_BPS = 250;

    /// @notice Seller has 3 days to contest or respond after a dispute.
    uint256 public constant DISPUTE_TIMEOUT = 3 days;

    /// @notice Maximum allowed deal deadline from creation.
    uint256 public constant MAX_DEADLINE = 30 days;

    /// @notice Minimum deadline duration from creation. Prevents uncompleable deals.
    uint256 public constant MIN_DEADLINE = 1 hours;

    /// @notice Seller can force-claim payment if buyer is unresponsive this long after deadline.
    uint256 public constant DELIVERY_TIMEOUT = 7 days;

    /// @notice If buyer disputes but never claims refund, seller can reclaim after this timeout.
    uint256 public constant ABANDONED_DISPUTE_TIMEOUT = 30 days;

    /// @notice Minimum deal amount to prevent dust/griefing attacks.
    uint256 public constant MIN_AMOUNT = 1000; // 0.001 USDC (6 decimals)

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
    event DealCompleted(uint256 indexed dealId, uint256 sellerAmount, uint256 feeAmount);
    event DealDisputed(uint256 indexed dealId, uint256 indexed buyerAgentId, uint256 disputedAt);
    event DealContested(uint256 indexed dealId, uint256 buyerAmount, uint256 sellerAmount, uint256 feeAmount);
    event DisputeResolved(uint256 indexed dealId, uint256 sellerBps, uint256 buyerAmount, uint256 sellerAmount, uint256 feeAmount, string reasoning);
    event DealRefunded(uint256 indexed dealId, uint256 amount);
    event DealExpired(uint256 indexed dealId);

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error NotJudge();
    error NotAgentOwner();
    error NotBuyer();
    error NotSeller();
    error InvalidStatus(DealStatus expected, DealStatus actual);
    error NotRefundable();
    error DeadlineTooLong();
    error DeadlineTooShort();
    error DealExpiredError();
    error TransferFailed();
    error ZeroAmount();
    error AmountTooSmall();
    error ZeroAddress();
    error DisputeTimeoutNotReached(uint256 canRefundAt, uint256 now_);
    error DisputeTimeoutReached();
    error DeliveryTimeoutNotReached(uint256 canClaimAt, uint256 now_);
    error AbandonedDisputeTimeoutNotReached(uint256 canClaimAt, uint256 now_);
    error SelfDeal();
    error ReentrancyDetected();

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    /// @dev Prevents reentrant calls to fund-moving functions.
    modifier nonReentrant() {
        if (_locked != 1) revert ReentrancyDetected();
        _locked = 2;
        _;
        _locked = 1;
    }

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _identityRegistry, address _serviceRegistry, address _feeRecipient, address _judgeAddress) {
        if (_identityRegistry == address(0) || _serviceRegistry == address(0) || _feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        identityRegistry = IERC721(_identityRegistry);
        serviceRegistry = _serviceRegistry;
        feeRecipient = _feeRecipient;
        judgeAddress = _judgeAddress == address(0) ? _feeRecipient : _judgeAddress;
    }

    // ──────────────────────────────────────────────
    // Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Create a deal and escrow payment.
     *         Buyer must own the buyerAgentId NFT and have approved this contract.
     *
     * Security:
     *   - ReentrancyGuard (external ERC-20 call)
     *   - Self-deal check: agentId AND wallet address
     *   - Minimum amount prevents dust attacks
     *   - Minimum deadline prevents uncompleable deals
     *   - SafeERC20 for token transfer
     */
    function createDeal(
        uint256 serviceId,
        uint256 buyerAgentId,
        uint256 sellerAgentId,
        address paymentToken,
        uint256 amount,
        string calldata taskDescription,
        uint256 deadline,
        bool autoConfirm
    ) external nonReentrant returns (uint256 dealId) {
        if (identityRegistry.ownerOf(buyerAgentId) != msg.sender) revert NotAgentOwner();
        if (buyerAgentId == sellerAgentId) revert SelfDeal();
        if (amount == 0) revert ZeroAmount();
        if (amount < MIN_AMOUNT) revert AmountTooSmall();
        if (paymentToken == address(0)) revert ZeroAddress();
        if (deadline > block.timestamp + MAX_DEADLINE) revert DeadlineTooLong();
        if (deadline < block.timestamp + MIN_DEADLINE) revert DeadlineTooShort();

        // Capture seller address at deal creation time
        address seller = identityRegistry.ownerOf(sellerAgentId);

        // Prevent same-wallet self-dealing (anti-reputation-gaming)
        if (msg.sender == seller) revert SelfDeal();

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
            disputedAt: 0,
            autoConfirm: autoConfirm
        });

        agentDealsAsBuyer[buyerAgentId].push(dealId);
        agentDealsAsSeller[sellerAgentId].push(dealId);

        emit DealCreated(dealId, buyerAgentId, sellerAgentId, serviceId, paymentToken, amount, deadline);

        _safeTransferFrom(IERC20(paymentToken), msg.sender, address(this), amount);
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
     * @notice Seller marks deal as delivered with proof of work.
     *         If autoConfirm is set, payment releases immediately.
     *         Buyer can still dispute within DISPUTE_TIMEOUT if unhappy.
     */
    function deliverDeal(uint256 dealId, string calldata proof) external nonReentrant {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Accepted);
        if (deal.seller != msg.sender) revert NotSeller();
        if (block.timestamp > deal.deadline) revert DealExpiredError();

        deal.deliveryProof = proof;

        if (deal.autoConfirm) {
            // Auto-release payment to seller (buyer opted in)
            deal.status = DealStatus.Completed;
            deal.completedAt = block.timestamp;
            emit DealDelivered(dealId, proof);
            _paySellerWithFee(deal);
        } else {
            deal.status = DealStatus.Delivered;
            emit DealDelivered(dealId, proof);
        }
    }

    /**
     * @notice Buyer confirms delivery, releasing escrowed funds to seller (minus fee).
     */
    function confirmDelivery(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Delivered);
        if (deal.buyer != msg.sender) revert NotBuyer();

        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;

        _paySellerWithFee(deal);
    }

    /**
     * @notice Buyer disputes a delivered deal.
     *         Seller has DISPUTE_TIMEOUT to contest (50/50 split) or the buyer
     *         can claim a full refund after the timeout.
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
     * @notice Seller contests a dispute within the DISPUTE_TIMEOUT window.
     *         Funds are split 50/50 (minus protocol fee).
     *
     *         Window: [disputedAt, disputedAt + DISPUTE_TIMEOUT)
     *         After DISPUTE_TIMEOUT: only buyer can claim full refund.
     */
    function contestDispute(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Disputed);
        if (deal.seller != msg.sender) revert NotSeller();

        // Strict boundary: seller must contest BEFORE timeout, not at it
        if (block.timestamp >= deal.disputedAt + DISPUTE_TIMEOUT) revert DisputeTimeoutReached();

        // CEI: update state before transfers
        deal.status = DealStatus.Resolved;
        deal.completedAt = block.timestamp;

        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        // Calculate fee from total, then split remainder
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 remaining = amount - fee;
        uint256 buyerAmount = remaining / 2;
        uint256 sellerAmount = remaining - buyerAmount; // handles odd wei

        emit DealContested(dealId, buyerAmount, sellerAmount, fee);

        if (fee > 0) {
            _safeTransfer(IERC20(token), feeRecipient, fee);
        }
        if (buyerAmount > 0) {
            _safeTransfer(IERC20(token), deal.buyer, buyerAmount);
        }
        if (sellerAmount > 0) {
            _safeTransfer(IERC20(token), deal.seller, sellerAmount);
        }
    }

    /**
     * @notice AI judge resolves a disputed deal with a custom split.
     *         Only callable by the trusted judgeAddress (our AI server wallet).
     *
     * @param dealId    The disputed deal to resolve.
     * @param sellerBps Basis points awarded to seller (0–10000). e.g. 7500 = 75% to seller.
     * @param reasoning Short human-readable reasoning string stored on-chain for transparency.
     */
    function resolveDisputeWithJudge(
        uint256 dealId,
        uint256 sellerBps,
        string calldata reasoning
    ) external nonReentrant {
        if (msg.sender != judgeAddress) revert NotJudge();
        if (sellerBps > 10000) sellerBps = 10000;

        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Disputed);

        // CEI: update state before transfers
        deal.status = DealStatus.Resolved;
        deal.completedAt = block.timestamp;

        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        uint256 fee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 remaining = amount - fee;
        uint256 sellerAmount = (remaining * sellerBps) / 10000;
        uint256 buyerAmount = remaining - sellerAmount;

        emit DisputeResolved(dealId, sellerBps, buyerAmount, sellerAmount, fee, reasoning);

        if (fee > 0)          _safeTransfer(IERC20(token), feeRecipient, fee);
        if (sellerAmount > 0) _safeTransfer(IERC20(token), deal.seller, sellerAmount);
        if (buyerAmount > 0)  _safeTransfer(IERC20(token), deal.buyer, buyerAmount);
    }

    /**
     * @notice Claim a refund. Three valid scenarios:
     *   1. Deal was never accepted before the deadline (seller no-show).
     *   2. Deal was accepted but not delivered before the deadline.
     *   3. Deal was disputed, seller did NOT contest, AND DISPUTE_TIMEOUT elapsed.
     *
     * Refunds are fee-free — buyer always gets full amount back.
     */
    function claimRefund(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        if (deal.buyer != msg.sender) revert NotBuyer();

        DealStatus status = deal.status;
        bool canRefund;

        if (status == DealStatus.Created && block.timestamp > deal.deadline) {
            deal.status = DealStatus.Expired;
            canRefund = true;
            emit DealExpired(dealId);
        } else if (status == DealStatus.Accepted && block.timestamp > deal.deadline) {
            deal.status = DealStatus.Expired;
            canRefund = true;
            emit DealExpired(dealId);
        } else if (status == DealStatus.Disputed) {
            uint256 canRefundAt = deal.disputedAt + DISPUTE_TIMEOUT;
            if (block.timestamp < canRefundAt) {
                revert DisputeTimeoutNotReached(canRefundAt, block.timestamp);
            }
            canRefund = true;
            deal.status = DealStatus.Refunded;
        }

        if (!canRefund) revert NotRefundable();

        address buyer = deal.buyer;
        address token = deal.paymentToken;
        uint256 amount = deal.amount;

        emit DealRefunded(dealId, amount);

        _safeTransfer(IERC20(token), buyer, amount);
    }

    /**
     * @notice Seller force-claims payment if buyer is unresponsive after delivery.
     */
    function sellerClaimAfterTimeout(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Delivered);
        if (deal.seller != msg.sender) revert NotSeller();

        uint256 canClaimAt = deal.deadline + DELIVERY_TIMEOUT;
        if (block.timestamp < canClaimAt) {
            revert DeliveryTimeoutNotReached(canClaimAt, block.timestamp);
        }

        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;

        _paySellerWithFee(deal);
    }

    /**
     * @notice Seller reclaims funds from an abandoned dispute.
     */
    function sellerClaimFromAbandonedDispute(uint256 dealId) external nonReentrant {
        Deal storage deal = deals[dealId];
        _requireStatus(deal, DealStatus.Disputed);
        if (deal.seller != msg.sender) revert NotSeller();

        uint256 canClaimAt = deal.disputedAt + ABANDONED_DISPUTE_TIMEOUT;
        if (block.timestamp < canClaimAt) {
            revert AbandonedDisputeTimeoutNotReached(canClaimAt, block.timestamp);
        }

        deal.status = DealStatus.Completed;
        deal.completedAt = block.timestamp;

        _paySellerWithFee(deal);
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

    /**
     * @dev Pay seller with protocol fee deducted.
     *      MUST be called AFTER status is set to terminal (CEI).
     */
    function _paySellerWithFee(Deal storage deal) internal {
        address token = deal.paymentToken;
        uint256 amount = deal.amount;
        uint256 fee = (amount * PROTOCOL_FEE_BPS) / 10000;
        uint256 sellerAmount = amount - fee;

        emit DealCompleted(deal.dealId, sellerAmount, fee);

        if (fee > 0) {
            _safeTransfer(IERC20(token), feeRecipient, fee);
        }

        _safeTransfer(IERC20(token), deal.seller, sellerAmount);
    }

    /**
     * @dev Safe ERC-20 transfer. Handles tokens that don't return bool (e.g., USDT).
     *      Reverts on failure or false return.
     */
    function _safeTransfer(IERC20 token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }

    /**
     * @dev Safe ERC-20 transferFrom. Handles tokens that don't return bool.
     */
    function _safeTransferFrom(IERC20 token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert TransferFailed();
        }
    }
}
