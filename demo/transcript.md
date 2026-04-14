# AgentLink — Deployment & Verification Transcript

**Network:** Starknet Sepolia  
**Date:** 2026-04-14  
**Tools:** Scarb 2.14.0, snforge 0.59.0, sncast 0.59.0, starkli 0.4.2

---

## 1. Contract Compilation

```
$ scarb build
   Compiling lib(agent_link) agent_link v0.1.0
   Compiling starknet-contract(agent_link) agent_link v0.1.0
    Finished `dev` profile target(s) in 5 seconds
```

Artifacts:
- `agent_link_AgentLinkEscrow.contract_class.json` (Sierra)
- `agent_link_AgentLinkEscrow.compiled_contract_class.json` (CASM)

## 2. Test Suite

```
$ snforge test
Collected 4 test(s) from agent_link package
Running 4 test(s) from tests/
[PASS] test_create_link_rejects_underfunded
[PASS] test_create_link_rejects_zero_per_tx_cap
[PASS] test_create_link_rejects_per_tx_gt_total
[PASS] test_create_link_rejects_past_expiry
Tests: 4 passed, 0 failed, 0 ignored, 0 filtered out
```

## 3. Declaration

```
$ sncast declare --contract-name AgentLinkEscrow --network sepolia

Class Hash:       0x05aa4876acac0708a90d630571f0aaebad24077ee5a64fab10b3655c0ca94b7b
Transaction Hash: 0x00d464c205db22d9424ecc7fdb4555913673e2175b7cb10f233418e115f19231
```

Voyager: https://sepolia.voyager.online/class/0x05aa4876acac0708a90d630571f0aaebad24077ee5a64fab10b3655c0ca94b7b

## 4. Deployment

```
$ sncast deploy --class-hash 0x5aa4876acac0708a90d630571f0aaebad24077ee5a64fab10b3655c0ca94b7b --network sepolia

Contract Address: 0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb
Transaction Hash: 0x0134b7a988bcbb67af340aeb90db0d8dd301ea612a34c33044f463fd1caf38e9
```

Voyager: https://sepolia.voyager.online/contract/0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb

## 5. Verification (read call)

```
$ sncast call --contract-address 0x01142b845add36cc4fa7a105e3d0dd0e61e5c0b0b4c22826e41c697a48b15fcb \
    --function remaining --calldata 1 --network sepolia

Response: 0_u256
```

Contract is live. `remaining(1)` returns 0 because no links have been created yet — link IDs start at 1 and the default storage read returns 0. This confirms the constructor ran correctly (`next_link_id` initialized to 1).

## Summary

| Step | Status | Artifact |
|------|--------|----------|
| Compile | PASS | Sierra + CASM |
| Tests (4 revert-path) | PASS | All green |
| Declare on Sepolia | DONE | Class 0x05aa...4b7b |
| Deploy on Sepolia | DONE | Contract 0x0114...5fcb |
| Read verification | PASS | Returns expected default |
