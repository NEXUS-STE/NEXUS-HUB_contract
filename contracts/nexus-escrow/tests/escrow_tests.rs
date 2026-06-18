// contracts/nexus-escrow/tests/escrow_tests.rs
//
// Full integration test suite for NexusEscrow.
// Run with: cargo test --features testutils

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Bytes, Env, String,
};

use nexus_escrow::{NexusEscrow, NexusEscrowClient};
use nexus_escrow::errors::EscrowError;

// ─── Test Helpers ─────────────────────────────────────────────────────────────
//
// In soroban-sdk v21, generated client methods have two forms:
//   method(...)         — panics on contract error, returns the success value (T)
//   try_method(...)     — returns Result<Result<T, ConvErr>, Result<E, InvokeError>>
//                         On contract error: Err(Ok(EscrowError::X))
//
// Use plain methods for happy-path assertions; try_ variants for error assertions.

struct TestEnv {
    env: Env,
    contract_id: Address,
    token: Address,
    admin: Address,
    client: Address,
    freelancer: Address,
}

impl TestEnv {
    fn contract(&self) -> NexusEscrowClient<'_> {
        NexusEscrowClient::new(&self.env, &self.contract_id)
    }
}

fn make_escrow_id(env: &Env, s: &str) -> Bytes {
    Bytes::from_slice(env, s.as_bytes())
}

fn make_description(env: &Env, s: &str) -> String {
    String::from_str(env, s)
}

fn make_milestone_hash(env: &Env) -> Bytes {
    Bytes::from_slice(env, &[0xABu8; 32])
}

fn setup() -> TestEnv {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token = token_id.address();
    StellarAssetClient::new(&env, &token).mint(&client_addr, &1_000_000_000);

    let contract_id = env.register_contract(None, NexusEscrow);
    NexusEscrowClient::new(&env, &contract_id).initialize(&admin, &100u32);

    TestEnv { env, contract_id, token, admin, client: client_addr, freelancer: freelancer_addr }
}

/// Init and fund in one step, returning the escrow_id Bytes.
fn init_and_fund(t: &TestEnv, id: &str, amount: i128) -> Bytes {
    let escrow_id = make_escrow_id(&t.env, id);
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, id),
        &0u32, &0u32, &0u32,
    );
    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &amount, &10000u32);
    t.contract().fund(&escrow_id);
    escrow_id
}

// ─── Initialization Tests ─────────────────────────────────────────────────────

#[test]
fn test_initialize_success() {
    let t = setup();
    assert_eq!(t.contract().get_fee_bps(), 100);
    assert!(!t.contract().get_paused());
}

#[test]
fn test_initialize_twice_fails() {
    let t = setup();
    let result = t.contract().try_initialize(&t.admin, &100u32);
    assert_eq!(result, Err(Ok(EscrowError::AlreadyExists)));
}

#[test]
fn test_fee_cap_enforced() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, NexusEscrow);
    let contract = NexusEscrowClient::new(&env, &contract_id);

    let result = contract.try_initialize(&admin, &1_100u32);
    assert_eq!(result, Err(Ok(EscrowError::FeeTooHigh)));
}

// ─── Escrow Init Tests ────────────────────────────────────────────────────────

#[test]
fn test_init_escrow_success() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "escrow-001");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token,
        &100_000_000i128,
        &make_milestone_hash(&t.env),
        &make_description(&t.env, "Build landing page"),
        &0u32, &0u32, &0u32,
    );

    let record = t.contract().get_escrow(&escrow_id);
    assert_eq!(record.amount, 100_000_000);
    assert_eq!(record.platform_fee, 1_000_000); // 1% of 10 USDC
}

