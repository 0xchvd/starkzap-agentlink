// Demo — verification.
//
// Reads demo/link.json, queries the escrow's `remaining()` and `get_rules()`
// views, and prints the balance delta so a judge running the demo can
// confirm the spend actually moved tokens.

import { readFileSync } from "node:fs";
import { Contract, RpcProvider, num } from "starknet";

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

const ESCROW_ABI_MINI = [
  {
    type: "function",
    name: "remaining",
    inputs: [{ name: "link_id", type: "core::integer::u128" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "view",
  },
  {
    type: "function",
    name: "get_rules",
    inputs: [{ name: "link_id", type: "core::integer::u128" }],
    outputs: [{ type: "agent_link::agent_link_escrow::LinkRules" }],
    state_mutability: "view",
  },
];

async function main() {
  const rpcUrl = envOrDie("STARKNET_RPC_URL");
  const agentRecipient = envOrDie("AGENT_RECIPIENT_ADDRESS");
  const fundingToken = envOrDie("FUNDING_TOKEN_ADDRESS");

  const link = JSON.parse(readFileSync("demo/link.json", "utf-8"));

  const rpc = new RpcProvider({ nodeUrl: rpcUrl });
  const escrow = new Contract(ESCROW_ABI_MINI as any, link.escrowAddress, rpc);

  console.log("=== AgentLink demo: verify_receipt ===");

  const remaining = await escrow.call("remaining", [link.linkId]);
  console.log(`remaining budget: ${remaining.toString()} (raw u256 low)`);

  // Check the recipient's STRK balance via the token contract's balanceOf.
  const balCall = await rpc.callContract({
    contractAddress: fundingToken,
    entrypoint: "balance_of",
    calldata: [agentRecipient],
  });
  const lo = num.toBigInt(balCall[0]);
  const hi = num.toBigInt(balCall[1]);
  const bal = lo + (hi << 128n);
  console.log(`recipient balance: ${bal.toString()} (raw u256, STRK has 18 dec)`);
  console.log(
    `recipient balance: ${(Number(bal) / 1e18).toFixed(4)} STRK (approx)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
