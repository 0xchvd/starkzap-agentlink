// Sender-side helper: create an AgentLink.
//
// Flow:
//   1. Generate a session keypair client-side. The privkey is the credential
//      the agent will sign with; we hand it to the agent and never store it.
//   2. Batch two calls atomically via Starkzap's wallet.execute:
//        a. ERC20.approve(escrow, funding) — allows pull
//        b. AgentLinkEscrow.create_link(...)
//   3. Parse the LinkCreated event from the receipt to recover the link_id.

import { CallData, cairo, hash, num, uint256 } from "starknet";
import type { AgentLinkCredential, AgentLinkRulesInput, CreateLinkResult } from "./types.js";
import { generateSessionKeypair } from "./session_key.js";

/** Minimal Starkzap wallet surface we depend on. */
export interface StarkzapWalletLike {
  address: string;
  execute(
    calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>,
    opts?: { feeMode?: "sponsored" | "default" },
  ): Promise<{ transaction_hash: string; wait?: () => Promise<unknown> }>;
}

/** Minimal RPC surface for event fetch. */
export interface RpcLike {
  waitForTransaction(txHash: string): Promise<{
    events: Array<{ from_address: string; keys: string[]; data: string[] }>;
  }>;
}

export interface CreateLinkOptions {
  escrowAddress: string;
  wallet: StarkzapWalletLike;
  rpc: RpcLike;
  rules: AgentLinkRulesInput;
  /** Use AVNU-sponsored gas. Defaults to true for the sender flow. */
  sponsored?: boolean;
}

/**
 * Create an AgentLink. Returns the freshly-minted link id, the session
 * keypair (private key is a bearer secret), and the full credential the
 * agent needs to call spend().
 */
export async function createAgentLink(
  opts: CreateLinkOptions,
): Promise<CreateLinkResult> {
  const { escrowAddress, wallet, rpc, rules, sponsored = true } = opts;

  // 1. Session keypair for the agent.
  const kp = generateSessionKeypair();

  // 2. Build calldata for create_link. Order matches the Cairo ABI:
  //   session_pubkey, funding_token, total_cap, per_tx_cap, valid_until,
  //   allowed_contracts, allowed_selectors, allowed_destinations, funding
  const createCalldata = CallData.compile({
    session_pubkey: num.toHex(kp.pubkey),
    funding_token: rules.fundingToken,
    total_cap: cairo.uint256(rules.totalCap),
    per_tx_cap: cairo.uint256(rules.perTxCap),
    valid_until: rules.validUntil,
    allowed_contracts: rules.allowedContracts,
    allowed_selectors: rules.allowedSelectors.map((s) => ({
      contract: s.contract,
      selector: s.selector,
    })),
    allowed_destinations: rules.allowedDestinations,
    funding: cairo.uint256(rules.funding),
  });

  // 3. ERC20 approve for the escrow to pull funding.
  const approveCalldata = CallData.compile({
    spender: escrowAddress,
    amount: cairo.uint256(rules.funding),
  });

  const tx = await wallet.execute(
    [
      {
        contractAddress: rules.fundingToken,
        entrypoint: "approve",
        calldata: approveCalldata,
      },
      {
        contractAddress: escrowAddress,
        entrypoint: "create_link",
        calldata: createCalldata,
      },
    ],
    sponsored ? { feeMode: "sponsored" } : undefined,
  );

  // 4. Parse LinkCreated event for the link id.
  const receipt = await rpc.waitForTransaction(tx.transaction_hash);
  const linkCreatedKey = num.toHex(hash.getSelectorFromName("LinkCreated"));
  const ev = receipt.events.find(
    (e) =>
      num.toBigInt(e.from_address) === num.toBigInt(escrowAddress) &&
      e.keys[0] != null &&
      num.toBigInt(e.keys[0]) === num.toBigInt(linkCreatedKey),
  );
  if (!ev) {
    throw new Error("LinkCreated event not found on receipt");
  }
  // Event shape: keys=[sel, link_id, sender], data=[session_pubkey, funding_lo, funding_hi, valid_until]
  const linkId = num.toBigInt(ev.keys[1]);

  const credential: AgentLinkCredential = {
    linkId,
    sessionPrivkey: kp.privkey,
    sessionPubkey: kp.pubkey,
    escrowAddress,
    fundingToken: rules.fundingToken,
  };

  return {
    linkId,
    sessionPrivkey: kp.privkey,
    sessionPubkey: kp.pubkey,
    txHash: tx.transaction_hash,
    credential,
  };
}

/** Helper: current block time + N days. */
export function daysFromNow(n: number): number {
  return Math.floor(Date.now() / 1000) + n * 86_400;
}

/** Helper: STRK uses 18 decimals. */
export function strk(amount: number | bigint): bigint {
  if (typeof amount === "bigint") return amount * 10n ** 18n;
  const [whole, frac = ""] = String(amount).split(".");
  const fracPadded = (frac + "0".repeat(18)).slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(fracPadded || "0");
}

// silence unused-import false positives in strict mode
void uint256;
