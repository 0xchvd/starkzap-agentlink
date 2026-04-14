// MCP tool stub — agentlink_status

import { Contract, RpcProvider } from "starknet";

export interface AgentLinkStatusInput {
  escrowAddress: string;
  linkId: string;
  rpcUrl: string;
}

export interface AgentLinkStatusOutput {
  linkId: string;
  totalCap: string;
  perTxCap: string;
  spent: string;
  remaining: string;
  validUntil: number;
  revoked: boolean;
  fundingToken: string;
}

const ABI_MINI = [
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

export async function agentlinkStatus(
  input: AgentLinkStatusInput,
): Promise<AgentLinkStatusOutput> {
  const rpc = new RpcProvider({ nodeUrl: input.rpcUrl });
  const c = new Contract(ABI_MINI as any, input.escrowAddress, rpc);
  const rules: any = await c.call("get_rules", [input.linkId]);
  const remaining: any = await c.call("remaining", [input.linkId]);

  const totalCap = BigInt(rules.total_cap?.toString?.() ?? rules.total_cap);
  const remainingBig = BigInt(remaining?.toString?.() ?? remaining);
  const spent = totalCap - remainingBig;

  return {
    linkId: input.linkId,
    totalCap: totalCap.toString(),
    perTxCap: BigInt(
      rules.per_tx_cap?.toString?.() ?? rules.per_tx_cap,
    ).toString(),
    spent: spent.toString(),
    remaining: remainingBig.toString(),
    validUntil: Number(rules.valid_until),
    revoked: Boolean(rules.revoked),
    fundingToken: rules.funding_token?.toString?.() ?? rules.funding_token,
  };
}

export const schema = {
  name: "agentlink_status",
  description:
    "Query an AgentLink's rules, remaining budget, spent amount, revoked flag, and expiry. Read-only.",
  inputSchema: {
    type: "object",
    required: ["escrowAddress", "linkId", "rpcUrl"],
    properties: {
      escrowAddress: { type: "string" },
      linkId: { type: "string" },
      rpcUrl: { type: "string" },
    },
  },
} as const;
