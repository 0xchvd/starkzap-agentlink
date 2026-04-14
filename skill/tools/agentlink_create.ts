// MCP tool stub — agentlink_create
//
// Thin wrapper around @agentlink/sdk's createAgentLink. The actual MCP
// glue (registering a server, exposing the tool schema) lives in the host
// that imports this skill. This file is intentionally transport-agnostic.

import { createAgentLink } from "../../sdk/src/create_link.js";
import type {
  AgentLinkRulesInput,
  CreateLinkResult,
} from "../../sdk/src/types.js";
import type {
  StarkzapWalletLike,
  RpcLike,
} from "../../sdk/src/create_link.js";

export interface AgentLinkCreateInput {
  escrowAddress: string;
  rules: AgentLinkRulesInput;
  wallet: StarkzapWalletLike;
  rpc: RpcLike;
}

export async function agentlinkCreate(
  input: AgentLinkCreateInput,
): Promise<CreateLinkResult> {
  return createAgentLink({
    escrowAddress: input.escrowAddress,
    wallet: input.wallet,
    rpc: input.rpc,
    rules: input.rules,
  });
}

export const schema = {
  name: "agentlink_create",
  description:
    "Create a scoped-spend grant (AgentLink) on Starknet. Sender locks funds and declares allowed contracts, selectors, destinations, per-tx cap, total cap, and expiry. Returns a session keypair the agent signs with.",
  inputSchema: {
    type: "object",
    required: ["escrowAddress", "rules"],
    properties: {
      escrowAddress: { type: "string", description: "Deployed AgentLinkEscrow" },
      rules: {
        type: "object",
        required: [
          "fundingToken",
          "totalCap",
          "perTxCap",
          "validUntil",
          "allowedContracts",
          "allowedSelectors",
          "allowedDestinations",
          "funding",
        ],
        properties: {
          fundingToken: { type: "string" },
          totalCap: { type: "string", description: "u256 as decimal string" },
          perTxCap: { type: "string" },
          validUntil: { type: "number", description: "unix seconds" },
          allowedContracts: { type: "array", items: { type: "string" } },
          allowedSelectors: {
            type: "array",
            items: {
              type: "object",
              required: ["contract", "selector"],
              properties: {
                contract: { type: "string" },
                selector: { type: "string" },
              },
            },
          },
          allowedDestinations: { type: "array", items: { type: "string" } },
          funding: { type: "string" },
        },
      },
    },
  },
} as const;
