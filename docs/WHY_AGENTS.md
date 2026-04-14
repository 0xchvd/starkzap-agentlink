# Why AgentLink

## The problem no one has named

Every shipped crypto payment primitive assumes the recipient is a human. Paylinks (Peanut, Base Pay, Phantom) assume a human clicks. Escrows (Kleros, Reality) assume a human arbitrates. Multisigs assume humans co-sign. Session keys (Cartridge policies, ERC-4337) are for humans delegating to dApps.

**Nobody has shipped a payment rail where the recipient is an AI agent.**

This matters now because for the first time autonomous agents are doing real work, earning real money, and spending real money. They are calling paid APIs (OpenRouter, Anthropic, OpenAI). They are filing signals (aibtc.news correspondents earn sBTC per brief inclusion). They are trading (Agentic Trading beat, Yield Hunter bots). They are buying compute (Gensyn, io.net). And none of the existing primitives can hold the other end of the wire.

Today, the two options for "pay an agent" are:

1. **Give the agent the private key to a funded wallet.** No scope, no caps, no revocation, no accountability. One prompt injection and the whole treasury is gone.
2. **Drip-fund the agent hourly or per-task from a human-supervised account.** Human is the bottleneck. Agent stalls every time the human sleeps. Throughput is glacial. Fees pile up.

Both are bad. Option 1 is the path of least resistance for hobby projects and it has already cost people real money. Option 2 is the path of least resistance for serious operators and it caps the agent economy at human speed.

## What AgentLink changes

AgentLink is a scoped-spend grant backed by an on-chain escrow. The sender declares:

- **which contracts** the agent may call
- **which methods** on those contracts
- **which destinations** may receive funds
- **how much per transaction**
- **how much total**
- **for how long**

And the escrow enforces every single one of those rules on-chain. The agent gets a session key that signs spend messages. The session key has no authority outside the escrow — it cannot touch any other contract, any other balance, any other destination. If the agent is compromised, the blast radius is bounded by the rules the sender declared. If the sender changes their mind, one `revoke()` call refunds the remainder.

This is the first primitive that lets you pay an agent the way you pay a contractor: scoped authority, capped budget, revocable trust, auditable ledger.

## Why Starknet is where this ships first

Three reasons:

1. **Native account abstraction.** On Ethereum, building this on top of ERC-4337 means 500+ lines of bundler integration, entrypoint wrangling, and paymaster glue. On Starknet, `wallet.execute([call1, call2], { feeMode: "sponsored" })` is the one-liner. The SDK is tiny.
2. **Cheap storage and hashing.** Poseidon is Starknet-native. The rule-check hot path in `spend()` is a handful of map reads and one signature verification — fees measured in fractions of a cent.
3. **Starkzap.** The SDK exposes Braavos, Argent, Cartridge, and sponsored paymasters through one interface. Integrating AgentLink into any Starkzap app is a 10-line import; building the equivalent on EVMs would be a week of entrypoint gymnastics.

## Why this is more than a primitive — it's a new category

Once scoped-spend grants exist for agents, several adjacent things become possible that weren't before:

- **Agent marketplaces with real payment.** You can list an agent service and let clients fund an AgentLink instead of prepaying or holding credit with a centralized escrow.
- **Multi-agent coordination.** A parent agent can sub-delegate part of its budget to child agents with tighter rules, creating a tree of capped spending authority.
- **Agent-to-agent tipping.** An agent can fund another agent for a one-off task with zero trust and full revocation, because the escrow never lets the recipient do anything outside the rules.
- **Autonomous recurring payments.** An agent with an expiring AgentLink can use it as a metered subscription — the sender doesn't have to manually renew every month, but the agent can't run forever either.
- **Regulatory-friendly delegation.** If an agent is operating funds for a human user, the AgentLink's on-chain rules are a machine-readable statement of the scope of authority. A regulator or auditor can inspect the contract allowlist and the total cap without talking to the operator.

None of these need AgentLink to be novel — they just need a primitive that enforces scoped authority for agent recipients. That primitive is what AgentLink is.

## Who this is for

- **Operators running autonomous agents** (aibtc correspondents, trading bots, yield hunters, research agents) who want to fund them without handing over the treasury.
- **DAO treasuries** delegating specific operational budgets to agent services without signing every individual call.
- **API providers** (OpenRouter-on-Starknet, inference marketplaces) who want to accept agent customers without custodial accounts.
- **Anyone who has ever dripped an API-key balance to a bot** and wished there was a better way.

## What it isn't

AgentLink is not a replacement for:

- Cartridge Controller (which is a full session key account — AgentLink is a simpler single-purpose grant)
- Paylinks (which are for human clickers — AgentLink's session key is meant to be held by code)
- Streaming payments (Superfluid, Sablier — continuous flow, not rule-enforced spend)
- Multisigs (many-to-many human approval — AgentLink is one-to-many human-to-agent)

It sits next to all of those as the missing piece: the thing you reach for when the recipient is a program you don't fully trust but need to pay.
