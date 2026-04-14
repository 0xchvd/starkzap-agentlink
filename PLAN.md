# AgentLink — PLAN.md (single source of truth for resume)

**Project:** AgentLink — session-key-backed escrow for AI agent recipients on Starknet via Starkzap SDK
**Bounty:** Starkzap Week 2 Builder Challenge
**Deadline:** 2026-04-14 EOD (results announced Wed 2026-04-15)
**Prize target:** 1 of up to 2 weekly winners × $500 STRK
**User wallet:** Braavos
**Sender test wallet:** (not yet generated — use StarkSigner with env var for dev)

---

## Current state (last updated 2026-04-14 during S2)

**Contract DEPLOYED on Starknet Sepolia:**
- Class Hash: `0x05aa4876acac0708a90d630571f0aaebad24077ee5a64fab10b3655c0ca94b7b`
- Contract Address: `0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb`
- Voyager: https://sepolia.voyager.online/contract/0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb
- Deployer: `0x002c9e6703eeaf00fd1c968712fa87262e2bc6aa7008415f6496302019ba73a4`

**Toolchain:** Scarb 2.14.0, snforge 0.59.0, sncast 0.59.0 (all via WSL Ubuntu)

## NEXT ACTION (single concrete step)

**S2 deploy complete.** S3 starts here.

**S3 next action:** Polish submission package:
1. Update README.md with deployed contract addresses and Voyager links
2. Update Twitter thread with live contract proof
3. Ensure submission is ready for deadline (today EOD)
4. User submits

## Progress checklist

- [x] S1: Feasibility study (Starkzap SDK surface, paymaster, policy model, gap analysis)
- [x] S1: Decide V1 shape — GREEN (full escrow with caps + allowlists)
- [x] S1: Write PLAN.md (this file)
- [x] S1: Scaffold directory structure
- [x] S1: Write README.md pitch section
- [x] S1: Write Scarb.toml for Cairo project
- [x] S1: Write `agent_link_escrow.cairo` skeleton (interface + storage)
- [x] S1: Write `agent_link_escrow.cairo` implementation of `create_link`
- [x] S1: Write `agent_link_escrow.cairo` implementation of `spend`
- [x] S1: Write `agent_link_escrow.cairo` implementation of `revoke` + views
- [x] S1: Write basic contract tests
- [x] S1: Write TypeScript package.json + tsconfig
- [x] S1: Write `sdk/src/create_link.ts` (sender helper using Starkzap)
- [x] S1: Write `sdk/src/spend.ts` (agent helper)
- [x] S1: Write `demo/run_full_demo.sh` — one-command demo
- [x] S1: Write `skill/SKILL.md` + MCP tool stubs
- [x] S1: Write `thread/twitter_thread.md` — 6-tweet draft
- [x] S1: Write `docs/ARCHITECTURE.md` — how it works
- [x] S1: Write `docs/WHY_AGENTS.md` — the pitch
- [x] S1: Write `docs/SECURITY.md` — threat model
- [x] S2: Test contract compiles with `scarb build` (Scarb 2.14.0, clean)
- [x] S2: Run tests with `snforge test` (4/4 pass)
- [x] S2: Deploy to Starknet Sepolia (sncast declare + deploy)
- [x] S2: Verify contract live (read call returns expected default)
- [x] S2: Capture transcript into `demo/transcript.md`
- [ ] S3: Update README + thread with deployed addresses
- [ ] S3: User reviews and submits before deadline

## Architecture (locked)

### On-chain: `agent_link_escrow.cairo`

**Storage:**
```
struct Storage {
    next_link_id: u128,
    links: Map<u128, LinkRules>,
    spent: Map<u128, u256>,
    nonces: Map<(u128, felt252), bool>,  // replay protection (link_id, nonce) -> used
    // flattened allowlist storage
    allowed_contract: Map<(u128, ContractAddress), bool>,
    allowed_selector: Map<(u128, ContractAddress, felt252), bool>,
    allowed_destination: Map<(u128, ContractAddress), bool>,
}

struct LinkRules {
    sender: ContractAddress,
    session_pubkey: felt252,
    funding_token: ContractAddress,
    total_cap: u256,
    per_tx_cap: u256,
    valid_until: u64,
    revoked: bool,
}
```

**Interface (`IAgentLinkEscrow`):**
- `create_link(rules: LinkRules, allowed_contracts: Array<ContractAddress>, allowed_selectors: Array<(ContractAddress, felt252)>, allowed_destinations: Array<ContractAddress>, funding: u256) -> u128`
- `spend(link_id, target, selector, calldata, nonce, sig_r, sig_s)`
- `revoke(link_id: u128)`
- `remaining(link_id: u128) -> u256`
- `get_rules(link_id: u128) -> LinkRules`
- `is_allowed_contract(link_id, addr) -> bool`
- `is_allowed_selector(link_id, addr, sel) -> bool`
- `is_allowed_destination(link_id, addr) -> bool`

**Events:**
- `LinkCreated { link_id, sender, funding, valid_until }`
- `SpendExecuted { link_id, target, selector, amount }`
- `LinkRevoked { link_id, refund_amount }`

