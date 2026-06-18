# CLAUDE.md — NEXUS-HUB Frontend

> Read this before writing any code in `apps/web/`.

---

## Stack

Next.js 15 (App Router) · React 19 · TypeScript 5 · Tailwind CSS 4 · Zod · React Hook Form · TanStack Query v5 · Zustand · Auth.js v5 · Axios · react-hot-toast · lucide-react

---

## Project Structure

```
src/
  app/
    layout.tsx                Root layout (Providers, Toaster)
    page.tsx                  Redirects to /dashboard
    auth/login/page.tsx       Login page
    auth/register/page.tsx    Registration page
    dashboard/
      layout.tsx              Sidebar + main wrapper (authenticated)
      page.tsx                Overview: balance cards + recent activity
      wallet/page.tsx         Top-up, withdraw, transaction history
      escrow/page.tsx         Escrow list + create form
      disputes/page.tsx       Dispute list + open dispute form
      webhooks/page.tsx       Endpoint management + delivery history
      settings/page.tsx       User profile settings

  components/
    ui/index.tsx              All shared primitives (Button, Input, Card, Badge, Table, Skeleton, EmptyState)
    layout/
      sidebar.tsx             Nav sidebar with active-state and sign-out
      providers.tsx           QueryClientProvider + SessionProvider

  services/api.ts             All Axios API calls (authApi, balancesApi, escrowApi, disputesApi, webhooksApi)
  hooks/use-nexus-queries.ts  All React Query hooks and mutations
  stores/auth.store.ts        Zustand auth store (accessToken, refreshToken, user, setTokens, clearAuth)
  lib/
    api-client.ts             Axios instance with token interceptor + auto-refresh on 401
    utils.ts                  cn(), formatAmount(), formatDate(), status badge configs
    schemas.ts                Zod validation schemas for all forms
  types/index.ts              TypeScript types mirroring API response shapes
```

---

## Design System

NEXUS-HUB's brand is deep navy + electric cyan. Never deviate.

**Color tokens (in globals.css as CSS vars and as inline Tailwind values):**

| Token | Hex | Usage |
|---|---|---|
| `--color-shell` | `#0A0F1E` | Page/body background |
| `--color-surface` | `#111827` | Cards |
| `--color-surface-2` | `#1A2335` | Hover states, nested surfaces |
| `--color-border` | `#1E2D45` | Card borders |
| `--color-accent` | `#00D4FF` | Primary CTA, active nav, balance amount |
| `--color-success` | `#10B981` | Released, completed |
| `--color-warning` | `#F59E0B` | Disputed, reserved |
| `--color-error` | `#EF4444` | Failed, cancelled, danger |
| `--color-text-primary` | `#F0F6FF` | Headings, values |
| `--color-text-secondary`| `#94A3B8` | Labels, metadata |
| `--color-text-muted` | `#475569` | Timestamps, secondary info |

**Typography rules:**
- Font: `Inter` for UI. `JetBrains Mono` for amounts, hashes, contract IDs, type codes.
- Use the `amount` CSS class for monetary values — it applies mono font + tabular nums.
- Use the `hash` CSS class for Stellar contract IDs and tx hashes.

**Signature element:** The available balance card has a `balance-pulse` CSS animation — a slow cyan glow pulse. This is the most visually distinctive element. Never remove it.

---

## Component Rules

### UI primitives — always import from `@/components/ui`
```tsx
import { Button, Input, Card, Table, Th, Td, EscrowStatusBadge, EmptyState } from '@/components/ui'
```

### Button variants
```tsx
<Button variant="primary" />    // cyan bg — primary actions
<Button variant="secondary" />  // dark bg — secondary actions
<Button variant="ghost" />      // no bg — icon buttons, tertiary
<Button variant="danger" />     // red — destructive
<Button variant="outline" />    // cyan border — emphasis without fill
<Button loading={true} />       // shows spinner, disables button
```

