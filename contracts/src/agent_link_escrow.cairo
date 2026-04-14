// AgentLink Escrow
// -----------------
// Session-key-backed escrow for AI agent recipients.
// A sender locks funds and declares rules. An agent holding the session key
// can execute arbitrary calls so long as every rule passes, on-chain.
//
// Rules enforced per spend():
//   1. Signature on (link_id, target, selector, calldata_hash, nonce) valid
//      against session_pubkey (Stark curve ECDSA).
//   2. Nonce not yet used (replay protection).
//   3. Link not revoked.
//   4. now <= valid_until.
//   5. target is in allowed_contracts.
//   6. selector is in allowed_selectors[target].
//   7. If selector is a transfer/approve, the destination decoded from
//      calldata[0] must be in allowed_destinations.
//   8. Decoded amount (calldata[1..3] as u256) must be <= per_tx_cap.
//   9. spent + amount must be <= total_cap.
//
// Revoke is sender-only and refunds the remainder of the funding token.

use starknet::ContractAddress;

#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct LinkRules {
    pub sender: ContractAddress,
    pub session_pubkey: felt252,
    pub funding_token: ContractAddress,
    pub total_cap: u256,
    pub per_tx_cap: u256,
    pub valid_until: u64,
    pub revoked: bool,
}

#[starknet::interface]
pub trait IAgentLinkEscrow<TContractState> {
    fn create_link(
        ref self: TContractState,
        session_pubkey: felt252,
        funding_token: ContractAddress,
        total_cap: u256,
        per_tx_cap: u256,
        valid_until: u64,
        allowed_contracts: Array<ContractAddress>,
        allowed_selectors: Array<(ContractAddress, felt252)>,
        allowed_destinations: Array<ContractAddress>,
        funding: u256,
    ) -> u128;

    fn spend(
        ref self: TContractState,
        link_id: u128,
        target: ContractAddress,
        selector: felt252,
        calldata: Array<felt252>,
        nonce: felt252,
        sig_r: felt252,
        sig_s: felt252,
    );

    fn revoke(ref self: TContractState, link_id: u128);

    fn remaining(self: @TContractState, link_id: u128) -> u256;
    fn get_rules(self: @TContractState, link_id: u128) -> LinkRules;
    fn is_allowed_contract(self: @TContractState, link_id: u128, addr: ContractAddress) -> bool;
    fn is_allowed_selector(
        self: @TContractState, link_id: u128, addr: ContractAddress, sel: felt252,
    ) -> bool;
    fn is_allowed_destination(
        self: @TContractState, link_id: u128, addr: ContractAddress,
    ) -> bool;
    fn nonce_used(self: @TContractState, link_id: u128, nonce: felt252) -> bool;
}

#[starknet::interface]
pub trait IERC20<TContractState> {
    fn transfer(ref self: TContractState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState,
        sender: ContractAddress,
        recipient: ContractAddress,
        amount: u256,
    ) -> bool;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
}

#[starknet::contract]
pub mod AgentLinkEscrow {
    use core::ecdsa::check_ecdsa_signature;
    use core::poseidon::poseidon_hash_span;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::syscalls::call_contract_syscall;
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use super::{IERC20Dispatcher, IERC20DispatcherTrait, LinkRules};

    // ERC20 selectors we recognize for destination/amount decoding.
    // selector!("transfer") and selector!("approve") resolved at compile time.
    const SELECTOR_TRANSFER: felt252 = selector!("transfer");
    const SELECTOR_APPROVE: felt252 = selector!("approve");

    #[storage]
    struct Storage {
        next_link_id: u128,
        links: Map<u128, LinkRules>,
        spent: Map<u128, u256>,
        nonces: Map<(u128, felt252), bool>,
        allowed_contract: Map<(u128, ContractAddress), bool>,
        allowed_selector: Map<(u128, ContractAddress, felt252), bool>,
        allowed_destination: Map<(u128, ContractAddress), bool>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        LinkCreated: LinkCreated,
        SpendExecuted: SpendExecuted,
        LinkRevoked: LinkRevoked,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LinkCreated {
        #[key]
        pub link_id: u128,
        #[key]
        pub sender: ContractAddress,
        pub session_pubkey: felt252,
        pub funding: u256,
        pub valid_until: u64,
    }

