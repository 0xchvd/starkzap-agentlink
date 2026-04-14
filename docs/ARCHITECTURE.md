# AgentLink — Architecture

## The two-layer design

AgentLink is split into a thin on-chain primitive and a TypeScript SDK that integrates it into any Starkzap-powered app.

```
┌────────────────────────────────────────────────────┐
│          AgentLink SDK (@agentlink/sdk)            │
│   createAgentLink()        spendFromAgentLink()    │
│          │                         │                │
│          ▼                         ▼                │
│   Starkzap wallet.execute([...], { sponsored })    │
│          │                         │                │
└──────────┼─────────────────────────┼────────────────┘
           │                         │
           ▼                         ▼
┌────────────────────────────────────────────────────┐
│        AgentLinkEscrow contract (Cairo 2.x)        │
│  • Storage: LinkRules + allowlists + spent counters│
│  • create_link: pulls funding, emits event         │
│  • spend: ECDSA verify → rule checks → syscall    │
│  • revoke: sender only, refunds remainder          │
└────────────────────────────────────────────────────┘
```

## On-chain: `AgentLinkEscrow`

### Storage

```
next_link_id: u128
links: Map<u128, LinkRules>
spent: Map<u128, u256>
nonces: Map<(u128, felt252), bool>
allowed_contract: Map<(u128, ContractAddress), bool>
allowed_selector: Map<(u128, ContractAddress, felt252), bool>
allowed_destination: Map<(u128, ContractAddress), bool>
```

`LinkRules` carries the sender, session pubkey, funding token, caps, and expiry. Allowlists are flattened into separate maps so each rule check is a single `StorageMapReadAccess::read` — constant time, no iteration.

### `create_link`

1. Validate caps and expiry (assert guards).
2. Assign `link_id = next_link_id++`.
3. Write `LinkRules`, zero spent, flatten each allowlist into its map.
4. Pull `funding` from sender via `transfer_from`. This requires the sender to approve the escrow first — the SDK batches the approve into the same atomic call via `wallet.execute([approve, create_link])`.
5. Emit `LinkCreated { link_id, sender, session_pubkey, funding, valid_until }`.

### `spend` — the hot path

Checks run in fail-fast order:

1. Load rules. Fail if `session_pubkey == 0` (unknown link), `revoked`, or expired.
2. Check nonce not used.
3. Build message hash: `poseidon_hash_span([link_id, target, selector, ...calldata, nonce])`. This is why the SDK's `hashSpendMessage` must compute the identical hash client-side.
4. Verify signature: `check_ecdsa_signature(msg_hash, session_pubkey, sig_r, sig_s)`. Stark-curve ECDSA, same curve Starknet accounts use.
5. Check `target` in contract allowlist.
6. Check `(target, selector)` in selector allowlist.
7. **If selector is `transfer` or `approve`**: decode `calldata[0]` as destination, check allowlist. Decode `calldata[1..3]` as u256 amount, check against `per_tx_cap`, and check `spent + amount <= total_cap`. Update `spent`.
8. Mark nonce used (checks-effects-interactions: nonce write before external call).
9. Execute the call via `call_contract_syscall(target, selector, calldata.span())`. The escrow is `msg.sender` for the forwarded call, so the escrow's own token approvals and balances are what the target sees.
10. Emit `SpendExecuted`.

### `revoke`

Sender-only. Flips `revoked = true` and refunds the remainder (`total_cap - spent`) of the funding token back to the sender. After revoke, any future `spend()` reverts with `REVOKED`.

## Off-chain: TypeScript SDK

### `createAgentLink(opts)`

1. Generate a Stark-curve session keypair client-side via `ec.starkCurve.getStarkKey`.
2. Compile calldata for `approve(escrow, funding)` and `create_link(...)`.
3. `wallet.execute([approve, createLink], { feeMode: "sponsored" })` — Starkzap batches both into one tx, AVNU sponsors gas, user sees a single wallet prompt.
4. Wait for receipt, parse the `LinkCreated` event, extract `link_id`.
5. Return `{ linkId, sessionPrivkey, sessionPubkey, credential }`. The privkey is a bearer secret — return it once, never persist it.

### `spendFromAgentLink(opts)`

1. Resolve method name to selector (`hash.getSelectorFromName`).
2. Generate a random nonce (felt-range).
3. Compute message hash with **exactly the same field order** the contract uses. This is the subtle bit — any mismatch and signature verification fails.
4. Sign with the session privkey: `ec.starkCurve.sign(msgHash, privHex)`.
5. Call `wallet.execute([spendCall], { feeMode: "sponsored" })` — the agent's relayer wallet pays no gas.

The agent's relayer wallet needs to exist on Starknet to submit transactions at all, but it does not need funds — AVNU handles gas — and it does not have authority over the escrow. The only thing that gives authority is the session signature.

## How this composes with Starknet primitives

| Primitive | What it gives you | What AgentLink adds |
|---|---|---|
| **Starknet account abstraction** | Custom signers, batch transactions | Escrow contract that enforces rules across those batches |
| **Cartridge policies** | `(contract, method)` allowlists scoped to a session | Per-tx caps, total caps, destination allowlists, escrowed funds, multi-grant isolation |
| **AVNU paymaster** | Gasless UX for whitelisted tokens | Sender pays zero gas for create_link; agent pays zero gas for spend |
| **SNIP-9 OutsideExecution** | Meta-tx envelope for delegated execution | V2 upgrade path: wrap spend() in a SNIP-9 envelope so any relayer can submit |
| **Poseidon hashing** | Cheap, Starknet-native hash | Matches on-chain `poseidon_hash_span` for exact signature compatibility |

## Upgrade paths

**V2 — SNIP-9 OutsideExecution envelope**
Wrap the `spend` message in a SNIP-9 OutsideExecution signed-meta-tx, so the agent never needs to hold any Starknet account at all — any relayer (including the escrow's own sender) can submit. This is the same pattern Cartridge Controller uses internally.

**V2 — Multi-token pool**
Let one AgentLink hold multiple funding tokens with separate caps per token. Useful for paying OpenRouter-on-Starknet (USDC) while also paying gas-token fees (STRK).

**V2 — Revocable delegation**
Let a link delegate some of its budget to a sub-link (e.g. a contractor agent that has its own sub-contractors). Caps chain multiplicatively.

## Why this is the right shape

The critical design choice was keeping the escrow minimal and trust-scoped: the contract does not know anything about AI agents, LLM providers, or payment networks. It is a pure rule-enforcing escrow, which means it's auditable, small, and the same primitive works for any off-chain consumer — whether that's an LLM, a trading bot, a data pipeline, or a human-operated dashboard. The "agent" framing lives entirely in the SDK layer and the skill manifest, so the primitive itself is general.