#[test]
fn test_init_escrow_duplicate_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "escrow-dup");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token,
        &100_000_000i128, &make_milestone_hash(&t.env),
        &make_description(&t.env, "First"), &0u32, &0u32, &0u32,
    );

    let result = t.contract().try_init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token,
        &100_000_000i128, &make_milestone_hash(&t.env),
        &make_description(&t.env, "Second"), &0u32, &0u32, &0u32,
    );
    assert_eq!(result, Err(Ok(EscrowError::AlreadyExists)));
}

#[test]
fn test_init_escrow_zero_amount_fails() {
    let t = setup();
    let result = t.contract().try_init_escrow(
        &make_escrow_id(&t.env, "zero"),
        &t.client, &t.freelancer, &t.token, &0i128,
        &make_milestone_hash(&t.env),
        &make_description(&t.env, "Bad amount"),
        &0u32, &0u32, &0u32,
    );
    assert_eq!(result, Err(Ok(EscrowError::InvalidAmount)));
}

// ─── Fund Tests ───────────────────────────────────────────────────────────────

#[test]
fn test_fund_success() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "fund-001");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token,
        &100_000_000i128, &make_milestone_hash(&t.env),
        &make_description(&t.env, "Design work"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let record = t.contract().get_escrow(&escrow_id);
    assert_eq!(record.funded_ledger, t.env.ledger().sequence());
}

#[test]
fn test_fund_wrong_status_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "fund-bad-status");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token,
        &100_000_000i128, &make_milestone_hash(&t.env),
        &make_description(&t.env, "Test"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &200_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let result = t.contract().try_fund(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::InvalidStatus)));
}

// ─── Release Tests ────────────────────────────────────────────────────────────

#[test]
fn test_release_success() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "release-001");
    let amount = 100_000_000i128;

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, "API dev"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &amount, &10000u32);
    t.contract().fund(&escrow_id);

    let before = token_client.balance(&t.freelancer);
    t.contract().release(&escrow_id, &None);
    let after = token_client.balance(&t.freelancer);
    assert_eq!(after - before, 99_000_000); // amount - 1% fee
}

#[test]
fn test_release_with_correct_milestone_hash() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "release-hash");
    let hash = make_milestone_hash(&t.env);

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &hash, &make_description(&t.env, "With hash check"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    t.contract().release(&escrow_id, &Some(hash));
}

#[test]
fn test_release_with_wrong_milestone_hash_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "release-hash-bad");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Hash check"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let wrong_hash = Bytes::from_slice(&t.env, &[0xFFu8; 32]);
    let result = t.contract().try_release(&escrow_id, &Some(wrong_hash));
    assert_eq!(result, Err(Ok(EscrowError::MilestoneHashMismatch)));
}

// ─── Refund Tests ─────────────────────────────────────────────────────────────

#[test]
fn test_refund_by_admin() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "refund-001");
    let amount = 50_000_000i128;

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Refund test"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &amount, &10000u32);
    t.contract().fund(&escrow_id);

    let before = token_client.balance(&t.client);
    t.contract().refund(&escrow_id);
    let after = token_client.balance(&t.client);
    assert_eq!(after - before, amount); // full amount back, no fee on refund
}

// ─── Dispute Tests ────────────────────────────────────────────────────────────

#[test]
fn test_client_can_raise_dispute_immediately() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "dispute-client");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Dispute test"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    t.contract().raise_dispute(&escrow_id, &t.client);
}

#[test]
fn test_freelancer_cannot_raise_dispute_before_deadline() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "dispute-early");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Early dispute"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let result = t.contract().try_raise_dispute(&escrow_id, &t.freelancer);
    assert_eq!(result, Err(Ok(EscrowError::DisputeNotReady)));
}

#[test]
fn test_freelancer_can_raise_dispute_after_deadline() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "dispute-late");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Late dispute"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    // Fast-forward past dispute deadline (MIN_DISPUTE_DELAY = 43_200 ledgers)
    t.env.ledger().set(LedgerInfo {
        sequence_number: t.env.ledger().sequence() + 50_000,
        timestamp: t.env.ledger().timestamp() + 300_000,
        ..t.env.ledger().get()
    });

    t.contract().raise_dispute(&escrow_id, &t.freelancer);
}

