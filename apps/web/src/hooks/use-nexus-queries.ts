// src/hooks/use-nexus-queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { balancesApi, escrowApi, disputesApi, webhooksApi, topupsApi, withdrawalsApi, authApi } from '@/services/api'
import { useAuthStore } from '@/stores/auth.store'
import type { LoginPayload, RegisterPayload, CreateEscrowPayload, OpenDisputePayload, ResolveDisputePayload } from '@/services/api'
import toast from 'react-hot-toast'

// ─── Query Keys ───────────────────────────────────────────────
export const queryKeys = {
  balance: ['balance'] as const,
  transactions: (params?: object) => ['transactions', params] as const,
  escrows: (params?: object) => ['escrows', params] as const,
  escrow: (id: string) => ['escrow', id] as const,
  disputes: (params?: object) => ['disputes', params] as const,
  dispute: (id: string) => ['dispute', id] as const,
  webhooks: ['webhooks'] as const,
  webhookDeliveries: (id: string, params?: object) => ['webhook-deliveries', id, params] as const,
}

// ─── Auth Hooks ───────────────────────────────────────────────
export function useLogin() {
  const { setTokens } = useAuthStore()
  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
    onSuccess: (data) => setTokens(data.accessToken, data.refreshToken),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRegister() {
  const { setTokens } = useAuthStore()
  return useMutation({
    mutationFn: (payload: RegisterPayload) => authApi.register(payload),
    onSuccess: (data) => setTokens(data.accessToken, data.refreshToken),
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Balance Hooks ────────────────────────────────────────────
export function useBalance() {
  return useQuery({
    queryKey: queryKeys.balance,
    queryFn: balancesApi.getMyBalance,
    refetchInterval: 30_000,
  })
}

export function useTransactions(params?: { page?: number; limit?: number; type?: string }) {
  return useQuery({
    queryKey: queryKeys.transactions(params),
    queryFn: () => balancesApi.getTransactions(params),
  })
}

// ─── Top-up / Withdrawal ──────────────────────────────────────
export function useTopup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (amount: string) => topupsApi.initiate(amount),
    onSuccess: () => {
      toast.success('Top-up initiated. Your balance will update shortly.')
      qc.invalidateQueries({ queryKey: queryKeys.balance })
      qc.invalidateQueries({ queryKey: queryKeys.transactions() })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useWithdrawal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (amount: string) => withdrawalsApi.initiate(amount),
    onSuccess: () => {
      toast.success('Withdrawal initiated.')
      qc.invalidateQueries({ queryKey: queryKeys.balance })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Escrow Hooks ─────────────────────────────────────────────
export function useEscrows(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.escrows(params),
    queryFn: () => escrowApi.list(params),
  })
}

export function useEscrow(id: string) {
  return useQuery({
    queryKey: queryKeys.escrow(id),
    queryFn: () => escrowApi.getById(id),
    enabled: !!id,
  })
}

export function useCreateEscrow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateEscrowPayload) => escrowApi.create(payload),
    onSuccess: () => {
      toast.success('Escrow created. Funds reserved.')
      qc.invalidateQueries({ queryKey: queryKeys.escrows() })
      qc.invalidateQueries({ queryKey: queryKeys.balance })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useReleaseEscrow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, feedback }: { id: string; feedback?: string }) =>
      escrowApi.release(id, feedback),
    onSuccess: (_data, { id }) => {
      toast.success('Funds released to freelancer.')
      qc.invalidateQueries({ queryKey: queryKeys.escrow(id) })
      qc.invalidateQueries({ queryKey: queryKeys.escrows() })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Disputes Hooks ───────────────────────────────────────────
export function useDisputes(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.disputes(params),
    queryFn: () => disputesApi.list(params),
  })
}

export function useDispute(id: string) {
  return useQuery({
    queryKey: queryKeys.dispute(id),
    queryFn: () => disputesApi.getById(id),
    enabled: !!id,
  })
}

export function useOpenDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: OpenDisputePayload) => disputesApi.open(payload),
    onSuccess: () => {
      toast.success('Dispute opened. Our team will review within 24 hours.')
      qc.invalidateQueries({ queryKey: queryKeys.disputes() })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useResolveDispute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ResolveDisputePayload }) =>
      disputesApi.resolve(id, payload),
    onSuccess: (_data, { id }) => {
      toast.success('Dispute resolved.')
      qc.invalidateQueries({ queryKey: queryKeys.dispute(id) })
      qc.invalidateQueries({ queryKey: queryKeys.disputes() })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

// ─── Webhook Hooks ────────────────────────────────────────────
export function useWebhooks() {
  return useQuery({
    queryKey: queryKeys.webhooks,
    queryFn: webhooksApi.list,
  })
}

export function useRegisterWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: webhooksApi.register,
    onSuccess: () => {
      toast.success('Webhook endpoint registered.')
      qc.invalidateQueries({ queryKey: queryKeys.webhooks })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useDeleteWebhook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => webhooksApi.delete(id),
    onSuccess: () => {
      toast.success('Endpoint deleted.')
      qc.invalidateQueries({ queryKey: queryKeys.webhooks })
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useRotateWebhookSecret() {
  return useMutation({
    mutationFn: (id: string) => webhooksApi.rotateSecret(id),
    onSuccess: () => toast.success('Secret rotated. Update your integration now.'),
    onError: (e: Error) => toast.error(e.message),
  })
}

export function useWebhookDeliveries(id: string, params?: { page?: number }) {
  return useQuery({
    queryKey: queryKeys.webhookDeliveries(id, params),
    queryFn: () => webhooksApi.getDeliveries(id, params),
    enabled: !!id,
  })
}