    #[derive(Drop, starknet::Event)]
    pub struct SpendExecuted {
        #[key]
        pub link_id: u128,
        #[key]
        pub target: ContractAddress,
        pub selector: felt252,
        pub amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LinkRevoked {
        #[key]
        pub link_id: u128,
        pub refund_amount: u256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_link_id.write(1_u128);
    }

    #[abi(embed_v0)]
    impl AgentLinkEscrowImpl of super::IAgentLinkEscrow<ContractState> {
        fn create_link(
            ref self: ContractState,
            session_pubkey: felt252,
            funding_token: ContractAddress,
            total_cap: u256,
            per_tx_cap: u256,
            valid_until: u64,
            allowed_contracts: Array<ContractAddress>,
            allowed_selectors: Array<(ContractAddress, felt252)>,
            allowed_destinations: Array<ContractAddress>,
            funding: u256,
        ) -> u128 {
            assert(session_pubkey != 0, 'BAD_PUBKEY');
            assert(per_tx_cap > 0_u256, 'BAD_PER_TX_CAP');
            assert(total_cap >= per_tx_cap, 'BAD_TOTAL_CAP');
            assert(valid_until > get_block_timestamp(), 'BAD_VALID_UNTIL');
            assert(funding >= total_cap, 'UNDERFUNDED');

            let sender = get_caller_address();
            let link_id = self.next_link_id.read();
            self.next_link_id.write(link_id + 1_u128);

            let rules = LinkRules {
                sender,
                session_pubkey,
                funding_token,
                total_cap,
                per_tx_cap,
                valid_until,
                revoked: false,
            };
            self.links.write(link_id, rules);
            self.spent.write(link_id, 0_u256);

            // Flatten allowlists into storage maps.
            let mut i = 0;
            let contracts_len = allowed_contracts.len();
            while i != contracts_len {
                self.allowed_contract.write((link_id, *allowed_contracts.at(i)), true);
                i += 1;
            };

            let mut j = 0;
            let selectors_len = allowed_selectors.len();
            while j != selectors_len {
                let (addr, sel) = *allowed_selectors.at(j);
                self.allowed_selector.write((link_id, addr, sel), true);
                j += 1;
            };

            let mut k = 0;
            let dests_len = allowed_destinations.len();
            while k != dests_len {
                self.allowed_destination.write((link_id, *allowed_destinations.at(k)), true);
                k += 1;
            };

            // Pull funding from sender into escrow.
            let token = IERC20Dispatcher { contract_address: funding_token };
            let ok = token.transfer_from(sender, get_contract_address(), funding);
            assert(ok, 'FUND_TRANSFER_FAILED');

            self
                .emit(
                    LinkCreated { link_id, sender, session_pubkey, funding, valid_until },
                );
            link_id
        }

