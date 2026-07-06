// contracts/nexus-escrow/src/lib.rs
//
// NexusEscrow — Non-custodial escrow contract for NEXUS-HUB on Stellar/Soroban.
//
// Lifecycle:
//   initialize → fund → [activate] → release
//                              ↘ dispute → resolve (admin)
//                  ↘ refund (admin or pre-fund cancel)
//
// The contract holds SAC tokens (USDC) in its own address.
// No private keys are custodied — only the contract's auth rules govern access.

#![no_std]
#![allow(clippy::too_many_arguments)]

pub mod errors;
mod events;
mod storage;
pub mod types;

use soroban_sdk::{
    contract, contractimpl, token, Address, Bytes, Env, String,
};

use errors::EscrowError;
use events::*;
use storage::*;
use types::{EscrowRecord, EscrowStatus};

// ─── Constants ────────────────────────────────────────────────────────────────

/// Platform fee can never exceed 10% (1000 bps).
const MAX_FEE_BPS: u32 = 1_000;

/// Minimum ledger gap before a freelancer can open a dispute unilaterally
/// (~3 days at 6s/ledger = 43_200 ledgers).
const MIN_DISPUTE_DELAY: u32 = 43_200;

/// Maximum extra dispute delay on top of MIN_DISPUTE_DELAY (~180 days).
const MAX_EXTRA_DISPUTE_DELAY: u32 = 2_592_000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

fn compute_fee(amount: i128, fee_bps: u32) -> i128 {
    amount * (fee_bps as i128) / 10_000
}

fn transfer_token(env: &Env, token: &Address, from: &Address, to: &Address, amount: i128) {
    token::Client::new(env, token).transfer(from, to, &amount);
}

