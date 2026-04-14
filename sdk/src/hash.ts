// Message hash construction. Must match the on-chain poseidon_hash_span
// over [link_id, target, selector, ...calldata, nonce] exactly.

import { hash, num } from "starknet";

export interface SpendMessage {
  linkId: bigint;
  target: string;
  selector: string; // pre-computed selector felt (hex)
  calldata: string[]; // array of felt-encoded strings
  nonce: string; // felt-encoded string
}

/**
 * Compute the poseidon hash of a spend message in the exact same order
 * the escrow contract computes it:
 *   poseidon(link_id, target, selector, ...calldata, nonce)
 */
export function hashSpendMessage(msg: SpendMessage): string {
  const felts: bigint[] = [];
  felts.push(msg.linkId);
  felts.push(num.toBigInt(msg.target));
  felts.push(num.toBigInt(msg.selector));
  for (const c of msg.calldata) {
    felts.push(num.toBigInt(c));
  }
  felts.push(num.toBigInt(msg.nonce));
  return num.toHex(hash.computePoseidonHashOnElements(felts));
}

/** Selector for a method name, matching starknet::selector!(). */
export function selectorFor(method: string): string {
  return num.toHex(hash.getSelectorFromName(method));
}
