// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {ServiceRegistry} from "../src/ServiceRegistry.sol";
import {NastarEscrow} from "../src/NastarEscrow.sol";
import {MockERC721} from "./MockERC721.sol";
import {MockERC20} from "./MockERC20.sol";

contract NastarTest is Test {
    ServiceRegistry public registry;
    NastarEscrow public escrow;
    MockERC721 public identity;
    MockERC20 public usdc;

    address public alice = makeAddr("alice"); // buyer agent owner
    address public bob = makeAddr("bob");     // seller agent owner

    uint256 public aliceAgentId;
    uint256 public bobAgentId;

    function setUp() public {
        // Deploy mocks
        identity = new MockERC721();
        usdc = new MockERC20();

        // Deploy Nastar contracts
        registry = new ServiceRegistry(address(identity));
        escrow = new NastarEscrow(address(identity), address(registry));

        // Register agents via ERC-8004 identity
        aliceAgentId = identity.mint(alice);
        bobAgentId = identity.mint(bob);

        // Fund alice with USDC
        usdc.mint(alice, 1000e6); // 1000 USDC
    }

    // ──────────────────────────────────────────────
    // ServiceRegistry Tests
    // ──────────────────────────────────────────────

    function test_registerService() public {
        vm.prank(bob);
        bytes32[] memory tags = new bytes32[](2);
        tags[0] = keccak256("web-scraping");
        tags[1] = keccak256("data");

        uint256 serviceId = registry.registerService(
            bobAgentId,
            "Web Scraping Service",
            "Scrape any website and return structured data",
            "https://agent-bob.example.com/scrape",
            address(usdc),
            5e6, // 5 USDC per call
            tags
        );

        assertEq(serviceId, 0);

        ServiceRegistry.Service memory svc = registry.getService(serviceId);
        assertEq(svc.agentId, bobAgentId);
        assertEq(svc.provider, bob);
        assertEq(svc.name, "Web Scraping Service");
        assertEq(svc.pricePerCall, 5e6);
        assertTrue(svc.active);
    }

    function test_registerService_revertNotOwner() public {
        vm.prank(alice); // alice doesn't own bobAgentId
        bytes32[] memory tags = new bytes32[](0);

        vm.expectRevert(ServiceRegistry.NotAgentOwner.selector);
        registry.registerService(bobAgentId, "Test", "Test", "http://test", address(0), 0, tags);
    }

    function test_updateService() public {
        vm.startPrank(bob);
        bytes32[] memory tags = new bytes32[](0);

        uint256 serviceId = registry.registerService(
            bobAgentId, "Old Name", "Old desc", "http://old", address(usdc), 5e6, tags
        );

        registry.updateService(serviceId, "New Name", "New desc", "http://new", address(usdc), 10e6, true);
        vm.stopPrank();

        ServiceRegistry.Service memory svc = registry.getService(serviceId);
        assertEq(svc.name, "New Name");
        assertEq(svc.pricePerCall, 10e6);
    }

    function test_deactivateService() public {
        vm.startPrank(bob);
        bytes32[] memory tags = new bytes32[](0);
        uint256 serviceId = registry.registerService(
            bobAgentId, "Test", "Test", "http://test", address(usdc), 1e6, tags
        );
        registry.deactivateService(serviceId);
        vm.stopPrank();

        ServiceRegistry.Service memory svc = registry.getService(serviceId);
        assertFalse(svc.active);
    }

    function test_getActiveServices() public {
        vm.startPrank(bob);
        bytes32[] memory tags = new bytes32[](0);

        registry.registerService(bobAgentId, "S1", "D1", "http://1", address(usdc), 1e6, tags);
        registry.registerService(bobAgentId, "S2", "D2", "http://2", address(usdc), 2e6, tags);
        uint256 s3 = registry.registerService(bobAgentId, "S3", "D3", "http://3", address(usdc), 3e6, tags);
        registry.deactivateService(s3);
        vm.stopPrank();

        (ServiceRegistry.Service[] memory result, uint256 count) = registry.getActiveServices(0, 10);
        assertEq(count, 2);
        assertEq(result.length, 2);
        assertEq(result[0].name, "S1");
        assertEq(result[1].name, "S2");
    }

    function test_servicesByTag() public {
        vm.startPrank(bob);
        bytes32[] memory tags = new bytes32[](1);
        tags[0] = keccak256("ai");

        registry.registerService(bobAgentId, "AI1", "D", "http://1", address(usdc), 1e6, tags);
        registry.registerService(bobAgentId, "AI2", "D", "http://2", address(usdc), 2e6, tags);
        vm.stopPrank();

        uint256[] memory ids = registry.getServicesByTag(keccak256("ai"));
        assertEq(ids.length, 2);
    }

    // ──────────────────────────────────────────────
    // NastarEscrow Tests
    // ──────────────────────────────────────────────

    function _createTestService() internal returns (uint256) {
        vm.prank(bob);
        bytes32[] memory tags = new bytes32[](0);
        return registry.registerService(
            bobAgentId, "Test Service", "A test", "http://test", address(usdc), 10e6, tags
        );
    }

    function _createTestDeal(uint256 serviceId) internal returns (uint256) {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 10e6);
        uint256 dealId = escrow.createDeal(
            serviceId,
            aliceAgentId,
            bobAgentId,
            address(usdc),
            10e6,
            "Please scrape example.com",
            block.timestamp + 7 days
        );
        vm.stopPrank();
        return dealId;
    }

    function test_createDeal() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        NastarEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.buyerAgentId, aliceAgentId);
        assertEq(deal.sellerAgentId, bobAgentId);
        assertEq(deal.amount, 10e6);
        assertEq(uint8(deal.status), uint8(NastarEscrow.DealStatus.Created));

        // Funds should be in escrow
        assertEq(usdc.balanceOf(address(escrow)), 10e6);
        assertEq(usdc.balanceOf(alice), 990e6);
    }

    function test_fullDealFlow() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        // Bob accepts
        vm.prank(bob);
        escrow.acceptDeal(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Accepted));

        // Bob delivers
        vm.prank(bob);
        escrow.deliverDeal(dealId, "ipfs://QmResult123");
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Delivered));

        // Alice confirms
        vm.prank(alice);
        escrow.confirmDelivery(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Completed));

        // Funds released to Bob
        assertEq(usdc.balanceOf(bob), 10e6);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_disputeDeal() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(bob);
        escrow.acceptDeal(dealId);

        vm.prank(bob);
        escrow.deliverDeal(dealId, "ipfs://QmBadResult");

        // Alice disputes
        vm.prank(alice);
        escrow.disputeDeal(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Disputed));
        assertGt(escrow.getDeal(dealId).disputedAt, 0);

        // Alice cannot claim refund immediately — DISPUTE_TIMEOUT not elapsed
        vm.prank(alice);
        vm.expectRevert();
        escrow.claimRefund(dealId);

        // Warp past DISPUTE_TIMEOUT (3 days)
        vm.warp(block.timestamp + 3 days + 1);

        // Now Alice can claim refund
        vm.prank(alice);
        escrow.claimRefund(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Refunded));
        assertEq(usdc.balanceOf(alice), 1000e6); // full refund
    }

    function test_selfDeal_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 10e6);
        vm.expectRevert(NastarEscrow.SelfDeal.selector);
        escrow.createDeal(
            0,
            aliceAgentId,
            aliceAgentId, // same agent ID as buyer
            address(usdc),
            10e6,
            "self deal attempt",
            block.timestamp + 1 days
        );
        vm.stopPrank();
    }

    function test_zeroAmount_reverts() public {
        vm.startPrank(alice);
        vm.expectRevert(NastarEscrow.ZeroAmount.selector);
        escrow.createDeal(
            0, aliceAgentId, bobAgentId, address(usdc), 0,
            "zero amount", block.timestamp + 1 days
        );
        vm.stopPrank();
    }

    function test_zeroPaymentToken_reverts() public {
        vm.startPrank(alice);
        vm.expectRevert(NastarEscrow.ZeroAddress.selector);
        escrow.createDeal(
            0, aliceAgentId, bobAgentId, address(0), 10e6,
            "zero token", block.timestamp + 1 days
        );
        vm.stopPrank();
    }

    function test_expiredDeal_refund() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        // Nobody accepts, deadline passes
        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        escrow.claimRefund(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Expired));
        assertEq(usdc.balanceOf(alice), 1000e6);
    }

    function test_acceptedButNotDelivered_refund() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(bob);
        escrow.acceptDeal(dealId);

        // Deadline passes without delivery
        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        escrow.claimRefund(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Expired));
        assertEq(usdc.balanceOf(alice), 1000e6);
    }

    function test_revert_nonBuyerConfirm() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(bob);
        escrow.acceptDeal(dealId);
        vm.prank(bob);
        escrow.deliverDeal(dealId, "ipfs://QmResult");

        // Bob tries to confirm (should fail)
        vm.prank(bob);
        vm.expectRevert(NastarEscrow.NotBuyer.selector);
        escrow.confirmDelivery(dealId);
    }

    function test_revert_nonSellerAccept() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(alice); // alice is buyer, not seller
        vm.expectRevert(NastarEscrow.NotSeller.selector);
        escrow.acceptDeal(dealId);
    }

    function test_getBuyerAndSellerDeals() public {
        uint256 serviceId = _createTestService();
        _createTestDeal(serviceId);

        uint256[] memory buyerDeals = escrow.getBuyerDeals(aliceAgentId);
        uint256[] memory sellerDeals = escrow.getSellerDeals(bobAgentId);

        assertEq(buyerDeals.length, 1);
        assertEq(sellerDeals.length, 1);
        assertEq(buyerDeals[0], sellerDeals[0]);
    }
}
