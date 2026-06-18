// contracts/nexus-escrow/src/storage.rs

use soroban_sdk::{Bytes, Env};
use crate::types::{DataKey, EscrowRecord};
use crate::errors::EscrowError;

// ─── TTL Constants ────────────────────────────────────────────────────────────
// Soroban charges rent on persistent storage. These constants define
// how many ledgers of TTL we extend on each access.
// ~7 days at 6s/ledger = 100_800 ledgers.

/// Minimum ledgers before we extend TTL (avoid paying on every read).
pub const BUMP_AMOUNT: u32 = 100_800;
/// Target TTL after bump (30 days).
pub const BUMP_TARGET: u32 = 432_000;

// ─── Admin ────────────────────────────────────────────────────────────────────

pub fn set_admin(env: &Env, admin: &soroban_sdk::Address) {
    env.storage().persistent().set(&DataKey::Admin, admin);
    env.storage().persistent().extend_ttl(&DataKey::Admin, BUMP_AMOUNT, BUMP_TARGET);
}

pub fn get_admin(env: &Env) -> Result<soroban_sdk::Address, EscrowError> {
    env.storage()
        .persistent()
        .get::<DataKey, soroban_sdk::Address>(&DataKey::Admin)
        .ok_or(EscrowError::Unauthorized)
}

// ─── Fee ──────────────────────────────────────────────────────────────────────

/// Fee stored as basis points (100 bps = 1%).
pub fn set_fee_bps(env: &Env, bps: u32) {
    env.storage().persistent().set(&DataKey::FeeBps, &bps);
    env.storage().persistent().extend_ttl(&DataKey::FeeBps, BUMP_AMOUNT, BUMP_TARGET);
}

pub fn get_fee_bps(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get::<DataKey, u32>(&DataKey::FeeBps)
        .unwrap_or(100) // default 1%
}

// ─── Paused flag ──────────────────────────────────────────────────────────────

pub fn set_paused(env: &Env, paused: bool) {
    env.storage().persistent().set(&DataKey::Paused, &paused);
    env.storage().persistent().extend_ttl(&DataKey::Paused, BUMP_AMOUNT, BUMP_TARGET);
}

pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .persistent()
        .get::<DataKey, bool>(&DataKey::Paused)
        .unwrap_or(false)
}

// ─── Contract instance ───────────────────────────────────────────────────────

/// Extend the contract instance TTL on every entrypoint so the contract never
/// gets archived while active escrows exist.
pub fn bump_instance(env: &Env) {
    env.storage().instance().extend_ttl(BUMP_AMOUNT, BUMP_TARGET);
}

// ─── Escrow ───────────────────────────────────────────────────────────────────

pub fn save_escrow(env: &Env, record: &EscrowRecord) {
    let key = DataKey::Escrow(record.escrow_id.clone());
    env.storage().persistent().set(&key, record);
    env.storage().persistent().extend_ttl(&key, BUMP_AMOUNT, BUMP_TARGET);
}

pub fn load_escrow(env: &Env, escrow_id: &Bytes) -> Result<EscrowRecord, EscrowError> {
    let key = DataKey::Escrow(escrow_id.clone());
    let record = env
        .storage()
        .persistent()
        .get::<DataKey, EscrowRecord>(&key)
        .ok_or(EscrowError::EscrowNotFound)?;

    // Bump TTL on every access so active escrows never expire.
    env.storage().persistent().extend_ttl(&key, BUMP_AMOUNT, BUMP_TARGET);
    Ok(record)
}

pub fn escrow_exists(env: &Env, escrow_id: &Bytes) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Escrow(escrow_id.clone()))
}
