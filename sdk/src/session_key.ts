// Stark-curve session keypair generation and signing.
// Uses starknet.js primitives so we stay on the same curve the escrow
// contract verifies with `check_ecdsa_signature`.

import { ec, num, stark } from "starknet";

export interface SessionKeypair {
  privkey: bigint;
  pubkey: bigint;
}

/** Generate a fresh Stark-curve session keypair. */
export function generateSessionKeypair(): SessionKeypair {
  const privHex = stark.randomAddress();
  const privkey = num.toBigInt(privHex);
  const pubkey = num.toBigInt(ec.starkCurve.getStarkKey(privHex));
  return { privkey, pubkey };
}

/** Sign a felt-encoded message hash with the session privkey. */
export function signMessageHash(
  privkey: bigint,
  msgHash: string,
): { r: string; s: string } {
  const privHex = num.toHex(privkey);
  const sig = ec.starkCurve.sign(msgHash, privHex);
  return {
    r: num.toHex(sig.r),
    s: num.toHex(sig.s),
  };
}

/** Derive the public key from a private key. */
export function pubkeyFromPrivkey(privkey: bigint): bigint {
  return num.toBigInt(ec.starkCurve.getStarkKey(num.toHex(privkey)));
}
