// src/lib/api-client.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/stores/auth.store'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
})

// ── Request: attach access token ──────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: unwrap data, handle 401 ────────────────────────
apiClient.interceptors.response.use(
  (response) => response.data?.data ?? response.data,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = useAuthStore.getState().refreshToken
        if (!refreshToken) throw new Error('No refresh token')

        const { data } = await axios.post(`${BASE_URL}/api/v1/auth/refresh`, { refreshToken })
        useAuthStore.getState().setTokens(data.data.accessToken, data.data.refreshToken)
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return apiClient(original)
      } catch {
        useAuthStore.getState().clearAuth()
        window.location.href = '/auth/login'
      }
    }

    const message =
      (error.response?.data as any)?.message ??
      error.message ??
      'Something went wrong'
    return Promise.reject(new Error(Array.isArray(message) ? message[0] : message))
  },
)

// ── Idempotency helper ────────────────────────────────────────
export function withIdempotency(key?: string) {
  const id = key ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return { headers: { 'X-Idempotency-Key': id } }
}
