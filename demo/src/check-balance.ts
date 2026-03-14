import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const MOCK_USDC = '0x93C86be298bcF530E183954766f103B061BF64Ef' as const;
const RPC = 'https://forno.celo-sepolia.celo-testnet.org';

const sellerPk = process.env.PRIVATE_KEY as `0x${string}`;
const buyerPk = keccak256(toBytes(sellerPk + 'nastar-demo-buyer')) as `0x${string}`;

const sellerAcct = privateKeyToAccount(sellerPk);
const buyerAcct = privateKeyToAccount(buyerPk);

const pub = createPublicClient({ transport: http(RPC) });

async function main() {
  const abi = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function mint(address, uint256)',
    'function transfer(address, uint256) returns (bool)',
  ]);

  const sellerBal = await pub.readContract({ address: MOCK_USDC, abi, functionName: 'balanceOf', args: [sellerAcct.address] });
  const buyerBal = await pub.readContract({ address: MOCK_USDC, abi, functionName: 'balanceOf', args: [buyerAcct.address] });

  console.log(`Seller (${sellerAcct.address}): ${sellerBal} MockUSDC`);
  console.log(`Buyer  (${buyerAcct.address}): ${buyerBal} MockUSDC`);

  if (buyerBal < 100n) {
    console.log('\nBuyer needs tokens. Transferring 1000 from seller...');
    const chain = {
      id: 11142220, name: 'Celo Sepolia', network: 'celo-sepolia',
      nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
      rpcUrls: { default: { http: [RPC] }, public: { http: [RPC] } },
      testnet: true,
    } as const;
    // @ts-ignore
    const wallet = createWalletClient({ account: sellerAcct, chain, transport: http(RPC) });
    const hash = await wallet.writeContract({
      address: MOCK_USDC, abi,
      functionName: 'transfer',
      args: [buyerAcct.address, 1000n],
      account: sellerAcct,
    });
    console.log(`Transfer TX: ${hash}`);
    await pub.waitForTransactionReceipt({ hash });
    const newBal = await pub.readContract({ address: MOCK_USDC, abi, functionName: 'balanceOf', args: [buyerAcct.address] });
    console.log(`Buyer new balance: ${newBal} MockUSDC`);
  }
}

main().catch(console.error);
