// contracts/nexus-escrow/src/events.rs
//
// Every state transition emits a structured event.
// The NEXUS-HUB worker listens for these via Stellar Horizon event streaming
// and maps them to WebhookEvent values in the TypeScript layer.
//
// Event topic layout: (contract_name, event_name, escrow_id)
// Event data:         variant-specific fields as a map

use soroban_sdk::{symbol_short, Address, Bytes, Env};

/// Emitted when a new escrow is initialised (status: Pending).
/// Maps to → NEXUS-HUB has no direct webhook for this; it's internal.
pub fn emit_initialized(env: &Env, escrow_id: &Bytes, client: &Address, freelancer: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("init"), escrow_id.clone()),
        (client.clone(), freelancer.clone(), amount),
    );
}

/// Emitted when the client deposits tokens and status moves to Funded.
/// Maps to → WebhookEvent::ESCROW_FUNDED
pub fn emit_funded(env: &Env, escrow_id: &Bytes, client: &Address, amount: i128, ledger: u32) {
    env.events().publish(
        (symbol_short!("funded"), escrow_id.clone()),
        (client.clone(), amount, ledger),
    );
}

/// Emitted when the client marks work as started (Funded → Active).
/// Internal signal — no direct webhook mapping.
pub fn emit_activated(env: &Env, escrow_id: &Bytes, ledger: u32) {
    env.events().publish(
        (symbol_short!("active"), escrow_id.clone()),
        ledger,
    );
}

/// Emitted when the client approves the work and funds are sent to the freelancer.
/// Maps to → WebhookEvent::ESCROW_RELEASED
pub fn emit_released(env: &Env, escrow_id: &Bytes, freelancer: &Address, amount: i128, fee: i128) {
    env.events().publish(
        (symbol_short!("released"), escrow_id.clone()),
        (freelancer.clone(), amount, fee),
    );
}

/// Emitted when funds are returned to the client (dispute or admin refund).
/// Maps to → WebhookEvent::ESCROW_REFUNDED
pub fn emit_refunded(env: &Env, escrow_id: &Bytes, client: &Address, amount: i128) {
    env.events().publish(
        (symbol_short!("refunded"), escrow_id.clone()),
        (client.clone(), amount),
    );
}

/// Emitted when a dispute is raised by either party.
/// Maps to → WebhookEvent::DISPUTE_OPENED
pub fn emit_disputed(env: &Env, escrow_id: &Bytes, raised_by: &Address) {
    env.events().publish(
        (symbol_short!("disputed"), escrow_id.clone()),
        raised_by.clone(),
    );
}

/// Emitted when admin resolves a dispute.
/// Maps to → WebhookEvent::DISPUTE_RESOLVED
pub fn emit_dispute_resolved(env: &Env, escrow_id: &Bytes, in_favour_of: &Address) {
    env.events().publish(
        (symbol_short!("resolved"), escrow_id.clone()),
        in_favour_of.clone(),
    );
}

/// Emitted when an escrow is cancelled before funding.
pub fn emit_cancelled(env: &Env, escrow_id: &Bytes) {
    env.events().publish(
        (symbol_short!("cancelled"), escrow_id.clone()),
        (),
    );
}

/// Emitted when the freelancer marks a milestone complete.
pub fn emit_milestone_completed(env: &Env, escrow_id: &Bytes, completed: u32, total: u32) {
    env.events().publish(
        (symbol_short!("ms_done"), escrow_id.clone()),
        (completed, total),
    );
}

/// Emitted on every approve_release call, regardless of whether release triggers.
/// Maps to → internal multi-sig progress signal.
pub fn emit_approval_recorded(
    env: &Env,
    escrow_id: &Bytes,
    approver: &Address,
    client_approved: bool,
    freelancer_approved: bool,
) {
    env.events().publish(
        (symbol_short!("approved"), escrow_id.clone()),
        (approver.clone(), client_approved, freelancer_approved),
    );
}