**Rule checks in spend() (order matters — fail fast):**
1. Signature valid vs `session_pubkey` (Stark curve verify)
2. Nonce not used (replay protection)
3. Not revoked
4. `now <= valid_until`
5. `target` in allowed_contracts
6. `selector` in allowed_selectors[target]
7. Decoded destination in allowed_destinations (for transfer/approve selectors)
8. Decoded amount <= per_tx_cap
9. spent + amount <= total_cap
10. Execute call via `starknet::syscalls::call_contract_syscall`
11. Update spent, mark nonce used
12. Emit event

### Off-chain: Starkzap-powered TypeScript SDK

**Sender side (`sdk/src/create_link.ts`):**
```ts
import { StarkZap, StarkSigner, Call } from "starkzap";

async function createAgentLink(
  sdk: StarkZap,
  wallet: Wallet,
  rules: AgentLinkRulesInput,
): Promise<{ linkId: bigint; sessionPrivkey: bigint; txHash: string }> {
  // 1. Generate session keypair
  // 2. Approve escrow to pull `funding` tokens
  // 3. Build create_link Call with serialized rules
  // 4. wallet.execute([approveCall, createLinkCall]) — atomic batch
  // 5. Parse LinkCreated event for link_id
  // 6. Return {linkId, sessionPrivkey, txHash}
}
```

**Agent side (`sdk/src/spend.ts`):**
```ts
async function spendFromAgentLink(
  sdk: StarkZap,
  linkCredential: AgentLinkCredential,  // {linkId, sessionPrivkey, escrowAddr}
  target: string,
  selector: string,
  calldata: string[],
): Promise<Tx> {
  // 1. Compute message hash (link_id, target, selector, calldata, nonce)
  // 2. Sign with session key (stark curve)
  // 3. Build spend Call
  // 4. Execute via sponsored paymaster (agent pays no gas)
  // 5. Return tx
}
```

**Demo (`demo/run_full_demo.sh`):**
```bash
#!/bin/bash
set -e
echo "=== AgentLink end-to-end demo ==="
bun run demo/deploy_mock_api.ts    # deploy target contract
bun run demo/create_link.ts        # sender funds agent
bun run demo/agent_spend.ts        # agent calls target via escrow
bun run demo/verify_receipt.ts     # sanity-check tx + balance deltas
```

## Risks and mitigations (updated)

| Risk | Severity | Mitigation |
|---|---|---|
| Cairo syntax mismatch with latest Cairo 2.x | MED | Start from OpenZeppelin Cairo contracts template; I have enough syntax reference from docs |
| Stark curve signature verify in Cairo is hairy | HIGH | Use `starknet::secp256k1_trait` or ecdsa helper. V1 fallback: simplify to caller-address check (sender grants a whitelisted CALLER address instead of session pubkey). Still novel because the escrow itself is the primitive. |
| `scarb build` fails on Windows | MED | Use Docker or WSL. Or skip local compile — deploy directly via Starknet Remix or document that judges compile. |
| AVNU paymaster requires API key | LOW | Document setup, use free tier or leave as user config. Demo doesn't need paymaster — only gasless-creation demo does. |
| 3 days insufficient for full polish | MED | PLAN.md checklist sorts by priority. If time runs out, cut tests and security docs first, keep contract + demo + thread. |
| 0xchvd can't file Starknet signal (off-topic for aibtc beats) | MED | Pre-frame signal as "x402 → Starknet: AgentLink extends canonical payment state machine semantics to Cartridge session key model" — ties to existing infrastructure beat coverage |

## Fallback shapes (if Cairo signature verify blocks progress)

**V1-simple:** Replace session key signature with caller-address whitelist. Sender whitelists ONE agent address when creating a link. Agent calls `spend()` directly from its own Starknet address. Contract checks `get_caller_address() == whitelisted_agent`. Loses the "no private key needed" story but ships fast and the escrow+caps+allowlist logic is still novel.

**V1-medium (preferred if v1-simple compiles):** Use Starknet's built-in `ecdsa::check_ecdsa_signature` over the stark curve (the same curve Starknet accounts use). Message hash = pedersen(link_id, target, selector, calldata_hash, nonce). Session privkey generated client-side.

**V2 stretch:** SNIP-9 OutsideExecution envelope — caller submits a signed OutsideExecution message on behalf of the session, contract unwraps. Closer to Cartridge's pattern. Post-bounty upgrade path.

## Session resume protocol

On any new session:
1. Read this file (`PLAN.md`)
2. Read the last-touched file listed in "NEXT ACTION"
3. Check `contracts/src/` for latest state of Cairo contract
4. Check `sdk/src/` for TS progress
5. Execute the NEXT ACTION
6. Update NEXT ACTION and checklist in this file when you finish a chunk

Do not re-fetch Starkzap docs — they are captured in `docs/STARKZAP_SURFACE.md` (will be written in S1).

## Links (captured during S1 research)

- Starkzap repo: https://github.com/keep-starknet-strange/starkzap
- Starkzap docs: https://docs.starknet.io/build/starkzap/overview
- Starkzap paymasters: https://docs.starknet.io/build/starkzap/paymasters
- Starkzap quick-start: https://docs.starknet.io/build/starkzap/quick-start
- Starkzap transactions: https://docs.starknet.io/build/starkzap/transactions
- awesome-starkzap: https://github.com/keep-starknet-strange/awesome-starkzap
- Cairo book: https://www.starknet.io/cairo-book/
- OpenZeppelin Cairo contracts: https://github.com/OpenZeppelin/cairo-contracts