### Forms
- Always use `react-hook-form` + `zodResolver`.
- Use Zod schemas from `@/lib/schemas.ts` — don't redefine inline.
- Always use the `<Input>` component from `@/components/ui` — it handles label, error, and hint display.
- Never use HTML `<form onSubmit>` without `handleSubmit` wrapper.

### Status badges — always use typed badge components
```tsx
<EscrowStatusBadge status={escrow.status} />   // EscrowStatus
<DisputeStatusBadge status={dispute.status} />  // DisputeStatus
<TxStatusBadge status={tx.status} />            // TransactionStatus
<DeliveryStatusBadge status={d.status} />       // WebhookDeliveryStatus
```

### Empty states
Use the `<EmptyState>` component — never show a blank `<div>`:
```tsx
<EmptyState icon={<Lock size={20} />} title="No escrows yet" description="Create your first escrow." action={<Button>...</Button>} />
```

---

## Data Fetching

All server state lives in React Query. Never fetch in `useEffect`.

```tsx
// Reading data
const { data, isLoading, error } = useBalance()

// Mutations
const createEscrow = useCreateEscrow()
await createEscrow.mutateAsync(payload)
```

**Available hooks** (from `@/hooks/use-nexus-queries.ts`):
- `useBalance()` — polls every 30s
- `useTransactions(params)` — paginated
- `useTopup()` — mutation, invalidates balance
- `useWithdrawal()` — mutation, invalidates balance
- `useEscrows(params)` / `useEscrow(id)` / `useCreateEscrow()` / `useReleaseEscrow()`
- `useDisputes(params)` / `useDispute(id)` / `useOpenDispute()` / `useResolveDispute()`
- `useWebhooks()` / `useRegisterWebhook()` / `useDeleteWebhook()` / `useRotateWebhookSecret()` / `useWebhookDeliveries(id)`

---

## Auth

Auth state is in Zustand (`useAuthStore`). Token persistence is handled automatically via `localStorage`.

```tsx
const { user, accessToken, clearAuth, isAuthenticated } = useAuthStore()
```

The Axios interceptor in `api-client.ts` attaches the access token to every request and auto-refreshes on 401. Never manually add `Authorization` headers in components.

---

## Formatting Conventions

```tsx
import { formatAmount, formatDate, formatDateTime, fromNow, truncateHash } from '@/lib/utils'

formatAmount('12345.67')       // "$12,345.67"
formatAmount('12345.67', 'EUR')// "€12,345.67"
formatDate('2025-01-01T...')   // "Jan 1, 2025"
formatDateTime('...')          // "Jan 1, 2025 · 3:00 PM"
fromNow('...')                 // "2 hours ago"
truncateHash('GCAXXX...YYY')   // "GCAXXX…YYY"
```

---

## What Not To Do

- Never use raw hex colors — always use the CSS vars or the established Tailwind values from the design system.
- Never fetch data in `useEffect` — use React Query hooks.
- Never manually set `Authorization` header in components.
- Never use `any` type.
- Never create new status badge styles — always use the existing `badge-*` CSS classes.
- Never use browser `alert()` or `console.error` for user-facing errors — use `toast.error()` from `react-hot-toast`.
- Never use `<form onSubmit={fn}>` without `handleSubmit` — always use `react-hook-form`.
- Never hardcode amounts as plain numbers in JSX — always use `formatAmount()`.
- Never expose secrets or tokens in JSX or logs.

---

## Adding a New Page Checklist

- [ ] Create `src/app/dashboard/<feature>/page.tsx`
- [ ] Add nav item to `src/components/layout/sidebar.tsx` (navItems array)
- [ ] Add API function to `src/services/api.ts`
- [ ] Add React Query hook to `src/hooks/use-nexus-queries.ts`
- [ ] Add Zod schema to `src/lib/schemas.ts`
- [ ] Add TypeScript type to `src/types/index.ts` if needed
- [ ] Use `<EmptyState>` for zero-data case
- [ ] Use `<Skeleton>` during loading state
- [ ] Format all monetary values with `formatAmount()`
- [ ] Format all dates with `formatDate()` or `fromNow()`
