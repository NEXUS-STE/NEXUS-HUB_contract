// src/services/api.ts
// All NEXUS-HUB API calls — mirrors the backend route structure exactly

import { apiClient, withIdempotency } from '@/lib/api-client'
import type {
  Balance, Transaction, Escrow, Dispute, WebhookEndpoint,
  WebhookDelivery, TokenPair, LoginPayload, RegisterPayload,
  PaginatedResponse,
} from '@/types'

// ─── Auth ─────────────────────────────────────────────────────

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post<never, TokenPair>('/auth/register', payload),

  login: (payload: LoginPayload) =>
    apiClient.post<never, TokenPair>('/auth/login', payload),

  refresh: (refreshToken: string) =>
    apiClient.post<never, TokenPair>('/auth/refresh', { refreshToken }),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),
}

// ─── Balances ─────────────────────────────────────────────────

export const balancesApi = {
  getMyBalance: () =>
    apiClient.get<never, Balance>('/balances/me'),

  getTransactions: (params?: { page?: number; limit?: number; type?: string }) =>
    apiClient.get<never, PaginatedResponse<Transaction>>('/balances/transactions', { params }),
}

// ─── Top-ups ──────────────────────────────────────────────────

export const topupsApi = {
  initiate: (amount: string, idempotencyKey?: string) =>
    apiClient.post('/topups', { amount }, withIdempotency(idempotencyKey)),
}

// ─── Escrow ───────────────────────────────────────────────────

export interface CreateEscrowPayload {
  freelancerId: string
  amount: string
  description: string
  milestoneTitle?: string
}

export const escrowApi = {
  create: (payload: CreateEscrowPayload, idempotencyKey?: string) =>
    apiClient.post<never, Escrow>('/escrow', payload, withIdempotency(idempotencyKey)),

  list: (params?: { page?: number; limit?: number }) =>
    apiClient.get<never, PaginatedResponse<Escrow>>('/escrow', { params }),

  getById: (id: string) =>
    apiClient.get<never, Escrow>(`/escrow/${id}`),

  release: (id: string, feedback?: string) =>
    apiClient.post(`/escrow/${id}/release`, { feedback }),

  refund: (id: string, reason: string) =>
    apiClient.post(`/escrow/${id}/refund`, { reason }),
}

// ─── Withdrawals ──────────────────────────────────────────────

export const withdrawalsApi = {
  initiate: (amount: string, idempotencyKey?: string) =>
    apiClient.post('/withdrawals', { amount }, withIdempotency(idempotencyKey)),
}

// ─── Disputes ─────────────────────────────────────────────────

export interface OpenDisputePayload {
  escrowId: string
  reason: string
  description: string
  evidence?: string[]
}

export interface ResolveDisputePayload {
  resolution: 'RESOLVED_CLIENT' | 'RESOLVED_FREELANCER'
  notes: string
}

export const disputesApi = {
  open: (payload: OpenDisputePayload) =>
    apiClient.post<never, Dispute>('/disputes', payload),

  list: (params?: { page?: number; limit?: number }) =>
    apiClient.get<never, PaginatedResponse<Dispute>>('/disputes', { params }),

  getById: (id: string) =>
    apiClient.get<never, Dispute>(`/disputes/${id}`),

  setUnderReview: (id: string) =>
    apiClient.patch(`/disputes/${id}/review`),

  resolve: (id: string, payload: ResolveDisputePayload) =>
    apiClient.patch(`/disputes/${id}/resolve`, payload),
}

// ─── Webhooks ─────────────────────────────────────────────────

export interface RegisterWebhookPayload {
  url: string
  events: string[]
  description?: string
}

export const webhooksApi = {
  register: (payload: RegisterWebhookPayload) =>
    apiClient.post<never, WebhookEndpoint & { secret: string }>('/webhooks', payload),

  list: () =>
    apiClient.get<never, WebhookEndpoint[]>('/webhooks'),

  update: (id: string, payload: Partial<RegisterWebhookPayload & { isActive: boolean }>) =>
    apiClient.patch<never, WebhookEndpoint>(`/webhooks/${id}`, payload),

  delete: (id: string) =>
    apiClient.delete(`/webhooks/${id}`),

  rotateSecret: (id: string) =>
    apiClient.post<never, { secret: string; message: string }>(`/webhooks/${id}/rotate-secret`),

  getDeliveries: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<never, PaginatedResponse<WebhookDelivery>>(`/webhooks/${id}/deliveries`, { params }),
}
