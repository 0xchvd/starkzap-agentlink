# AgentLink

**The first payment rail designed for AI agent recipients, built on Starknet via Starkzap.**

Stop giving your agents your seed phrase. Stop dripping pennies every hour. Give them an AgentLink.

---

## What is AgentLink

A session-key-backed escrow contract where the sender pre-declares **what contracts the agent can call**, **where funds can flow**, **how much per transaction**, **how much total**, and **for how long** — all enforced on-chain, not on trust.

```
┌─ Sender (Braavos wallet via Starkzap) ─────────────┐
│ create_link({                                       │
│   funding: 20 STRK,                                  │
│   allowed_contracts: [OpenRouter_proxy, STRK_token],│
│   allowed_destinations: [agent_main, treasury],     │
│   per_tx_cap: 2 STRK,                                │
│   total_cap: 20 STRK,                                │
│   valid_until: now + 7 days,                         │
│ }) → link_id, session_privkey                        │
└──────────────────────────────────────────────────────┘
                         ↓ hand link to agent
┌─ Agent (signs with session key, gasless via AVNU) ─┐
│ spend(link_id, OpenRouter_proxy, "pay_and_call",    │
│       [...], nonce, sig)                             │
│   → escrow validates all rules on-chain              │
│   → call_contract_syscall executes                   │
│   → spent counter updated                            │
└──────────────────────────────────────────────────────┘
```

If the agent tries to send funds to an unapproved destination, hit a contract that isn't allowlisted, exceed the per-tx cap, or blow the total cap — the tx reverts. The agent **cannot escalate privilege.**

Revoke any time. Refunds the remainder.

## Why this is novel

1. **Nobody has shipped agent-native payment rails.** Every existing paylink (Peanut, Base Pay, Phantom) assumes a human clicks the link. Every session key system (Cartridge policies, ERC-4337) assumes one user delegating to one dApp. AgentLink is the missing primitive: **one sender → many agents → scoped autonomous spending**.

2. **Starknet is where this is cleanest.** Native account abstraction + Cartridge's policy-matching paymaster infrastructure mean session-key primitives aren't bolted on — they're the default. Starkzap makes the TypeScript integration a 10-line job instead of 500 lines of ERC-4337 gymnastics.

3. **The escrow adds what Cartridge policies don't.** Cartridge session keys allow `(contract, method)` policy pairs but don't handle escrow isolation, per-tx amount caps, total spend caps, destination allowlists, or multi-grant segregation from one sender. AgentLink composes those on top of Cartridge's model.

## Live on Starknet Sepolia

| | |
|---|---|
| **Contract** | [`0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb`](https://sepolia.voyager.online/contract/0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb) |
| **Class** | [`0x05aa4876acac0708a90d630571f0aaebad24077ee5a64fab10b3655c0ca94b7b`](https://sepolia.voyager.online/class/0x05aa4876acac0708a90d630571f0aaebad24077ee5a64fab10b3655c0ca94b7b) |
| **Network** | Starknet Sepolia |
| **Cairo** | 2.14.0 (Scarb 2.14.0) |
| **Tests** | 4/4 passing (snforge 0.59.0) |

## Quick start

```bash
# Install
npm install starkzap @agentlink/sdk

# Create a link (sender side)
bun run demo/create_link.ts --fund 20 --agent 0x...

# Agent spends (agent side)
bun run demo/agent_spend.ts --link 0x... --target 0x... --amount 1
```

Full end-to-end demo:

```bash
bun run demo/run_full_demo.sh
```

## Installing as a Claude Code skill

```bash
claude skill add github.com/0xchvd/starkzap-agentlink
```

This registers three MCP tools any Claude agent can call:

- `agentlink_create` — sender side, creates a new scoped grant
- `agentlink_spend` — agent side, signs and executes within scope
- `agentlink_status` — query remaining budget, rules, and history

See `skill/SKILL.md` for the full tool manifest.

## The demo

The demo funds a real autonomous AI agent (0xchvd, an aibtc.news correspondent) with a 20 STRK AgentLink. The agent uses it to call an LLM inference endpoint on-chain and files a news signal about its own transaction. The signal is the receipt — you can verify it on aibtc.news, and the tx hash is on Starkscan.

See `demo/transcript.md` for the recorded run.

## Architecture

See `docs/ARCHITECTURE.md` for the contract design, session key mechanics, and the SNIP-9 upgrade path.
See `docs/WHY_AGENTS.md` for the long-form pitch.
See `docs/SECURITY.md` for the threat model and what AgentLink does and does not prevent.

## Built for the Starkzap Week 2 Builder Challenge

3 days of work. Open source. MIT license. Built by [@0xchvd](https://x.com/0xchvd) who runs an autonomous aibtc.news correspondent agent on Bitcoin and wanted the same primitive on Starknet.

Repo: [github.com/0xchvd/starkzap-agentlink](https://github.com/0xchvd/starkzap-agentlink)
