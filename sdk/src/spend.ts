// Agent-side helper: spend from an AgentLink.
//
// Flow:
//   1. Build the target call's calldata.
//   2. Hash (link_id, target, selector, ...calldata, nonce) with poseidon —
//      must match contracts/src/agent_link_escrow.cairo::spend exactly.
//   3. Sign the hash with the session privkey.
//   4. Submit AgentLinkEscrow.spend(...) via Starkzap. Optionally sponsored.

import { CallData, num, stark } from "starknet";
import type { AgentLinkCredential, SpendResult } from "./types.js";
import type { StarkzapWalletLike } from "./create_link.js";
import { hashSpendMessage, selectorFor } from "./hash.js";
import { signMessageHash } from "./session_key.js";

export interface SpendOptions {
  credential: AgentLinkCredential;
  wallet: StarkzapWalletLike;
  target: string;
  /** Either a method name ("transfer") or a pre-computed selector felt. */
  method: string;
  calldata: string[];
  /** Optional explicit nonce. If omitted, a random felt is used. */
  nonce?: string;
  /** Use AVNU-sponsored gas. Defaults to true for agent flow. */
  sponsored?: boolean;
}

/** Submit a scoped spend from an AgentLink on behalf of the agent. */
export async function spendFromAgentLink(opts: SpendOptions): Promise<SpendResult> {
  const { credential, wallet, target, method, calldata, sponsored = true } = opts;

  // Resolve selector: accept either a name like "transfer" or a hex felt.
  const selector = method.startsWith("0x") ? method : selectorFor(method);

  // Random nonce if none provided. Felt-range random.
  const nonce = opts.nonce ?? stark.randomAddress();

  // 1. Hash.
  const msgHash = hashSpendMessage({
    linkId: credential.linkId,
    target,
    selector,
    calldata,
    nonce,
  });

  // 2. Sign with the session key.
  const sig = signMessageHash(credential.sessionPrivkey, msgHash);

  // 3. Build spend() calldata for the escrow.
  const escrowCalldata = CallData.compile({
    link_id: credential.linkId.toString(),
    target,
    selector,
    calldata,
    nonce,
    sig_r: sig.r,
    sig_s: sig.s,
  });

  // 4. Execute.
  const tx = await wallet.execute(
    [
      {
        contractAddress: credential.escrowAddress,
        entrypoint: "spend",
        calldata: escrowCalldata,
      },
    ],
    sponsored ? { feeMode: "sponsored" } : undefined,
  );

  return {
    txHash: tx.transaction_hash,
    nonce,
    target,
    selector,
  };
}

/** Convenience: encode an ERC20 transfer call's calldata. */
export function encodeTransferCalldata(recipient: string, amount: bigint): string[] {
  // Cairo u256 splits into (low: u128, high: u128).
  const mask = (1n << 128n) - 1n;
  const lo = amount & mask;
  const hi = amount >> 128n;
  return [num.toHex(recipient), num.toHex(lo), num.toHex(hi)];
}
