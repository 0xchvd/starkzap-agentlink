# AgentLink — Security & Threat Model

This document describes what AgentLink **does and does not** protect against. Read it before putting real funds through a link.

## Threat model

**Trust assumptions:**

- The sender trusts the `AgentLinkEscrow` contract code (auditable, small, open-source).
- The sender does NOT trust the agent with full account authority — that's why they're using AgentLink.
- The agent is assumed to be able to sign messages with its session private key, but is assumed NOT to be able to modify arbitrary Starknet state outside the escrow's rules.
- The funding token (ERC20) is assumed to honor the standard `transfer`/`transfer_from`/`balance_of` semantics.

**Adversaries considered:**

1. A **compromised agent** whose session key has leaked to a third party.
2. A **malicious target contract** the agent is allowed to call.
3. A **malicious sender** trying to claw back funds after handing a link to an agent.
4. A **replay attacker** intercepting a signed spend message.
5. A **front-runner** reordering spend messages to cause caps to trip unfairly.

## What AgentLink prevents

### 1. Unlimited authority leak
If the session key is compromised, the attacker can spend **only up to `total_cap`**, **only to addresses in `allowed_destinations`**, **only via contracts in `allowed_contracts`**, **only via methods in `allowed_selectors`**, **only while `now <= valid_until`**. The blast radius is bounded by the sender's declared rules, not by the agent's wallet balance.

### 2. Replay
Every spend includes a nonce. The contract tracks `Map<(link_id, nonce), bool>` and rejects any repeat. Nonce is part of the signed message, so a signature cannot be reused.

### 3. Calldata tampering
The signed message hash covers the full calldata array. Any modification to calldata (changing the destination, changing the amount) invalidates the signature.

### 4. Spend over cap
`per_tx_cap` and `total_cap` are checked against the **decoded** amount in calldata, not against any untrusted field. For recognized ERC20 selectors (`transfer`, `approve`), the calldata is decoded as `(address, u256)` and the u256 is compared directly.

### 5. Sender revocation
`revoke()` is sender-only. It flips `revoked = true`, refunds `total_cap - spent` to the sender, and causes all future `spend()` to revert. The agent cannot prevent revocation.

### 6. Expiry
`valid_until` is checked on every spend. Once the timestamp passes, the link becomes inert. Sender can then revoke to recover the remainder.

## What AgentLink does NOT prevent

### 1. Destination within allowlist but still adversarial
If the sender allowlists an address that turns out to be controlled by the agent operator's adversary, the agent can send funds there. **The allowlist is only as good as the sender's vetting.** AgentLink enforces the list, it does not curate it.

### 2. Approved contract calling another contract
If the sender allowlists a contract that itself has arbitrary `call_contract_syscall` power and the selector allowlist permits a method that triggers such a call, the agent can indirectly reach contracts outside the allowlist. **Never allowlist routers or proxies you haven't audited.** Safe-to-allowlist contracts are those whose behavior on a given method is either pure (view-only) or whose side effects are fully bounded by the method's documented semantics.

### 3. Non-standard ERC20 calldata shapes
The amount/destination decoding assumes the standard `transfer(recipient, u256)` and `approve(spender, u256)` shapes. If a target token uses a non-standard calldata layout (rare but possible with exotic tokens), the decoding will misread. **Use AgentLink with standard, audited ERC20s only.**

### 4. Front-running to burn caps
An attacker who sees a legitimate spend in the mempool cannot replay it (nonce protection), but if the attacker has a valid signed message of their own (e.g. from leaking a different nonce), they can race to land it and consume the per-tx or total cap before the intended tx. **Mitigation:** use short time windows and low caps so a race doesn't drain anything meaningful.

### 5. Compromised sender wallet
If the sender's own wallet is compromised, the attacker can create malicious AgentLinks to drain the sender's balance. AgentLink protects the sender *from the agent*, not *from themselves*. Use a hardware wallet for the sender.

### 6. Target contract reentrancy
The escrow uses a checks-effects-interactions pattern: nonce is marked used and spent counter is updated **before** the external call. A reentrant target cannot double-spend a single nonce. However, a target can still re-enter with a **different** nonce on a different message, so the cap check protects total spend but not the call ordering. If the agent has multiple valid spend messages queued, a reentrant target could interleave them. **Don't allowlist targets with known reentrancy hazards.**

### 7. Signature bypass via Cairo VM bug
The escrow relies on Cairo's `core::ecdsa::check_ecdsa_signature` and `core::poseidon::poseidon_hash_span`. Any bug in those primitives affects every Starknet contract equally. AgentLink does not add a second line of defense against VM-level bugs.

### 8. Off-chain secret exposure
The session private key is a bearer credential. If the sender transmits it over an insecure channel (plain HTTP, unencrypted Slack, plaintext file) the attacker has everything the agent has. **The SDK does not implement key transport — that is the integrator's responsibility.** Recommended pattern: generate the keypair inside a secure enclave or the agent's own runtime and have the agent emit only its public key back to the sender.

## Audit notes

- The contract is ~350 LOC and intentionally small so it can be audited in one pass.
- Storage reads on the hot path are O(1) (`StorageMapReadAccess` is constant time).
- `call_contract_syscall` is the last statement of `spend()`, after all state updates — CEI compliant.
- `revoke()` is guarded by a strict `caller == sender` check, not by any claimable-by-anyone timeout.
- No upgradeability, no admin, no pauseability. Once deployed the contract is fixed. Migrating to a new version means deploying a new escrow address and moving active links by revoking old ones.

## Suggested sender hygiene

1. Keep `per_tx_cap` **as low as the agent actually needs per call.** If the agent does single LLM calls, make it the cost of one call, not ten.
2. Keep `valid_until` **short.** A day, a week — not a month. Shorter = smaller blast radius if something goes wrong.
3. Allowlist **only the exact contracts and selectors the agent needs.** Do not allowlist routers, AMMs, or anything that fans out to other contracts unless you have audited the target.
4. Allowlist **only the exact destinations the funds should ever reach.** If the agent needs to pay one API endpoint and tip one operator wallet, those are the only two allowed destinations.
5. Generate session keys in a way the sender never sees them (secure enclave, agent runtime). The sender should only handle the public key.
6. **Revoke as soon as the job is done.** The remainder refunds to the sender, so there is no reason to leave a link active longer than necessary.
