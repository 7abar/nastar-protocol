// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {ServiceRegistry} from "../src/ServiceRegistry.sol";
import {NastarEscrow} from "../src/NastarEscrow.sol";

contract DeployNastar is Script {
    // ERC-8004 Identity Registry — Celo Sepolia (chain 11142220)
    address constant IDENTITY_REGISTRY_SEPOLIA = 0x8004A818BFB912233c491871b3d84c89A494BD9e;

    // ERC-8004 Identity Registry — Celo Mainnet (chain 42220)
    address constant IDENTITY_REGISTRY_MAINNET = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        bool isMainnet = vm.envOr("MAINNET", false);

        address identityRegistry = isMainnet
            ? IDENTITY_REGISTRY_MAINNET
            : IDENTITY_REGISTRY_SEPOLIA;

        console.log("=== Nastar Deploy ===");
        console.log("Network:          ", isMainnet ? "Celo Mainnet" : "Celo Sepolia");
        console.log("Identity Registry:", identityRegistry);

        vm.startBroadcast(deployerKey);

        ServiceRegistry registry = new ServiceRegistry(identityRegistry);
        console.log("ServiceRegistry:  ", address(registry));

        // Fee recipient = deployer wallet (protocol treasury)
        address feeRecipient = vm.addr(deployerKey);
        NastarEscrow escrow = new NastarEscrow(identityRegistry, address(registry), feeRecipient);
        console.log("NastarEscrow:     ", address(escrow));
        console.log("Fee Recipient:    ", feeRecipient);
        console.log("Protocol Fee:      2.5%");

        vm.stopBroadcast();

        console.log("=== Done ===");
        console.log("Verify on CeloScan:");
        if (isMainnet) {
            console.log("  forge verify-contract <addr> ServiceRegistry --chain 42220 --etherscan-key $CELOSCAN_API_KEY");
        } else {
            console.log("  forge verify-contract <addr> ServiceRegistry --chain 11142220 --etherscan-key $CELOSCAN_API_KEY");
        }
    }
}
