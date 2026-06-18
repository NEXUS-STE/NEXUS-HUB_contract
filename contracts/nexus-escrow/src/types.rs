// contracts/nexus-escrow/src/types.rs

use soroban_sdk::{contracttype, Address, Bytes, String};

// ─── Storage Keys ─────────────────────────────────────────────────────────────

/// Top-level storage key variants.
/// Persistent keys survive ledger TTL extension; Temporary keys do not.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Admin address — stored once at init.
    Admin,
    /// Platform fee basis points (e.g. 100 = 1%). Stored at init, updatable by admin.
    FeeBps,
    /// Whether the contract is paused (emergency stop).
    Paused,
    /// Escrow record indexed by its off-chain UUID bytes.
    Escrow(Bytes),
}

// ─── Escrow Status ────────────────────────────────────────────────────────────

/// Mirrors EscrowStatus in packages/shared/src/enums/index.ts exactly.
/// The discriminant values are stable — never renumber.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    /// Initialised but not yet funded.
    Pending = 0,
    /// Token deposit confirmed — funds held by contract.
    Funded = 1,
    /// Work in progress — client has acknowledged start.
    Active = 2,
    /// Disputed — arbitration required before any release.
    Disputed = 3,
    /// Funds released to freelancer.
    Released = 4,
    /// Funds returned to client.
    Refunded = 5,
    /// Cancelled before funding.
    Cancelled = 6,
}

// ─── Core Escrow Record ───────────────────────────────────────────────────────

/// The on-chain state of a single escrow.
/// Stored under DataKey::Escrow(escrow_id).
#[contracttype]
#[derive(Clone, Debug)]
pub struct EscrowRecord {
    /// Off-chain UUID as raw bytes (matches the DB primary key).
    pub escrow_id: Bytes,

    /// Client (payer) Stellar address.
    pub client: Address,

    /// Freelancer (payee) Stellar address.
    pub freelancer: Address,

    /// Platform admin address — can arbitrate disputes.
    pub admin: Address,

    /// SAC token contract address (USDC on Stellar).
    pub token: Address,

    /// Total escrowed amount in stroops (token's smallest unit).
    pub amount: i128,

    /// Platform fee in stroops, deducted on release (not on refund).
    pub platform_fee: i128,

    /// Current lifecycle status.
    pub status: EscrowStatus,

    /// SHA-256 hash of the milestone deliverable description.
    /// Committed on initialise; verified on release (optional enforcement).
    pub milestone_hash: Bytes,

    /// Ledger number after which the client can trigger a dispute unilaterally.
    pub dispute_deadline_ledger: u32,

    /// Ledger number when the escrow was funded.
    pub funded_ledger: u32,

    /// Total number of milestones agreed at creation. 0 means no milestone tracking.
    pub milestones_total: u32,

    /// Number of milestones the freelancer has marked complete.
    pub milestones_completed: u32,

    /// Ledger number after which anyone may call claim_expired to return funds to client.
    /// 0 means no expiry is set.
    pub expiry_ledger: u32,

    /// Whether the client has submitted their approval for release.
    pub client_approved: bool,

    /// Whether the freelancer has submitted their approval for release.
    pub freelancer_approved: bool,

    /// Human-readable description (max 256 bytes, stored on-chain for auditability).
    pub description: String,
}
