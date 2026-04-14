// AgentLink SDK — public types

export interface AgentLinkRulesInput {
  /** Addresses the agent is allowed to call. Everything else reverts. */
  allowedContracts: string[];
  /** (contract, selector) pairs the agent is allowed to invoke. */
  allowedSelectors: Array<{ contract: string; selector: string }>;
  /** Addresses that may receive funds (for transfer/approve destinations). */
  allowedDestinations: string[];
  /** ERC20 token the link is funded in (e.g. STRK). */
  fundingToken: string;
  /** Total pool the agent may spend over the lifetime of the link. */
  totalCap: bigint;
  /** Per-transaction cap. Must be <= totalCap. */
  perTxCap: bigint;
  /** Unix seconds after which spend() reverts. */
  validUntil: number;
  /** Amount of fundingToken to pull from sender into escrow. >= totalCap. */
  funding: bigint;
}

export interface AgentLinkCredential {
  /** On-chain link id. */
  linkId: bigint;
  /** Session private key the agent signs with. Treat as a bearer secret. */
  sessionPrivkey: bigint;
  /** Session public key (Stark curve). */
  sessionPubkey: bigint;
  /** Deployed escrow contract address. */
  escrowAddress: string;
  /** Funding token the link carries. */
  fundingToken: string;
}

export interface CreateLinkResult {
  linkId: bigint;
  sessionPrivkey: bigint;
  sessionPubkey: bigint;
  txHash: string;
  credential: AgentLinkCredential;
}

export interface SpendResult {
  txHash: string;
  nonce: string;
  target: string;
  selector: string;
}
