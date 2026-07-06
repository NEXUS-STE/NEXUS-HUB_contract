// contracts/nexus-escrow/src/errors.rs

use soroban_sdk::contracterror;

/// All error codes the NexusEscrow contract can return.
/// Values are stable — never renumber existing entries.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum EscrowError {
    /// Caller is not authorised to perform this action.
    Unauthorized = 1,

    /// The escrow record does not exist in contract storage.
    EscrowNotFound = 2,

    /// The operation is not valid for the current escrow status.
    InvalidStatus = 3,

    /// The token transfer failed (balance insufficient or token error).
    TransferFailed = 4,

    /// The provided amount is zero or negative.
    InvalidAmount = 5,

    /// An escrow with this ID already exists.
    AlreadyExists = 6,

    /// The dispute deadline has not passed yet (early arbitration attempt).
    DisputeNotReady = 7,

    /// The platform fee exceeds the escrow amount.
    FeeTooHigh = 8,

    /// The milestone hash does not match what was committed on initialise.
    MilestoneHashMismatch = 9,

    /// The contract has been paused by the admin.
    ContractPaused = 10,

    /// Freelancer tried to complete a milestone but this escrow has no milestone tracking,
    /// or the milestone index is out of range.
    InvalidMilestone = 11,

    /// All milestones are already marked complete.
    AllMilestonesComplete = 12,

    /// claim_expired was called but expiry_ledger has not been reached yet,
    /// or expiry_ledger is 0 (no expiry set).
    EscrowNotExpired = 13,

    /// expiry_ledger is non-zero but is not strictly in the future at the time
    /// init_escrow is called (would expire immediately or has already passed).
    InvalidExpiry = 14,

    /// dispute_delay exceeds the maximum allowed extra delay.
    InvalidDelay = 15,
}
