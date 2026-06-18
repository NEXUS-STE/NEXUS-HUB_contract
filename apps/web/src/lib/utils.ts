// src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'
import type { EscrowStatus, DisputeStatus, TransactionStatus, WebhookDeliveryStatus } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency ─────────────────────────────────────────────────
export function formatAmount(amount: string | number, currency = 'USD'): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(n)
}

export function formatAmountPlain(amount: string | number): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
}

// ─── Dates ────────────────────────────────────────────────────
export function formatDate(date: string): string {
  return format(new Date(date), 'MMM d, yyyy')
}

export function formatDateTime(date: string): string {
  return format(new Date(date), 'MMM d, yyyy · h:mm a')
}

export function fromNow(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true })
}

// ─── String helpers ───────────────────────────────────────────
export function truncateHash(hash: string, chars = 8): string {
  if (!hash) return ''
  return `${hash.slice(0, chars)}…${hash.slice(-4)}`
}

export function truncate(str: string, maxLen = 40): string {
  if (!str || str.length <= maxLen) return str
  return str.slice(0, maxLen) + '…'
}

export function fullName(user?: { firstName: string; lastName?: string } | null): string {
  if (!user) return 'Unknown'
  return user.lastName ? `${user.firstName} ${user.lastName}` : user.firstName
}

// ─── Status badge config ──────────────────────────────────────
export const escrowStatusConfig: Record<EscrowStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'badge-pending' },
  FUNDED:    { label: 'Funded',    className: 'badge-funded' },
  ACTIVE:    { label: 'Active',    className: 'badge-funded' },
  DISPUTED:  { label: 'Disputed',  className: 'badge-disputed' },
  RELEASED:  { label: 'Released',  className: 'badge-released' },
  REFUNDED:  { label: 'Refunded',  className: 'badge-refunded' },
  CANCELLED: { label: 'Cancelled', className: 'badge-cancelled' },
}

export const disputeStatusConfig: Record<DisputeStatus, { label: string; className: string }> = {
  OPEN:                 { label: 'Open',                className: 'badge-disputed' },
  UNDER_REVIEW:         { label: 'Under Review',        className: 'badge-funded' },
  RESOLVED_CLIENT:      { label: 'Resolved (Refund)',   className: 'badge-released' },
  RESOLVED_FREELANCER:  { label: 'Resolved (Released)', className: 'badge-released' },
  CLOSED:               { label: 'Closed',              className: 'badge-cancelled' },
}

export const txStatusConfig: Record<TransactionStatus, { label: string; className: string }> = {
  PENDING:    { label: 'Pending',    className: 'badge-pending' },
  PROCESSING: { label: 'Processing', className: 'badge-funded' },
  COMPLETED:  { label: 'Completed',  className: 'badge-released' },
  FAILED:     { label: 'Failed',     className: 'badge-cancelled' },
  CANCELLED:  { label: 'Cancelled',  className: 'badge-cancelled' },
}

export const deliveryStatusConfig: Record<WebhookDeliveryStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Pending',   className: 'badge-pending' },
  DELIVERED: { label: 'Delivered', className: 'badge-released' },
  FAILED:    { label: 'Failed',    className: 'badge-cancelled' },
  RETRYING:  { label: 'Retrying',  className: 'badge-disputed' },
}

// ─── Zod validation helpers ───────────────────────────────────
export function getFieldError(
  errors: Record<string, { message?: string }>,
  field: string,
): string | undefined {
  return errors[field]?.message
}
