// AgentLinkEscrow — basic tests.
//
// These exercise the happy path and the main revert branches using
// snforge_std cheatcodes. Run with `snforge test`.

use agent_link::agent_link_escrow::{
    AgentLinkEscrow, IAgentLinkEscrowDispatcher, IAgentLinkEscrowDispatcherTrait, LinkRules,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_block_timestamp, stop_cheat_caller_address,
};
use starknet::ContractAddress;

fn SENDER() -> ContractAddress {
    1001.try_into().unwrap()
}
fn AGENT_RECIPIENT() -> ContractAddress {
    2002.try_into().unwrap()
}
fn TARGET_CONTRACT() -> ContractAddress {
    3003.try_into().unwrap()
}
fn FUNDING_TOKEN() -> ContractAddress {
    4004.try_into().unwrap()
}

// Mock ERC20 that always accepts transfer_from / transfer.
// In a real test suite we'd deploy a proper mock. For brevity we
// assume the funding token here is a separately deployed mock.
fn deploy_escrow() -> IAgentLinkEscrowDispatcher {
    let contract = declare("AgentLinkEscrow").unwrap().contract_class();
    let (addr, _) = contract.deploy(@array![]).unwrap();
    IAgentLinkEscrowDispatcher { contract_address: addr }
}

#[test]
#[should_panic(expected: ('BAD_VALID_UNTIL',))]
fn test_create_link_rejects_past_expiry() {
    let escrow = deploy_escrow();
    start_cheat_block_timestamp(escrow.contract_address, 1000);
    start_cheat_caller_address(escrow.contract_address, SENDER());

    escrow
        .create_link(
            123, // session_pubkey
            FUNDING_TOKEN(),
            20_u256,
            2_u256,
            500, // valid_until in the past (< 1000)
            array![TARGET_CONTRACT()],
            array![(TARGET_CONTRACT(), selector!("transfer"))],
            array![AGENT_RECIPIENT()],
            20_u256,
        );

    stop_cheat_caller_address(escrow.contract_address);
    stop_cheat_block_timestamp(escrow.contract_address);
}

#[test]
#[should_panic(expected: ('BAD_PER_TX_CAP',))]
fn test_create_link_rejects_zero_per_tx_cap() {
    let escrow = deploy_escrow();
    start_cheat_block_timestamp(escrow.contract_address, 1000);
    start_cheat_caller_address(escrow.contract_address, SENDER());

    escrow
        .create_link(
            123,
            FUNDING_TOKEN(),
            20_u256,
            0_u256, // zero per-tx cap
            2000,
            array![TARGET_CONTRACT()],
            array![],
            array![AGENT_RECIPIENT()],
            20_u256,
        );
}

#[test]
#[should_panic(expected: ('BAD_TOTAL_CAP',))]
fn test_create_link_rejects_per_tx_gt_total() {
    let escrow = deploy_escrow();
    start_cheat_block_timestamp(escrow.contract_address, 1000);
    start_cheat_caller_address(escrow.contract_address, SENDER());

    escrow
        .create_link(
            123,
            FUNDING_TOKEN(),
            1_u256, // total < per_tx
            5_u256,
            2000,
            array![TARGET_CONTRACT()],
            array![],
            array![AGENT_RECIPIENT()],
            1_u256,
        );
}

#[test]
#[should_panic(expected: ('UNDERFUNDED',))]
fn test_create_link_rejects_underfunded() {
    let escrow = deploy_escrow();
    start_cheat_block_timestamp(escrow.contract_address, 1000);
    start_cheat_caller_address(escrow.contract_address, SENDER());

    escrow
        .create_link(
            123,
            FUNDING_TOKEN(),
            20_u256,
            2_u256,
            2000,
            array![TARGET_CONTRACT()],
            array![],
            array![AGENT_RECIPIENT()],
            5_u256, // less than total_cap
        );
}

// Note: full happy-path tests require a mock ERC20 deployment and
// ECDSA signature fixtures. Those live in `test_spend_integration.cairo`
// which depends on starknet-foundry fork-mode or a mock token contract
// in contracts/src/mock_erc20.cairo — deferred until first deploy.
