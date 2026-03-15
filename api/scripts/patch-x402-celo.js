#!/usr/bin/env node
/**
 * Patch x402 to support Celo network.
 * Celo is standard EVM — same USDC permit flow works.
 * Run as postinstall: "postinstall": "node scripts/patch-x402-celo.js"
 */

const fs = require("fs");
const path = require("path");

const X402_DIR = path.join(__dirname, "..", "node_modules", "x402", "dist");

// Patches to apply
const patches = [
  {
    // Add "celo" to SupportedEVMNetworks
    pattern: /var SupportedEVMNetworks = \[/g,
    replacement: 'var SupportedEVMNetworks = [\n  "celo",\n  "celo-alfajores",',
    desc: "Add Celo to SupportedEVMNetworks",
  },
  {
    // Add Celo chain IDs to EvmNetworkToChainId
    pattern: /\["base-sepolia", 84532\]/g,
    replacement: '["celo", 42220],\n  ["celo-alfajores", 44787],\n  ["base-sepolia", 84532]',
    desc: "Add Celo chain IDs",
  },
  {
    // Add USDC config for Celo chains
    pattern: /"8453": \{/g,
    replacement: `"42220": {\n    usdcAddress: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",\n    usdcName: "USDC"\n  },\n  "44787": {\n    usdcAddress: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",\n    usdcName: "USDC"\n  },\n  "8453": {`,
    desc: "Add Celo USDC token config",
  },
];

let filesPatched = 0;

function patchDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir, { recursive: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.toString());
    if (!fs.statSync(fullPath).isFile()) continue;
    if (!fullPath.endsWith(".mjs") && !fullPath.endsWith(".js")) continue;

    let content = fs.readFileSync(fullPath, "utf8");
    let modified = false;

    for (const patch of patches) {
      if (patch.pattern.test(content)) {
        // Reset regex lastIndex
        patch.pattern.lastIndex = 0;
        // Check if already patched
        if (content.includes('"celo"') && patch.desc.includes("SupportedEVMNetworks")) continue;
        if (content.includes('"42220"') && patch.desc.includes("chain IDs")) continue;
        if (content.includes("0xcebA9300") && patch.desc.includes("USDC")) continue;

        content = content.replace(patch.pattern, patch.replacement);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(fullPath, content);
      filesPatched++;
    }
  }
}

patchDir(path.join(X402_DIR, "esm"));
patchDir(path.join(X402_DIR, "cjs"));

if (filesPatched > 0) {
  console.log(`[x402-celo-patch] Patched ${filesPatched} files — Celo network support added`);
} else {
  console.log("[x402-celo-patch] Already patched or no files found");
}
