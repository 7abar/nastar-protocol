import { keccak256, toBytes } from "viem";

const errors = [
  "DeadlineTooShort()", "DeadlineTooLong()", "AmountTooSmall()",
  "ZeroAmount()", "NotAgentOwner()", "SelfDeal()", "TransferFailed()",
  "ReentrancyDetected()", "InvalidStatus(uint8,uint8)",
  "NotBuyer()", "NotSeller()", "DealExpiredError()",
];

const target = "c2f5625a";

for (const e of errors) {
  const h = keccak256(toBytes(e)).slice(2, 10);
  const match = h === target ? " *** MATCH ***" : "";
  console.log(`${e}: 0x${h}${match}`);
}
console.log("\nTarget: 0x" + target);
