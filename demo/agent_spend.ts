// Demo — agent side.
//
// Usage:
//   bun run demo/agent_spend.ts
//
// Reads demo/link.json, signs with the session privkey, and invokes
// escrow.spend() to transfer 1 STRK from the escrow to AGENT_RECIPIENT_ADDRESS
// via the approved STRK transfer selector.
//
// Note: the agent's OWN wallet address is used only to relay the tx.
// The escrow only cares about the session key signature, not the caller.
// In sponsored mode the agent pays no gas.

import { readFileSync } from "node:fs";
import { StarkZap } from "starkzap";
import {
  encodeTransferCalldata,
  spendFromAgentLink,
  strk,
} from "../sdk/src/index.js";

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function main() {
  const rpcUrl = envOrDie("STARKNET_RPC_URL");
  const agentRecipient = envOrDie("AGENT_RECIPIENT_ADDRESS");
  // The agent also needs some kind of Starknet account to relay from.
  // In production the agent might use a burner wallet or a Cartridge
  // controller session. For the demo we reuse SENDER_PRIVKEY so the
  // script is self-contained.
  const agentAddress = envOrDie("SENDER_ADDRESS");
  const agentPrivkey = envOrDie("SENDER_PRIVKEY");

  const link = JSON.parse(readFileSync("demo/link.json", "utf-8"));

  const sdk = new StarkZap({ rpcUrl });
  const wallet = await sdk.connectWallet({
    account: { signer: { address: agentAddress, privkey: agentPrivkey } },
  });

  console.log("=== AgentLink demo: agent_spend ===");
  console.log(`link_id: ${link.linkId}`);
  console.log(`target: ${link.fundingToken} (STRK transfer)`);
  console.log(`recipient: ${agentRecipient}`);
  console.log(`amount: 1 STRK`);

  const result = await spendFromAgentLink({
    credential: {
      linkId: BigInt(link.linkId),
      sessionPrivkey: BigInt(link.sessionPrivkey),
      sessionPubkey: BigInt(link.sessionPubkey),
      escrowAddress: link.escrowAddress,
      fundingToken: link.fundingToken,
    },
    wallet: wallet as any,
    target: link.fundingToken,
    method: "transfer",
    calldata: encodeTransferCalldata(agentRecipient, strk(1)),
  });

  console.log(`spend tx: ${result.txHash}`);
  console.log(`nonce: ${result.nonce}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
