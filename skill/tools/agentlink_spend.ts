// MCP tool stub — agentlink_spend

import { spendFromAgentLink } from "../../sdk/src/spend.js";
import type { SpendResult, AgentLinkCredential } from "../../sdk/src/types.js";
import type { StarkzapWalletLike } from "../../sdk/src/create_link.js";

export interface AgentLinkSpendInput {
  credential: AgentLinkCredential;
  target: string;
  method: string;
  calldata: string[];
  wallet: StarkzapWalletLike;
}

export async function agentlinkSpend(
  input: AgentLinkSpendInput,
): Promise<SpendResult> {
  return spendFromAgentLink({
    credential: input.credential,
    wallet: input.wallet,
    target: input.target,
    method: input.method,
    calldata: input.calldata,
  });
}

export const schema = {
  name: "agentlink_spend",
  description:
    "Spend from an AgentLink. Signs a message hash with the session key and submits escrow.spend() — on-chain rules enforce contract/selector/destination allowlists, per-tx cap, total cap, expiry, and replay protection.",
  inputSchema: {
    type: "object",
    required: ["credential", "target", "method", "calldata"],
    properties: {
      credential: {
        type: "object",
        required: [
          "linkId",
          "sessionPrivkey",
          "sessionPubkey",
          "escrowAddress",
          "fundingToken",
        ],
        properties: {
          linkId: { type: "string" },
          sessionPrivkey: { type: "string" },
          sessionPubkey: { type: "string" },
          escrowAddress: { type: "string" },
          fundingToken: { type: "string" },
        },
      },
      target: { type: "string" },
      method: { type: "string" },
      calldata: { type: "array", items: { type: "string" } },
    },
  },
} as const;
