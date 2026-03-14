import { createPublicClient, http, parseAbi } from 'viem';

const IDENTITY = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;
const RPC = 'https://forno.celo-sepolia.celo-testnet.org';
const pub = createPublicClient({ transport: http(RPC) });

async function main() {
  const abi = parseAbi(['function ownerOf(uint256) view returns (address)']);
  
  for (const id of [40n, 44n, 45n]) {
    try {
      const owner = await pub.readContract({ address: IDENTITY, abi, functionName: 'ownerOf', args: [id] });
      console.log(`Token #${id}: ${owner}`);
    } catch (e) {
      console.log(`Token #${id}: ERROR - ${(e as Error).message?.slice(0, 80)}`);
    }
  }
}
main();
