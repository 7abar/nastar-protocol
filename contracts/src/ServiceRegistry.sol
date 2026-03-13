// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

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
 * @title ServiceRegistry
 * @notice Marketplace for AI agents to register and discover services.
 *         Requires agents to have an ERC-8004 identity NFT on Celo.
 * @author JABAR x NASTAR
 */
contract ServiceRegistry {
    // ──────────────────────────────────────────────
    // Types
    // ──────────────────────────────────────────────

    struct Service {
        uint256 agentId;        // ERC-8004 identity NFT token ID
        address provider;       // Agent's wallet address
        string name;            // Service name (e.g., "web-scraping")
        string description;     // What the service does
        string endpoint;        // API endpoint or contact URI
        address paymentToken;   // Accepted stablecoin (address(0) = any)
        uint256 pricePerCall;   // Price in token's smallest unit
        bool active;            // Is service currently available
        uint256 createdAt;
        uint256 updatedAt;
    }

    // ──────────────────────────────────────────────
    // State
    // ──────────────────────────────────────────────

    IERC721 public immutable identityRegistry;

    uint256 public nextServiceId;
    mapping(uint256 => Service) public services;

    // agentId => serviceId[]
    mapping(uint256 => uint256[]) public agentServices;

    // category tag => serviceId[]
    mapping(bytes32 => uint256[]) public servicesByTag;

    // ──────────────────────────────────────────────
    // Events
    // ──────────────────────────────────────────────

    event ServiceRegistered(
        uint256 indexed serviceId,
        uint256 indexed agentId,
        address indexed provider,
        string name,
        uint256 pricePerCall
    );

    event ServiceUpdated(uint256 indexed serviceId, string name, uint256 pricePerCall, bool active);
    event ServiceDeactivated(uint256 indexed serviceId);
    event ServiceTagged(uint256 indexed serviceId, bytes32 indexed tag);

    // ──────────────────────────────────────────────
    // Errors
    // ──────────────────────────────────────────────

    error NotAgentOwner();
    error ServiceNotFound();
    error NotServiceProvider();
    error EmptyName();

    // ──────────────────────────────────────────────
    // Modifiers
    // ──────────────────────────────────────────────

    modifier onlyAgentOwner(uint256 agentId) {
        if (identityRegistry.ownerOf(agentId) != msg.sender) revert NotAgentOwner();
        _;
    }

    modifier onlyServiceProvider(uint256 serviceId) {
        if (services[serviceId].provider != msg.sender) revert NotServiceProvider();
        _;
    }

    // ──────────────────────────────────────────────
    // Constructor
    // ──────────────────────────────────────────────

    constructor(address _identityRegistry) {
        identityRegistry = IERC721(_identityRegistry);
    }

    // ──────────────────────────────────────────────
    // Write Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Register a new service. Caller must own the ERC-8004 agent NFT.
     */
    function registerService(
        uint256 agentId,
        string calldata name,
        string calldata description,
        string calldata endpoint,
        address paymentToken,
        uint256 pricePerCall,
        bytes32[] calldata tags
    ) external onlyAgentOwner(agentId) returns (uint256 serviceId) {
        if (bytes(name).length == 0) revert EmptyName();

        serviceId = nextServiceId++;

        services[serviceId] = Service({
            agentId: agentId,
            provider: msg.sender,
            name: name,
            description: description,
            endpoint: endpoint,
            paymentToken: paymentToken,
            pricePerCall: pricePerCall,
            active: true,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        agentServices[agentId].push(serviceId);

        for (uint256 i = 0; i < tags.length; i++) {
            servicesByTag[tags[i]].push(serviceId);
            emit ServiceTagged(serviceId, tags[i]);
        }

        emit ServiceRegistered(serviceId, agentId, msg.sender, name, pricePerCall);
    }

    /**
     * @notice Update service details. Only the service provider can update.
     */
    function updateService(
        uint256 serviceId,
        string calldata name,
        string calldata description,
        string calldata endpoint,
        address paymentToken,
        uint256 pricePerCall,
        bool active
    ) external onlyServiceProvider(serviceId) {
        if (bytes(name).length == 0) revert EmptyName();

        Service storage svc = services[serviceId];
        svc.name = name;
        svc.description = description;
        svc.endpoint = endpoint;
        svc.paymentToken = paymentToken;
        svc.pricePerCall = pricePerCall;
        svc.active = active;
        svc.updatedAt = block.timestamp;

        emit ServiceUpdated(serviceId, name, pricePerCall, active);
    }

    /**
     * @notice Deactivate a service.
     */
    function deactivateService(uint256 serviceId) external onlyServiceProvider(serviceId) {
        services[serviceId].active = false;
        services[serviceId].updatedAt = block.timestamp;
        emit ServiceDeactivated(serviceId);
    }

    // ──────────────────────────────────────────────
    // View Functions
    // ──────────────────────────────────────────────

    function getService(uint256 serviceId) external view returns (Service memory) {
        return services[serviceId];
    }

    function getAgentServices(uint256 agentId) external view returns (uint256[] memory) {
        return agentServices[agentId];
    }

    function getServicesByTag(bytes32 tag) external view returns (uint256[] memory) {
        return servicesByTag[tag];
    }

    function getActiveServices(uint256 offset, uint256 limit) external view returns (Service[] memory result, uint256 count) {
        // Count active services first
        uint256 total = nextServiceId;
        uint256 activeCount = 0;
        for (uint256 i = 0; i < total; i++) {
            if (services[i].active) activeCount++;
        }

        // Apply pagination
        if (offset >= activeCount) {
            return (new Service[](0), activeCount);
        }

        uint256 remaining = activeCount - offset;
        uint256 size = remaining < limit ? remaining : limit;
        result = new Service[](size);
        count = activeCount;

        uint256 found = 0;
        uint256 added = 0;
        for (uint256 i = 0; i < total && added < size; i++) {
            if (services[i].active) {
                if (found >= offset) {
                    result[added] = services[i];
                    added++;
                }
                found++;
            }
        }
    }
}
