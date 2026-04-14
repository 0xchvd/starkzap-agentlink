---
name: agentlink
description: Create, spend from, and query AgentLink scoped-spend grants on Starknet. Use when an AI agent needs funds with enforced per-tx caps, total caps, destination allowlists, and a time window — without holding an unrestricted private key.
---

# AgentLink — Claude Code Skill

## When to use this skill

Invoke any of the three tools below when:

- A user asks you to **fund an autonomous agent with bounded authority** on Starknet.
- A user asks you to **send a scoped grant** to another agent or service.
- An agent (including you) needs to **spend from an existing AgentLink** within the rules the sender declared.
- A user asks **how much budget remains** on a previously created link.

Do NOT invoke this skill for:

- Human-to-human paylinks (Starkzap Paylink, Peanut, Base Pay are better fits).
- Arbitrary Starknet transactions the sender wants to sign themselves.
- Off-Starknet chains.

## Tools

### `agentlink_create`

Create a new AgentLink. Sender-side.

Inputs:

| field | type | notes |
|---|---|---|
| `escrowAddress` | string | Deployed AgentLinkEscrow contract address |
| `fundingToken` | string | ERC20 address to lock (STRK, USDC, etc.) |
| `totalCap` | string (u256) | Max lifetime spend |
| `perTxCap` | string (u256) | Max per single spend |
| `validUntilUnix` | number | Expiry timestamp |
| `allowedContracts` | string[] | Targets the agent can call |
| `allowedSelectors` | {contract, selector}[] | (contract, method) pairs allowed |
| `allowedDestinations` | string[] | Addresses that may receive funds |
| `funding` | string (u256) | Amount to pull from sender |

Output: `{ linkId, sessionPrivkey, sessionPubkey, txHash, credential }`

**Security:** `sessionPrivkey` is a bearer credential. Never log it, never persist it to disk unencrypted, never send it over a non-encrypted channel. Treat it as equivalent to a bearer token with scope-limited authority.

### `agentlink_spend`

Sign and submit a single scoped spend. Agent-side.

Inputs:

| field | type | notes |
|---|---|---|
| `credential` | AgentLinkCredential | Returned by `agentlink_create` |
| `target` | string | Contract to call |
| `method` | string | Selector name or hex felt |
| `calldata` | string[] | Felt-encoded calldata |

Output: `{ txHash, nonce, target, selector }`

Reverts with a specific error string on any rule violation:

- `REVOKED` — sender revoked the link
- `EXPIRED` — past `valid_until`
- `NONCE_USED` — replay
- `BAD_SIG` — signature does not verify against the session pubkey
- `CONTRACT_NOT_ALLOWED` — target is not in the allowlist
- `SELECTOR_NOT_ALLOWED` — method is not in the allowlist for that target
- `DEST_NOT_ALLOWED` — transfer destination is not in the allowlist
- `PER_TX_CAP` — amount exceeds per-tx cap
- `TOTAL_CAP` — cumulative spend would exceed total cap

### `agentlink_status`

Read-only query. Returns rules, remaining budget, spent amount, revoked flag, expiry.

Inputs:

| field | type | notes |
|---|---|---|
| `escrowAddress` | string | |
| `linkId` | string (u128) | |

Output: `{ rules, remaining, spent, revoked, expiresInSeconds }`

## Example

```ts
import { agentlinkCreate, agentlinkSpend } from "@agentlink/skill";

const { credential } = await agentlinkCreate({
  escrowAddress: "0x...",
  fundingToken: STRK,
  totalCap: "20000000000000000000",
  perTxCap: "2000000000000000000",
  validUntilUnix: Math.floor(Date.now() / 1000) + 7 * 86400,
  allowedContracts: [STRK],
  allowedSelectors: [{ contract: STRK, selector: "transfer" }],
  allowedDestinations: ["0xagent..."],
  funding: "20000000000000000000",
});

// hand credential to the agent (out-of-band)

// later, agent-side:
await agentlinkSpend({
  credential,
  target: STRK,
  method: "transfer",
  calldata: encodeTransferCalldata("0xagent...", 1_000_000_000_000_000_000n),
});
```

## Why this primitive

Session keys solve the "one user → one dApp" case. Paylinks solve the "one sender → one human clicker" case. Neither solves "one sender → many autonomous agents → scoped, auditable, revocable spending." AgentLink composes scoped-spend rules on top of Starknet's native account abstraction so the agent never holds the sender's key and cannot escalate privilege.

See `docs/ARCHITECTURE.md` for how this maps to Cartridge policies, SNIP-9 OutsideExecution, and the AVNU paymaster.

## Tool implementation

The MCP tool stubs live in `skill/tools/`. Each one wraps the `@agentlink/sdk` functions and forwards to the connected Starkzap wallet. The skill is stateless between invocations — credentials are returned to the caller, never stored by the skill itself.