#[test]
fn test_dispute_resolve_in_favour_of_freelancer() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "resolve-freelancer");
    let amount = 100_000_000i128;

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Resolve to freelancer"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &amount, &10000u32);
    t.contract().fund(&escrow_id);
    t.contract().raise_dispute(&escrow_id, &t.client);

    let before = token_client.balance(&t.freelancer);
    t.contract().resolve_dispute(&escrow_id, &true);
    let after = token_client.balance(&t.freelancer);
    assert_eq!(after - before, 99_000_000); // minus 1% fee
}

#[test]
fn test_dispute_resolve_in_favour_of_client() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "resolve-client");
    let amount = 100_000_000i128;

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Resolve to client"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &amount, &10000u32);
    t.contract().fund(&escrow_id);
    t.contract().raise_dispute(&escrow_id, &t.client);

    let before = token_client.balance(&t.client);
    t.contract().resolve_dispute(&escrow_id, &false);
    let after = token_client.balance(&t.client);
    assert_eq!(after - before, amount); // full refund, no fee
}

// ─── Pause Tests ──────────────────────────────────────────────────────────────

#[test]
fn test_paused_contract_blocks_operations() {
    let t = setup();
    t.contract().set_paused(&true);

    let result = t.contract().try_init_escrow(
        &make_escrow_id(&t.env, "paused"),
        &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Should fail"), &0u32, &0u32, &0u32,
    );
    assert_eq!(result, Err(Ok(EscrowError::ContractPaused)));
}

#[test]
fn test_unpause_restores_operations() {
    let t = setup();
    t.contract().set_paused(&true);
    t.contract().set_paused(&false);

    t.contract().init_escrow(
        &make_escrow_id(&t.env, "unpaused"),
        &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Should work"), &0u32, &0u32, &0u32,
    );
}

// ─── Cancel Tests ─────────────────────────────────────────────────────────────

#[test]
fn test_cancel_pending_escrow() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "cancel-001");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Cancel test"), &0u32, &0u32, &0u32,
    );

    t.contract().cancel(&escrow_id);
}

#[test]
fn test_cancel_funded_escrow_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "cancel-funded");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Already funded"), &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let result = t.contract().try_cancel(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::InvalidStatus)));
}

// ─── Fee Computation Tests ────────────────────────────────────────────────────

#[test]
fn test_compute_fee_view() {
    let t = setup();
    let fee = t.contract().compute_fee(&100_000_000i128);
    assert_eq!(fee, 1_000_000); // 1% of 100_000_000
}

#[test]
fn test_update_fee_by_admin() {
    let t = setup();
    t.contract().set_fee(&200u32); // 2%
    assert_eq!(t.contract().get_fee_bps(), 200);
}

// ─── Feature 1: Milestone Progress Tests ─────────────────────────────────────

#[test]
fn test_complete_milestone_success() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "ms-success");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Milestone test"),
        &0u32, &3u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    t.contract().complete_milestone(&escrow_id);

    let record = t.contract().get_escrow(&escrow_id);
    assert_eq!(record.milestones_completed, 1);
    assert_eq!(record.milestones_total, 3);
}

#[test]
fn test_complete_milestone_increments_correctly() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "ms-incr");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Three milestones"),
        &0u32, &3u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    t.contract().complete_milestone(&escrow_id);
    t.contract().complete_milestone(&escrow_id);
    t.contract().complete_milestone(&escrow_id);

    let record = t.contract().get_escrow(&escrow_id);
    assert_eq!(record.milestones_completed, 3);
}

#[test]
fn test_complete_milestone_all_done_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "ms-all-done");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Three milestones"),
        &0u32, &3u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    t.contract().complete_milestone(&escrow_id);
    t.contract().complete_milestone(&escrow_id);
    t.contract().complete_milestone(&escrow_id);

    // 4th call must fail
    let result = t.contract().try_complete_milestone(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::AllMilestonesComplete)));
}

