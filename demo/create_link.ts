// Demo — sender side.
//
// Usage:
//   bun run demo/create_link.ts
//
// Creates a 20 STRK AgentLink that lets an agent send up to 2 STRK/tx and
// 20 STRK total to AGENT_RECIPIENT_ADDRESS over the next 7 days. The agent
// is also allowed to call FUNDING_TOKEN_ADDRESS::transfer (so it can move
// the money it has been granted) and nothing else.
//
// Emits `demo/link.json` with the credential the agent needs.

import { writeFileSync } from "node:fs";
import { StarkZap } from "starkzap";
import {
  createAgentLink,
  daysFromNow,
  selectorFor,
  strk,
} from "../sdk/src/index.js";

function envOrDie(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function main() {
  const rpcUrl = envOrDie("STARKNET_RPC_URL");
  const senderAddress = envOrDie("SENDER_ADDRESS");
  const senderPrivkey = envOrDie("SENDER_PRIVKEY");
  const escrowAddress = envOrDie("AGENTLINK_ESCROW_ADDRESS");
  const fundingToken = envOrDie("FUNDING_TOKEN_ADDRESS");
  const agentRecipient = envOrDie("AGENT_RECIPIENT_ADDRESS");

  const sdk = new StarkZap({ rpcUrl });
  const wallet = await sdk.connectWallet({
    account: { signer: { address: senderAddress, privkey: senderPrivkey } },
  });

  console.log("=== AgentLink demo: create_link ===");
  console.log(`sender: ${senderAddress}`);
  console.log(`escrow: ${escrowAddress}`);
  console.log(`funding: 20 STRK -> agent allowed ${agentRecipient}`);

  const result = await createAgentLink({
    escrowAddress,
    wallet: wallet as any,
    rpc: sdk.rpc as any,
    rules: {
      fundingToken,
      totalCap: strk(20),
      perTxCap: strk(2),
      validUntil: daysFromNow(7),
      funding: strk(20),
      allowedContracts: [fundingToken],
      allowedSelectors: [
        { contract: fundingToken, selector: selectorFor("transfer") },
      ],
      allowedDestinations: [agentRecipient],
    },
  });

  console.log(`link_id: ${result.linkId.toString()}`);
  console.log(`tx: ${result.txHash}`);

  writeFileSync(
    "demo/link.json",
    JSON.stringify(
      {
        linkId: result.linkId.toString(),
        sessionPrivkey: "0x" + result.sessionPrivkey.toString(16),
        sessionPubkey: "0x" + result.sessionPubkey.toString(16),
        escrowAddress,
        fundingToken,
        createdAt: new Date().toISOString(),
        txHash: result.txHash,
      },
      null,
      2,
    ),
  );
  console.log("wrote demo/link.json (the session privkey is a bearer secret)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