        fn spend(
            ref self: ContractState,
            link_id: u128,
            target: ContractAddress,
            selector: felt252,
            calldata: Array<felt252>,
            nonce: felt252,
            sig_r: felt252,
            sig_s: felt252,
        ) {
            let rules = self.links.read(link_id);
            assert(!rules.revoked, 'REVOKED');
            assert(rules.session_pubkey != 0, 'UNKNOWN_LINK');
            assert(get_block_timestamp() <= rules.valid_until, 'EXPIRED');

            // Replay protection.
            let used = self.nonces.read((link_id, nonce));
            assert(!used, 'NONCE_USED');

            // Compute message hash: poseidon(link_id, target, selector, ...calldata, nonce).
            let mut msg = array![];
            msg.append(link_id.into());
            msg.append(target.into());
            msg.append(selector);
            let calldata_len = calldata.len();
            let mut ci = 0;
            while ci != calldata_len {
                msg.append(*calldata.at(ci));
                ci += 1;
            };
            msg.append(nonce);
            let msg_hash = poseidon_hash_span(msg.span());

            // Verify session-key ECDSA signature.
            let sig_ok = check_ecdsa_signature(msg_hash, rules.session_pubkey, sig_r, sig_s);
            assert(sig_ok, 'BAD_SIG');

            // Contract allowlist.
            assert(self.allowed_contract.read((link_id, target)), 'CONTRACT_NOT_ALLOWED');
            // Selector allowlist.
            assert(self.allowed_selector.read((link_id, target, selector)), 'SELECTOR_NOT_ALLOWED');

            // Destination + amount decoding for ERC20 transfer/approve shapes:
            //   transfer(recipient, amount) -> [recipient, amount_lo, amount_hi]
            //   approve(spender,  amount)   -> [spender,  amount_lo, amount_hi]
            let mut amount: u256 = 0_u256;
            if selector == SELECTOR_TRANSFER || selector == SELECTOR_APPROVE {
                assert(calldata.len() == 3, 'BAD_ERC20_CALLDATA');
                let dest_felt = *calldata.at(0);
                let dest: ContractAddress = dest_felt.try_into().expect('BAD_DEST_ADDR');
                assert(self.allowed_destination.read((link_id, dest)), 'DEST_NOT_ALLOWED');
                let amt_lo: u128 = (*calldata.at(1)).try_into().expect('BAD_AMT_LO');
                let amt_hi: u128 = (*calldata.at(2)).try_into().expect('BAD_AMT_HI');
                amount = u256 { low: amt_lo, high: amt_hi };
                assert(amount <= rules.per_tx_cap, 'PER_TX_CAP');

                let current_spent = self.spent.read(link_id);
                let new_spent = current_spent + amount;
                assert(new_spent <= rules.total_cap, 'TOTAL_CAP');
                self.spent.write(link_id, new_spent);
            }

            // Mark nonce used before external call (CEI).
            self.nonces.write((link_id, nonce), true);

            // Execute the call via syscall. Escrow is msg.sender.
            let _ret = call_contract_syscall(target, selector, calldata.span())
                .expect('CALL_FAILED');

            self.emit(SpendExecuted { link_id, target, selector, amount });
        }

        fn revoke(ref self: ContractState, link_id: u128) {
            let mut rules = self.links.read(link_id);
            assert(rules.session_pubkey != 0, 'UNKNOWN_LINK');
            assert(get_caller_address() == rules.sender, 'NOT_SENDER');
            assert(!rules.revoked, 'ALREADY_REVOKED');

            rules.revoked = true;
            self.links.write(link_id, rules);

            // Refund remainder to sender.
            let spent = self.spent.read(link_id);
            let remainder = if rules.total_cap > spent {
                rules.total_cap - spent
            } else {
                0_u256
            };
            if remainder > 0_u256 {
                let token = IERC20Dispatcher { contract_address: rules.funding_token };
                let ok = token.transfer(rules.sender, remainder);
                assert(ok, 'REFUND_FAILED');
            }

            self.emit(Event::LinkRevoked(LinkRevoked { link_id, refund_amount: remainder }));
        }

        fn remaining(self: @ContractState, link_id: u128) -> u256 {
            let rules = self.links.read(link_id);
            let spent = self.spent.read(link_id);
            if rules.total_cap > spent {
                rules.total_cap - spent
            } else {
                0_u256
            }
        }

        fn get_rules(self: @ContractState, link_id: u128) -> LinkRules {
            self.links.read(link_id)
        }

        fn is_allowed_contract(
            self: @ContractState, link_id: u128, addr: ContractAddress,
        ) -> bool {
            self.allowed_contract.read((link_id, addr))
        }

        fn is_allowed_selector(
            self: @ContractState, link_id: u128, addr: ContractAddress, sel: felt252,
        ) -> bool {
            self.allowed_selector.read((link_id, addr, sel))
        }

        fn is_allowed_destination(
            self: @ContractState, link_id: u128, addr: ContractAddress,
        ) -> bool {
            self.allowed_destination.read((link_id, addr))
        }

        fn nonce_used(self: @ContractState, link_id: u128, nonce: felt252) -> bool {
            self.nonces.read((link_id, nonce))
        }
    }
}