#[test]
fn test_complete_milestone_wrong_status_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "ms-bad-status");

    // Create but do NOT fund — status remains Pending
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Pending"),
        &0u32, &3u32, &0u32,
    );

    let result = t.contract().try_complete_milestone(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::InvalidStatus)));
}

#[test]
fn test_complete_milestone_no_milestones_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "ms-none");

    // milestones_total = 0 disables milestone tracking
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "No milestones"),
        &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let result = t.contract().try_complete_milestone(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::InvalidMilestone)));
}

// ─── Feature 2: Escrow Expiry Tests ──────────────────────────────────────────

#[test]
fn test_claim_expired_success() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "exp-success");
    let amount = 100_000_000i128;

    // Set expiry_ledger to current sequence + 100; we will advance past it.
    let expiry = t.env.ledger().sequence() + 100;
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Expiry test"),
        &0u32, &0u32, &expiry,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &amount, &10000u32);
    t.contract().fund(&escrow_id);

    // Advance ledger past the expiry
    t.env.ledger().set(LedgerInfo {
        sequence_number: t.env.ledger().sequence() + 200,
        timestamp: t.env.ledger().timestamp() + 1_200,
        ..t.env.ledger().get()
    });

    let before = token_client.balance(&t.client);
    t.contract().claim_expired(&escrow_id);
    let after = token_client.balance(&t.client);
    assert_eq!(after - before, amount);
}

#[test]
fn test_claim_expired_too_early_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "exp-early");

    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Far expiry"),
        &0u32, &0u32, &10_000u32, // expiry far in the future
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let result = t.contract().try_claim_expired(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::EscrowNotExpired)));
}

#[test]
fn test_claim_expired_no_expiry_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "exp-none");

    // expiry_ledger = 0 means no expiry set
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "No expiry"),
        &0u32, &0u32, &0u32,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    token_client.approve(&t.client, &t.contract_id, &100_000_000i128, &10000u32);
    t.contract().fund(&escrow_id);

    let result = t.contract().try_claim_expired(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::EscrowNotExpired)));
}

#[test]
fn test_claim_expired_wrong_status_fails() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "exp-status");

    // Pending status — not Funded or Active
    let expiry = t.env.ledger().sequence() + 1;
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &100_000_000i128,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Wrong status"),
        &0u32, &0u32, &expiry,
    );

    // Advance past expiry without funding
    t.env.ledger().set(LedgerInfo {
        sequence_number: t.env.ledger().sequence() + 200,
        timestamp: t.env.ledger().timestamp() + 1_200,
        ..t.env.ledger().get()
    });

    let result = t.contract().try_claim_expired(&escrow_id);
    assert_eq!(result, Err(Ok(EscrowError::InvalidStatus)));
}

#[test]
fn test_claim_expired_anyone_can_trigger() {
    let t = setup();
    let escrow_id = make_escrow_id(&t.env, "exp-anyone");
    let amount = 100_000_000i128;

    let expiry = t.env.ledger().sequence() + 50;
    t.contract().init_escrow(
        &escrow_id, &t.client, &t.freelancer, &t.token, &amount,
        &make_milestone_hash(&t.env), &make_description(&t.env, "Anyone can claim"),
        &0u32, &0u32, &expiry,
    );

    let token_client = TokenClient::new(&t.env, &t.token);
    let balance_before_fund = token_client.balance(&t.client);
    token_client.approve(&t.client, &t.contract_id, &amount, &(t.env.ledger().sequence() + 10000));
    t.contract().fund(&escrow_id);

    // Advance past expiry
    t.env.ledger().set(LedgerInfo {
        sequence_number: t.env.ledger().sequence() + 200,
        timestamp: t.env.ledger().timestamp() + 1_200,
        ..t.env.ledger().get()
    });

    // claim_expired requires no auth — succeeds regardless of caller identity
    t.contract().claim_expired(&escrow_id);

    // Client received all funds back — net balance equals pre-funding balance
    let balance_after_claim = token_client.balance(&t.client);
    assert_eq!(balance_after_claim, balance_before_fund);
}