/// Execute the release payment: freelancer gets amount minus fee, admin gets fee.
fn do_release(env: &Env, record: &EscrowRecord) {
    let contract_addr = env.current_contract_address();
    let freelancer_amount = record.amount - record.platform_fee;
    transfer_token(env, &record.token, &contract_addr, &record.freelancer, freelancer_amount);
    if record.platform_fee > 0 {
        transfer_token(env, &record.token, &contract_addr, &record.admin, record.platform_fee);
    }
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct NexusEscrow;

#[contractimpl]
impl NexusEscrow {
    // ── Admin: initialise contract ──────────────────────────────────────────

    /// Deploy-time setup. Must be called once immediately after deployment.
    ///
    /// * `admin`   — Address that can arbitrate disputes and update fees.
    /// * `fee_bps` — Platform fee in basis points (100 = 1%). Capped at 1000 (10%).
    pub fn initialize(env: Env, admin: Address, fee_bps: u32) -> Result<(), EscrowError> {
        bump_instance(&env);
        if env.storage().persistent().has(&types::DataKey::Admin) {
            return Err(EscrowError::AlreadyExists);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(EscrowError::FeeTooHigh);
        }
        admin.require_auth();
        set_admin(&env, &admin);
        set_fee_bps(&env, fee_bps);
        set_paused(&env, false);
        Ok(())
    }

    // ── Admin: update fee ──────────────────────────────────────────────────

    /// Update the platform fee. Only callable by admin.
    pub fn set_fee(env: Env, new_fee_bps: u32) -> Result<(), EscrowError> {
        bump_instance(&env);
        let admin = get_admin(&env)?;
        admin.require_auth();
        if new_fee_bps > MAX_FEE_BPS {
            return Err(EscrowError::FeeTooHigh);
        }
        set_fee_bps(&env, new_fee_bps);
        Ok(())
    }

    // ── Admin: emergency pause ─────────────────────────────────────────────

    /// Pause or unpause all escrow operations. Only callable by admin.
    pub fn set_paused(env: Env, paused: bool) -> Result<(), EscrowError> {
        bump_instance(&env);
        let admin = get_admin(&env)?;
        admin.require_auth();
        storage::set_paused(&env, paused);
        Ok(())
    }

    // ── Admin: transfer admin ──────────────────────────────────────────────

    /// Hand off admin privileges to a new address. Current admin must authorise.
    pub fn transfer_admin(env: Env, new_admin: Address) -> Result<(), EscrowError> {
        bump_instance(&env);
        let old_admin = get_admin(&env)?;
        old_admin.require_auth();
        set_admin(&env, &new_admin);
        emit_admin_transferred(&env, &old_admin, &new_admin);
        Ok(())
    }

    // ── Escrow: initialise ─────────────────────────────────────────────────

    /// Create a new escrow record. Does NOT move tokens yet — call `fund` next.
    ///
    /// * `escrow_id`        — Off-chain UUID as bytes (must be unique).
    /// * `client`           — Address funding the escrow.
    /// * `freelancer`       — Address that will receive payment on release.
    /// * `token`            — SAC token contract (USDC recommended).
    /// * `amount`           — Total amount to escrow (in token's smallest unit).
    /// * `milestone_hash`   — SHA-256 of the deliverable spec, for on-chain audit.
    /// * `description`      — Short human-readable label.
    /// * `dispute_delay`    — Extra ledgers beyond MIN_DISPUTE_DELAY (max 2_592_000).
    /// * `milestones_total` — Number of milestones for progress tracking; 0 disables.
    /// * `expiry_ledger`    — Absolute ledger for permissionless timeout; 0 disables.
    pub fn init_escrow(
        env: Env,
        escrow_id: Bytes,
        client: Address,
        freelancer: Address,
        token: Address,
        amount: i128,
        milestone_hash: Bytes,
        description: String,
        dispute_delay: u32,
        milestones_total: u32,
        expiry_ledger: u32,
    ) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if dispute_delay > MAX_EXTRA_DISPUTE_DELAY {
            return Err(EscrowError::InvalidDelay);
        }
        if expiry_ledger > 0 && expiry_ledger <= env.ledger().sequence() {
            return Err(EscrowError::InvalidExpiry);
        }
        if escrow_exists(&env, &escrow_id) {
            return Err(EscrowError::AlreadyExists);
        }

        client.require_auth();

        let fee_bps = get_fee_bps(&env);
        let platform_fee = compute_fee(amount, fee_bps);

        if platform_fee >= amount {
            return Err(EscrowError::FeeTooHigh);
        }

        let admin = get_admin(&env)?;
        let deadline = env.ledger().sequence() + MIN_DISPUTE_DELAY + dispute_delay;

        let record = EscrowRecord {
            escrow_id: escrow_id.clone(),
            client: client.clone(),
            freelancer: freelancer.clone(),
            admin,
            token,
            amount,
            platform_fee,
            status: EscrowStatus::Pending,
            milestone_hash,
            dispute_deadline_ledger: deadline,
            funded_ledger: 0,
            milestones_total,
            milestones_completed: 0,
            expiry_ledger,
            client_approved: false,
            freelancer_approved: false,
            description,
        };

        save_escrow(&env, &record);
        emit_initialized(&env, &escrow_id, &client, &freelancer, amount);
        Ok(())
    }

    // ── Escrow: fund ──────────────────────────────────────────────────────

    /// Client deposits tokens into the contract. Status: Pending → Funded.
    pub fn fund(env: Env, escrow_id: Bytes) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Pending {
            return Err(EscrowError::InvalidStatus);
        }

        record.client.require_auth();

        let contract_addr = env.current_contract_address();
        transfer_token(&env, &record.token, &record.client, &contract_addr, record.amount);

        let ledger = env.ledger().sequence();
        record.status = EscrowStatus::Funded;
        record.funded_ledger = ledger;
        save_escrow(&env, &record);

        emit_funded(&env, &escrow_id, &record.client, record.amount, ledger);
        Ok(())
    }

    // ── Escrow: activate ──────────────────────────────────────────────────

    /// Client acknowledges work has started. Status: Funded → Active.
    /// Optional step — release can be called directly from Funded.
    pub fn activate(env: Env, escrow_id: Bytes) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidStatus);
        }

        record.client.require_auth();
        record.status = EscrowStatus::Active;
        save_escrow(&env, &record);

        emit_activated(&env, &escrow_id, env.ledger().sequence());
        Ok(())
    }

    // ── Escrow: release ───────────────────────────────────────────────────

    /// Client approves work and releases funds. Status: Funded|Active → Released.
    /// Optionally verifies the milestone hash if `expected_hash` is provided.
    pub fn release(
        env: Env,
        escrow_id: Bytes,
        expected_hash: Option<Bytes>,
    ) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Funded && record.status != EscrowStatus::Active {
            return Err(EscrowError::InvalidStatus);
        }

        record.client.require_auth();

        if let Some(hash) = expected_hash {
            if hash != record.milestone_hash {
                return Err(EscrowError::MilestoneHashMismatch);
            }
        }

        let freelancer_amount = record.amount - record.platform_fee;
        do_release(&env, &record);

        record.status = EscrowStatus::Released;
        save_escrow(&env, &record);

        emit_released(&env, &escrow_id, &record.freelancer, freelancer_amount, record.platform_fee);
        Ok(())
    }

    // ── Escrow: refund ────────────────────────────────────────────────────

    /// Return full escrow amount to client. Only admin can call this.
    /// No platform fee is deducted on refund. Valid from: Funded, Active, or Disputed.
    pub fn refund(env: Env, escrow_id: Bytes) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        let allowed = matches!(
            record.status,
            EscrowStatus::Funded | EscrowStatus::Active | EscrowStatus::Disputed
        );
        if !allowed {
            return Err(EscrowError::InvalidStatus);
        }

        record.admin.require_auth();

        let contract_addr = env.current_contract_address();
        transfer_token(&env, &record.token, &contract_addr, &record.client, record.amount);

        record.status = EscrowStatus::Refunded;
        save_escrow(&env, &record);

        emit_refunded(&env, &escrow_id, &record.client, record.amount);
        Ok(())
    }

    // ── Escrow: cancel ────────────────────────────────────────────────────

    /// Cancel a Pending escrow before any tokens are deposited.
    /// `caller` must be either the client or the admin.
    pub fn cancel(env: Env, escrow_id: Bytes, caller: Address) -> Result<(), EscrowError> {
        bump_instance(&env);
        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Pending {
            return Err(EscrowError::InvalidStatus);
        }

        caller.require_auth();

        if caller != record.client && caller != record.admin {
            return Err(EscrowError::Unauthorized);
        }

        record.status = EscrowStatus::Cancelled;
        save_escrow(&env, &record);

        emit_cancelled(&env, &escrow_id);
        Ok(())
    }

    // ── Escrow: raise dispute ─────────────────────────────────────────────

    /// Either party raises a dispute. Status: Funded|Active → Disputed.
    /// Client may dispute freely. Freelancer may only dispute after dispute_deadline_ledger.
    /// Pending 2-of-2 approvals are cleared on dispute to prevent stale releases.
    pub fn raise_dispute(env: Env, escrow_id: Bytes, caller: Address) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Funded && record.status != EscrowStatus::Active {
            return Err(EscrowError::InvalidStatus);
        }

        caller.require_auth();

        let is_client = caller == record.client;
        let is_freelancer = caller == record.freelancer;

        if !is_client && !is_freelancer {
            return Err(EscrowError::Unauthorized);
        }

        if is_freelancer && env.ledger().sequence() < record.dispute_deadline_ledger {
            return Err(EscrowError::DisputeNotReady);
        }

        // Clear any pending 2-of-2 approvals so they cannot trigger a release
        // after the dispute is resolved via resolve_dispute.
        record.client_approved = false;
        record.freelancer_approved = false;

        record.status = EscrowStatus::Disputed;
        save_escrow(&env, &record);

        emit_disputed(&env, &escrow_id, &caller);
        Ok(())
    }

    // ── Escrow: resolve dispute ───────────────────────────────────────────

    /// Admin resolves a dispute.
    /// `release_to_freelancer = true`  → funds go to freelancer (minus fee).
    /// `release_to_freelancer = false` → full amount returned to client.
    pub fn resolve_dispute(
        env: Env,
        escrow_id: Bytes,
        release_to_freelancer: bool,
    ) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Disputed {
            return Err(EscrowError::InvalidStatus);
        }

        record.admin.require_auth();

        let contract_addr = env.current_contract_address();

        if release_to_freelancer {
            let freelancer_amount = record.amount - record.platform_fee;
            transfer_token(&env, &record.token, &contract_addr, &record.freelancer, freelancer_amount);
            if record.platform_fee > 0 {
                transfer_token(&env, &record.token, &contract_addr, &record.admin, record.platform_fee);
            }
            record.status = EscrowStatus::Released;
            save_escrow(&env, &record);
            emit_dispute_resolved(&env, &escrow_id, &record.freelancer);
        } else {
            transfer_token(&env, &record.token, &contract_addr, &record.client, record.amount);
            record.status = EscrowStatus::Refunded;
            save_escrow(&env, &record);
            emit_dispute_resolved(&env, &escrow_id, &record.client);
        }

        Ok(())
    }

    // ── Escrow: complete milestone ────────────────────────────────────────

    /// Freelancer marks one milestone complete. Status must be Funded or Active.
    /// Escrow must have been created with milestones_total > 0.
    pub fn complete_milestone(env: Env, escrow_id: Bytes) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Funded && record.status != EscrowStatus::Active {
            return Err(EscrowError::InvalidStatus);
        }

        record.freelancer.require_auth();

        if record.milestones_total == 0 {
            return Err(EscrowError::InvalidMilestone);
        }
        if record.milestones_completed >= record.milestones_total {
            return Err(EscrowError::AllMilestonesComplete);
        }

        record.milestones_completed += 1;
        save_escrow(&env, &record);
        emit_milestone_completed(&env, &escrow_id, record.milestones_completed, record.milestones_total);
        Ok(())
    }

    // ── Escrow: claim expired ─────────────────────────────────────────────

    /// Anyone can call this after expiry_ledger to return funds to the client.
    /// No pause check — this is a safety valve that works even when paused.
    pub fn claim_expired(env: Env, escrow_id: Bytes) -> Result<(), EscrowError> {
        bump_instance(&env);
        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Funded && record.status != EscrowStatus::Active {
            return Err(EscrowError::InvalidStatus);
        }

        if record.expiry_ledger == 0 || env.ledger().sequence() < record.expiry_ledger {
            return Err(EscrowError::EscrowNotExpired);
        }

        let contract_addr = env.current_contract_address();
        transfer_token(&env, &record.token, &contract_addr, &record.client, record.amount);

        record.status = EscrowStatus::Refunded;
        save_escrow(&env, &record);
        emit_refunded(&env, &escrow_id, &record.client, record.amount);
        Ok(())
    }

    // ── Escrow: approve release (2-of-2 multi-sig) ────────────────────────

    /// Client or freelancer submits their approval for release.
    /// When both have approved, funds are automatically released.
    pub fn approve_release(env: Env, escrow_id: Bytes, approver: Address) -> Result<(), EscrowError> {
        bump_instance(&env);
        if is_paused(&env) {
            return Err(EscrowError::ContractPaused);
        }

        let mut record = load_escrow(&env, &escrow_id)?;

        if record.status != EscrowStatus::Funded && record.status != EscrowStatus::Active {
            return Err(EscrowError::InvalidStatus);
        }

        approver.require_auth();

        if approver == record.client {
            record.client_approved = true;
        } else if approver == record.freelancer {
            record.freelancer_approved = true;
        } else {
            return Err(EscrowError::Unauthorized);
        }

        save_escrow(&env, &record);
        emit_approval_recorded(
            &env,
            &escrow_id,
            &approver,
            record.client_approved,
            record.freelancer_approved,
        );

        if record.client_approved && record.freelancer_approved {
            let freelancer_amount = record.amount - record.platform_fee;
            do_release(&env, &record);
            record.status = EscrowStatus::Released;
            save_escrow(&env, &record);
            emit_released(&env, &escrow_id, &record.freelancer, freelancer_amount, record.platform_fee);
        }

        Ok(())
    }

    // ── Views ─────────────────────────────────────────────────────────────

    /// Read the current state of an escrow. Does not require auth.
    pub fn get_escrow(env: Env, escrow_id: Bytes) -> Result<EscrowRecord, EscrowError> {
        load_escrow(&env, &escrow_id)
    }

    /// Read the current admin address.
    pub fn get_admin(env: Env) -> Result<Address, EscrowError> {
        storage::get_admin(&env)
    }

    /// Read the current platform fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        storage::get_fee_bps(&env)
    }

    /// Check whether the contract is paused.
    pub fn get_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Compute the fee that would be charged for a given amount.
    pub fn compute_fee(env: Env, amount: i128) -> i128 {
        let bps = storage::get_fee_bps(&env);
        crate::compute_fee(amount, bps)
    }
}
