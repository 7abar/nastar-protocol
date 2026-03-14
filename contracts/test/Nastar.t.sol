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

    address public alice = makeAddr("alice"); // buyer
    address public bob = makeAddr("bob");     // seller agent owner
    address public treasury = makeAddr("treasury"); // fee recipient

    uint256 public aliceAgentId;
    uint256 public bobAgentId;

    function setUp() public {
        identity = new MockERC721();
        usdc = new MockERC20();

        registry = new ServiceRegistry(address(identity));
        escrow = new NastarEscrow(address(identity), address(registry), treasury);

        aliceAgentId = identity.mint(alice);
        bobAgentId = identity.mint(bob);

        usdc.mint(alice, 1000e6);
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    function _fee(uint256 amount) internal pure returns (uint256) {
        return (amount * 250) / 10000; // 2.5%
    }

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
            serviceId, aliceAgentId, bobAgentId, address(usdc), 10e6,
            "Please scrape example.com", block.timestamp + 7 days
        );
        vm.stopPrank();
        return dealId;
    }

    function _deliverDeal(uint256 dealId) internal {
        vm.prank(bob);
        escrow.acceptDeal(dealId);
        vm.prank(bob);
        escrow.deliverDeal(dealId, "ipfs://QmResult123");
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
            bobAgentId, "Web Scraping Service",
            "Scrape any website and return structured data",
            "https://agent-bob.example.com/scrape",
            address(usdc), 5e6, tags
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
        vm.prank(alice);
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

        assertFalse(registry.getService(serviceId).active);
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
    }

    function test_servicesByTag() public {
        vm.startPrank(bob);
        bytes32[] memory tags = new bytes32[](1);
        tags[0] = keccak256("ai");
        registry.registerService(bobAgentId, "AI1", "D", "http://1", address(usdc), 1e6, tags);
        registry.registerService(bobAgentId, "AI2", "D", "http://2", address(usdc), 2e6, tags);
        vm.stopPrank();

        assertEq(registry.getServicesByTag(keccak256("ai")).length, 2);
    }

    function test_tooManyTags_reverts() public {
        vm.startPrank(bob);
        bytes32[] memory tags = new bytes32[](11);
        for (uint256 i = 0; i < 11; i++) tags[i] = bytes32(i);

        vm.expectRevert(ServiceRegistry.TooManyTags.selector);
        registry.registerService(bobAgentId, "Test", "Desc", "http://test", address(usdc), 1e6, tags);
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — Deal Creation
    // ──────────────────────────────────────────────

    function test_createDeal() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        NastarEscrow.Deal memory deal = escrow.getDeal(dealId);
        assertEq(deal.buyerAgentId, aliceAgentId);
        assertEq(deal.sellerAgentId, bobAgentId);
        assertEq(deal.amount, 10e6);
        assertEq(uint8(deal.status), uint8(NastarEscrow.DealStatus.Created));
        assertEq(usdc.balanceOf(address(escrow)), 10e6);
        assertEq(usdc.balanceOf(alice), 990e6);
    }

    function test_selfDeal_reverts() public {
        vm.startPrank(alice);
        usdc.approve(address(escrow), 10e6);
        vm.expectRevert(NastarEscrow.SelfDeal.selector);
        escrow.createDeal(0, aliceAgentId, aliceAgentId, address(usdc), 10e6, "self deal", block.timestamp + 1 days);
        vm.stopPrank();
    }

    function test_zeroAmount_reverts() public {
        vm.startPrank(alice);
        vm.expectRevert(NastarEscrow.ZeroAmount.selector);
        escrow.createDeal(0, aliceAgentId, bobAgentId, address(usdc), 0, "zero", block.timestamp + 1 days);
        vm.stopPrank();
    }

    function test_zeroPaymentToken_reverts() public {
        vm.startPrank(alice);
        vm.expectRevert(NastarEscrow.ZeroAddress.selector);
        escrow.createDeal(0, aliceAgentId, bobAgentId, address(0), 10e6, "zero token", block.timestamp + 1 days);
        vm.stopPrank();
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — Full Flow + Fees
    // ──────────────────────────────────────────────

    function test_fullDealFlow_withFee() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        _deliverDeal(dealId);

        // Alice confirms
        vm.prank(alice);
        escrow.confirmDelivery(dealId);

        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Completed));

        // Verify fee distribution: 10e6 amount, 2.5% = 250000 fee
        uint256 fee = _fee(10e6);          // 250000
        uint256 sellerPay = 10e6 - fee;    // 9750000
        assertEq(usdc.balanceOf(bob), sellerPay);
        assertEq(usdc.balanceOf(treasury), fee);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_feeRecipient_isImmutable() public view {
        assertEq(escrow.feeRecipient(), treasury);
        assertEq(escrow.PROTOCOL_FEE_BPS(), 250);
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — Disputes
    // ──────────────────────────────────────────────

    function test_disputeDeal_thenRefund() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        // Alice disputes
        vm.prank(alice);
        escrow.disputeDeal(dealId);
        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Disputed));

        // Can't refund yet
        vm.prank(alice);
        vm.expectRevert();
        escrow.claimRefund(dealId);

        // After 3 days — full refund, NO FEE
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(alice);
        escrow.claimRefund(dealId);

        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Refunded));
        assertEq(usdc.balanceOf(alice), 1000e6); // full refund
        assertEq(usdc.balanceOf(treasury), 0);   // no fee on refund
    }

    function test_contestDispute_50_50_split() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        // Alice disputes
        vm.prank(alice);
        escrow.disputeDeal(dealId);

        // Bob contests within 3 days → 50/50 split
        vm.prank(bob);
        escrow.contestDispute(dealId);

        assertEq(uint8(escrow.getDeal(dealId).status), uint8(NastarEscrow.DealStatus.Resolved));

        // Verify: 10e6 total, fee=250000, remaining=9750000, each gets 4875000
        uint256 fee = _fee(10e6);                  // 250000
        uint256 remaining = 10e6 - fee;            // 9750000
        uint256 halfBuyer = remaining / 2;         // 4875000
        uint256 halfSeller = remaining - halfBuyer; // 4875000

        assertEq(usdc.balanceOf(alice), 990e6 + halfBuyer); // 990e6 + 4875000
        assertEq(usdc.balanceOf(bob), halfSeller);           // 4875000
        assertEq(usdc.balanceOf(treasury), fee);              // 250000
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_contestDispute_afterTimeout_reverts() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(alice);
        escrow.disputeDeal(dealId);

        // Wait past DISPUTE_TIMEOUT — too late to contest
        vm.warp(block.timestamp + 3 days + 1);

        vm.prank(bob);
        vm.expectRevert(NastarEscrow.DisputeTimeoutReached.selector);
        escrow.contestDispute(dealId);
    }

    function test_contestDispute_nonSeller_reverts() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(alice);
        escrow.disputeDeal(dealId);

        // Alice (buyer) tries to contest — must fail
        vm.prank(alice);
        vm.expectRevert(NastarEscrow.NotSeller.selector);
        escrow.contestDispute(dealId);
    }

    function test_contestDispute_blocksRefund() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(alice);
        escrow.disputeDeal(dealId);

        // Bob contests
        vm.prank(bob);
        escrow.contestDispute(dealId);

        // Alice tries to refund — status is Resolved, not Disputed
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(alice);
        vm.expectRevert();
        escrow.claimRefund(dealId);
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — Expiry + Timeouts
    // ──────────────────────────────────────────────

    function test_expiredDeal_refund_noFee() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        escrow.claimRefund(dealId);

        assertEq(usdc.balanceOf(alice), 1000e6); // full refund
        assertEq(usdc.balanceOf(treasury), 0);   // no fee
    }

    function test_acceptedButNotDelivered_refund() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(bob);
        escrow.acceptDeal(dealId);

        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        escrow.claimRefund(dealId);

        assertEq(usdc.balanceOf(alice), 1000e6);
    }

    function test_deliverAfterDeadline_reverts() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(bob);
        escrow.acceptDeal(dealId);

        vm.warp(block.timestamp + 8 days);

        vm.prank(bob);
        vm.expectRevert(NastarEscrow.DealExpiredError.selector);
        escrow.deliverDeal(dealId, "ipfs://LateFiling");
    }

    function test_sellerClaimAfterBuyerTimeout_withFee() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.warp(block.timestamp + 7 days + escrow.DELIVERY_TIMEOUT() + 1);

        vm.prank(bob);
        escrow.sellerClaimAfterTimeout(dealId);

        uint256 fee = _fee(10e6);
        assertEq(usdc.balanceOf(bob), 10e6 - fee);
        assertEq(usdc.balanceOf(treasury), fee);
    }

    function test_sellerClaimTooEarly_reverts() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(bob);
        vm.expectRevert();
        escrow.sellerClaimAfterTimeout(dealId);
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — Abandoned Disputes
    // ──────────────────────────────────────────────

    function test_sellerClaimFromAbandonedDispute_withFee() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(alice);
        escrow.disputeDeal(dealId);

        // Too early
        vm.prank(bob);
        vm.expectRevert();
        escrow.sellerClaimFromAbandonedDispute(dealId);

        // After 30 days
        vm.warp(block.timestamp + 30 days + 1);

        vm.prank(bob);
        escrow.sellerClaimFromAbandonedDispute(dealId);

        uint256 fee = _fee(10e6);
        assertEq(usdc.balanceOf(bob), 10e6 - fee);
        assertEq(usdc.balanceOf(treasury), fee);
    }

    function test_buyerRefundsBeforeAbandonedTimeout() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(alice);
        escrow.disputeDeal(dealId);

        // Buyer claims after 3 days (normal flow)
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(alice);
        escrow.claimRefund(dealId);

        // Seller tries abandoned claim — fails, already Refunded
        vm.warp(block.timestamp + 30 days);
        vm.prank(bob);
        vm.expectRevert();
        escrow.sellerClaimFromAbandonedDispute(dealId);

        assertEq(usdc.balanceOf(alice), 1000e6); // full refund
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — Access Control
    // ──────────────────────────────────────────────

    function test_revert_nonBuyerConfirm() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(bob);
        vm.expectRevert(NastarEscrow.NotBuyer.selector);
        escrow.confirmDelivery(dealId);
    }

    function test_revert_nonSellerAccept() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.prank(alice);
        vm.expectRevert(NastarEscrow.NotSeller.selector);
        escrow.acceptDeal(dealId);
    }

    function test_doubleConfirm_reverts() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);
        _deliverDeal(dealId);

        vm.prank(alice);
        escrow.confirmDelivery(dealId);

        vm.prank(alice);
        vm.expectRevert();
        escrow.confirmDelivery(dealId);
    }

    function test_doubleRefund_reverts() public {
        uint256 serviceId = _createTestService();
        uint256 dealId = _createTestDeal(serviceId);

        vm.warp(block.timestamp + 8 days);

        vm.prank(alice);
        escrow.claimRefund(dealId);

        vm.prank(alice);
        vm.expectRevert();
        escrow.claimRefund(dealId);
    }

    // ──────────────────────────────────────────────
    // NastarEscrow — View Helpers
    // ──────────────────────────────────────────────

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