// ─── Feature 3: Multi-sig Release Tests ──────────────────────────────────────

#[test]
fn test_approve_release_client_first() {
    let t = setup();
    let amount = 100_000_000i128;
    let escrow_id = init_and_fund(&t, "multisig-cf", amount);
    let token_client = TokenClient::new(&t.env, &t.token);

    // Client approves first — no release yet
    t.contract().approve_release(&escrow_id, &t.client);
    let record = t.contract().get_escrow(&escrow_id);
    assert!(record.client_approved);
    assert!(!record.freelancer_approved);
    assert_eq!(token_client.balance(&t.freelancer), 0);

    // Freelancer approves — triggers release
    let before = token_client.balance(&t.freelancer);
    t.contract().approve_release(&escrow_id, &t.freelancer);
    let after = token_client.balance(&t.freelancer);
    assert_eq!(after - before, 99_000_000); // amount - 1% fee
}

#[test]
fn test_approve_release_freelancer_first() {
    let t = setup();
    let amount = 100_000_000i128;
    let escrow_id = init_and_fund(&t, "multisig-ff", amount);
    let token_client = TokenClient::new(&t.env, &t.token);

    // Freelancer approves first — no release
    t.contract().approve_release(&escrow_id, &t.freelancer);
    assert_eq!(token_client.balance(&t.freelancer), 0);

    // Client approves second — triggers release
    let before = token_client.balance(&t.freelancer);
    t.contract().approve_release(&escrow_id, &t.client);
    let after = token_client.balance(&t.freelancer);
    assert_eq!(after - before, 99_000_000);
}

#[test]
fn test_approve_release_single_approval_no_release() {
    let t = setup();
    let amount = 100_000_000i128;
    let escrow_id = init_and_fund(&t, "multisig-single", amount);
    let token_client = TokenClient::new(&t.env, &t.token);

    // Only client approves — no release triggered
    t.contract().approve_release(&escrow_id, &t.client);

    let record = t.contract().get_escrow(&escrow_id);
    use nexus_escrow::types::EscrowStatus;
    assert_eq!(record.status, EscrowStatus::Funded);
    assert_eq!(token_client.balance(&t.freelancer), 0);
}

#[test]
fn test_approve_release_unauthorized_fails() {
    let t = setup();
    let escrow_id = init_and_fund(&t, "multisig-unauth", 100_000_000i128);

    let stranger = Address::generate(&t.env);
    let result = t.contract().try_approve_release(&escrow_id, &stranger);
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

#[test]
fn test_approve_release_wrong_status_fails() {
    let t = setup();
    let amount = 100_000_000i128;
    let escrow_id = init_and_fund(&t, "multisig-status", amount);

    // Release via normal path first
    t.contract().release(&escrow_id, &None);

    // approve_release on a Released escrow must fail
    let result = t.contract().try_approve_release(&escrow_id, &t.client);
    assert_eq!(result, Err(Ok(EscrowError::InvalidStatus)));
}

#[test]
fn test_approve_release_idempotent_approval() {
    let t = setup();
    let amount = 100_000_000i128;
    let escrow_id = init_and_fund(&t, "multisig-idem", amount);

    // Both parties approve → Released
    t.contract().approve_release(&escrow_id, &t.client);
    t.contract().approve_release(&escrow_id, &t.freelancer);

    // Escrow is now Released. A second approval attempt must fail with InvalidStatus.
    let result = t.contract().try_approve_release(&escrow_id, &t.client);
    assert_eq!(result, Err(Ok(EscrowError::InvalidStatus)));
}
