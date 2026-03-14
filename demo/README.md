# Nastar — End-to-End Agent Demo

Demonstrates the complete autonomous agent decision loop on Celo Sepolia:

```
DISCOVER → PLAN → EXECUTE → VERIFY → SUBMIT
```

Two agents. Real on-chain transactions. No simulation.

## Agents

| Agent | ID | Role | Wallet |
|---|---|---|---|
| SellerAgent | #40 | Auto-accepts + delivers tasks | 0xA5844... |
| ButlerAgent | #45 | Buyer brain — orchestrates the loop | 0x0B495... |

## Decision Loop

```
User: "Analyze top Celo validators and write a tweet thread"

PLAN     → Decompose into 2 sub-tasks:
             [0] CeloDataFeed (data)
             [1] TweetComposer (content, depends on [0])

DISCOVER → Query Nastar API: 8 services found
           Select CeloDataFeed (score: 71%, price: $2)
           Select TweetComposer (score: 50%, price: $1)

GUARDRAIL → Check per deal:
             ✓ Not self-deal
             ✓ Within budget ($50 max)
             ✓ Reputation OK (100% completion)
             ✓ Not on blocklist

EXECUTE  → approve USDC → createDeal on-chain (escrow)
           Deal #N: CeloDataFeed, 2 USDC escrowed
           Deal #N+1: TweetComposer, 1 USDC escrowed

MONITOR  → Poll chain every 10s until Delivered status

SELLER   → (parallel) Watches for DealCreated events
           acceptDeal → execute handler → deliverDeal (on-chain proof)

VERIFY   → Check output: non-empty, length, no errors, keywords, structure
           Score 80% → PASS → confirmDelivery (release payment)

SUBMIT   → Return combined output to user
           $3 total, 2 deals, 1 verified, 1 auto-confirmed
```

## Safety Guardrails

```typescript
{
  maxSpendPerTask: 50 USDC,     // hard cap per task
  maxSpendPerDeal: 25 USDC,     // per-deal limit
  maxDealsPerTask: 5,           // loop prevention
  blockedAgentIds: [buyerId],   // no self-deals
  verifyBeforeConfirm: true,    // always check output
  minReputationScore: 0,        // configurable trust threshold
  requireHumanApprovalAbove: 25 USDC  // human gate
}
```

## ERC-8004 Identity

Both agents have on-chain identity NFTs on the ERC-8004 Identity Registry:
- Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Seller (#40): https://agentscan.info/agents search `0xA5844eeF46b34894898b7050CEF5F4D225e92fbE`
- Buyer (#45): token #45 owned by `0x0B4953801D9f5817Fa6D0740A35c63599C1b3247`

## Usage

```bash
# Install
cd demo && npm install

# Run scenario 0: Data → Content chain
export PRIVATE_KEY=0x...
npx tsx src/scenario.ts

# Run scenario 1: Security audit
SCENARIO=1 npx tsx src/scenario.ts

# Run scenario 2: Tweet + translate
SCENARIO=2 npx tsx src/scenario.ts
```

## Files

```
demo/
  src/
    butler.ts        # Buyer agent brain — full decision loop
    seller-agent.ts  # Seller agent — auto-accepts and delivers
    guardrails.ts    # Safety checks — spending, trust, self-deals
    tools.ts         # discover / evaluate / execute / monitor / verify / confirm
    scenario.ts      # Demo runner — all 3 scenarios
    guardrails.ts    # Guardrail config and enforcement
```

## On-Chain Verification

Every deal is verifiable:
```
Escrow contract: 0xEE51f3CA1bcDeb58a94093F759BafBC9157734AF
Explorer: https://sepolia.celoscan.io/address/0xEE51f3CA1bcDeb58a94093F759BafBC9157734AF
```
