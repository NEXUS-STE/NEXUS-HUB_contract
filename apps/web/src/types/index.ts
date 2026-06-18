// src/types/index.ts
// All types mirror the NEXUS-HUB API response shapes

export type UserRole = 'ADMIN' | 'CLIENT' | 'FREELANCER' | 'MARKETPLACE'
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION'

export type TransactionType =
  | 'TOPUP' | 'PAYMENT' | 'WITHDRAWAL'
  | 'ESCROW_LOCK' | 'ESCROW_RELEASE' | 'ESCROW_REFUND'
  | 'FEE' | 'ADJUSTMENT'

export type TransactionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type EscrowStatus =
  | 'PENDING' | 'FUNDED' | 'ACTIVE'
  | 'DISPUTED' | 'RELEASED' | 'REFUNDED' | 'CANCELLED'

export type DisputeStatus =
  | 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED_CLIENT' | 'RESOLVED_FREELANCER' | 'CLOSED'

export type DisputeReason =
  | 'WORK_NOT_DELIVERED' | 'QUALITY_NOT_AS_AGREED'
  | 'PAYMENT_ISSUE' | 'FRAUD' | 'OTHER'

export type WebhookEvent =
  | 'TOPUP_COMPLETED' | 'TOPUP_FAILED' | 'PAYMENT_COMPLETED'
  | 'ESCROW_FUNDED' | 'ESCROW_RELEASED' | 'ESCROW_REFUNDED'
  | 'WITHDRAWAL_COMPLETED' | 'WITHDRAWAL_FAILED'
  | 'DISPUTE_OPENED' | 'DISPUTE_RESOLVED'

export type WebhookDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'RETRYING'

// ─── Entity Types ─────────────────────────────────────────────

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  status: UserStatus
  airtmAccountId?: string
  stellarPublicKey?: string
  createdAt: string
  updatedAt: string
}

export interface Balance {
  id: string
  userId: string
  availableAmount: string
  reservedAmount: string
  currency: string
  version: number
  user?: Pick<User, 'firstName' | 'lastName' | 'email'>
  updatedAt: string
}

export interface Transaction {
  id: string
  idempotencyKey: string
  userId: string
  type: TransactionType
  status: TransactionStatus
  amount: string
  fee: string
  currency: string
  description?: string
  reference?: string
  escrowId?: string
  createdAt: string
  updatedAt: string
}

export interface EscrowParty {
  id: string
  firstName: string
  email?: string
}

export interface Escrow {
  id: string
  clientId: string
  client: EscrowParty
  freelancerId: string
  freelancer: EscrowParty
  amount: string
  fee: string
  currency: string
  status: EscrowStatus
  description: string
  milestoneTitle?: string
  stellarContractId?: string
  stellarTxHash?: string
  dispute?: Dispute
  fundedAt?: string
  releasedAt?: string
  refundedAt?: string
  createdAt: string
  updatedAt: string
}

export interface Dispute {
  id: string
  escrowId: string
  escrow?: Pick<Escrow, 'id' | 'amount' | 'status'>
  raisedById: string
  raisedBy?: EscrowParty
  reason: DisputeReason
  status: DisputeStatus
  description: string
  evidence?: string[]
  resolution?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface WebhookEndpoint {
  id: string
  userId: string
  url: string
  secret?: string
  events: WebhookEvent[]
  isActive: boolean
  description?: string
  createdAt: string
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  endpointId: string
  event: WebhookEvent
  payload: Record<string, unknown>
  status: WebhookDeliveryStatus
  responseCode?: number
  responseBody?: string
  attempts: number
  nextRetryAt?: string
  deliveredAt?: string
  createdAt: string
}

// ─── API Response Wrappers ────────────────────────────────────

export interface NexusResponse<T> {
  success: boolean
  statusCode: number
  data: T
  timestamp: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  pages: number
}

// ─── Auth ─────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  password: string
  firstName: string
  lastName: string
  role?: UserRole
}
