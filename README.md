# NEXUS-HUB

```
███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗      ██╗  ██╗██╗   ██╗██████╗
████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝      ██║  ██║██║   ██║██╔══██╗
██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗█████╗███████║██║   ██║██████╔╝
██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║╚════╝██╔══██║██║   ██║██╔══██╗
██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║      ██║  ██║╚██████╔╝██████╔╝
╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝      ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
```

**Trustless Payments Orchestration for Marketplaces**

NEXUS-HUB is a production-ready, self-hosted payments orchestrator built for freelance and e-commerce marketplaces. It delivers a seamless Web2 UX (balances, top-ups, escrow payments, withdrawals) while settling funds trustlessly on the Stellar blockchain via Trustless Work.

---

## What's New vs OFFER-HUB

| Feature | OFFER-HUB | NEXUS-HUB |
|---|---|---|
| JWT Auth (access + refresh) | ❌ | ✅ |
| Role-based access control | ❌ | ✅ |
| Dispute resolution module | ❌ | ✅ |
| Webhook system (HMAC-signed) | ❌ | ✅ |
| Webhook delivery retries | ❌ | ✅ |
| Optimistic locking on balances | ❌ | ✅ |
| Audit log trail | ❌ | ✅ |
| Swagger API docs | ❌ | ✅ |
| Docker Compose (full stack) | Partial | ✅ |
| Pagination on all list endpoints | ❌ | ✅ |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   NEXUS-HUB                         │
│                                                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐  │
│  │  Client  │───▶│  API     │───▶│   PostgreSQL  │  │
│  │ (React/  │    │ NestJS   │    │   (Prisma)    │  │
│  │  SDK)    │    │ :4000    │    └──────────────┘  │
│  └──────────┘    └────┬─────┘                       │
│                       │ Queue Jobs                  │
│                  ┌────▼─────┐    ┌──────────────┐  │
│                  │  Worker  │    │    Redis      │  │
│                  │ BullMQ   │───▶│   (BullMQ)   │  │
│                  └────┬─────┘    └──────────────┘  │
│                       │                             │
│          ┌────────────┼────────────┐                │
│          ▼            ▼            ▼                │
│     ┌─────────┐ ┌──────────┐ ┌──────────┐         │
│     │  Airtm  │ │Trustless │ │ Webhooks │         │
│     │(Top-ups/│ │  Work    │ │(HMAC-    │         │
│     │Withdraw)│ │(Stellar  │ │ signed)  │         │
│     └─────────┘ │ Escrow)  │ └──────────┘         │
│                 └──────────┘                        │
└─────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Clone & configure

```bash
git clone https://github.com/your-org/nexus-hub.git
cd nexus-hub
cp .env.example .env
# Fill in JWT_SECRET, AIRTM_API_KEY, TRUSTLESS_WORK_API_KEY, etc.
```

### 2. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 3. Install & migrate

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
```

### 4. Run in development

```bash
npm run dev
# API: http://localhost:4000
# Docs: http://localhost:4000/api/docs
```

---

## Project Structure

```
nexus-hub/
├── apps/
│   ├── api/                    # NestJS API server (port 4000)
│   │   └── src/
│   │       ├── auth/           # JWT auth, refresh tokens, strategies
│   │       ├── users/          # User management
│   │       ├── balances/       # Balance & transaction history
│   │       ├── topups/         # Airtm top-up flow
│   │       ├── escrow/         # Trustless Work escrow management
│   │       ├── withdrawals/    # Airtm withdrawal flow
│   │       ├── disputes/       # Dispute opening & admin resolution
│   │       ├── webhooks/       # Endpoint registration & HMAC delivery
│   │       └── common/         # Guards, filters, decorators, interceptors
│   └── worker/                 # BullMQ async processor
│       └── src/processors/
│           ├── escrow.processor.ts    # Stellar contract calls
│           ├── topup.processor.ts     # Airtm top-up handling
│           ├── withdrawal.processor.ts # Airtm withdrawal handling
│           └── webhook.processor.ts   # HMAC-signed webhook delivery
├── packages/
│   ├── database/               # Prisma schema + migrations
│   ├── shared/                 # Enums, types, utils (shared across apps)
│   └── sdk/                    # Client SDK for marketplace integration
└── docs/                       # Architecture, API design, contributing guides
```

---

## API Overview

All endpoints are versioned under `/api/v1/`.

### Auth
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register user, receive token pair |
| `POST` | `/api/v1/auth/login` | Login, receive token pair |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token |

### Balances
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/balances/me` | Current balance (available + reserved) |
| `GET` | `/api/v1/balances/transactions` | Paginated transaction history |

### Escrow
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/escrow` | Create escrow (locks client balance) |
| `GET` | `/api/v1/escrow` | List my escrows (paginated) |
| `GET` | `/api/v1/escrow/:id` | Get escrow details |
| `POST` | `/api/v1/escrow/:id/release` | Client approves work → release funds |
| `POST` | `/api/v1/escrow/:id/refund` | Admin: refund to client |

### Disputes
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/disputes` | Open dispute on an escrow |
| `GET` | `/api/v1/disputes` | List my disputes |
| `GET` | `/api/v1/disputes/:id` | Get dispute details |
| `PATCH` | `/api/v1/disputes/:id/review` | Admin: set under review |
| `PATCH` | `/api/v1/disputes/:id/resolve` | Admin: resolve dispute |

### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/webhooks` | Register webhook endpoint |
| `GET` | `/api/v1/webhooks` | List my webhook endpoints |
| `PATCH` | `/api/v1/webhooks/:id` | Update endpoint |
| `DELETE` | `/api/v1/webhooks/:id` | Delete endpoint |
| `POST` | `/api/v1/webhooks/:id/rotate-secret` | Rotate signing secret |
| `GET` | `/api/v1/webhooks/:id/deliveries` | Delivery history + status |

---

## Webhook Events

NEXUS-HUB signs all outgoing webhooks with HMAC-SHA256.

```
X-NexusHub-Signature: sha256=<hmac>
X-NexusHub-Event: ESCROW_RELEASED
X-NexusHub-Delivery: <delivery-uuid>
```

**Available events:**
- `TOPUP_COMPLETED` / `TOPUP_FAILED`
- `PAYMENT_COMPLETED`
- `ESCROW_FUNDED` / `ESCROW_RELEASED` / `ESCROW_REFUNDED`
- `WITHDRAWAL_COMPLETED` / `WITHDRAWAL_FAILED`
- `DISPUTE_OPENED` / `DISPUTE_RESOLVED`

---

## Payment Flow

```
Client tops up → Airtm → Balance credited
                    ↓
Client creates escrow → Funds reserved → Stellar contract initialized (Trustless Work)
                    ↓
Freelancer completes work
                    ↓
Client approves  ────────────────────────→ Funds released → Freelancer balance credited
                    ↓ (or)
Client disputes  → Admin reviews → Resolved: Freelancer OR Refunded: Client
                    ↓
Freelancer withdraws → Airtm account
```

---

## Environment Variables

See `.env.example` for all required values. Key ones:

```env
JWT_SECRET=              # Strong random string (32+ chars)
DATABASE_URL=            # PostgreSQL connection string
REDIS_URL=               # Redis connection URL
AIRTM_API_KEY=           # From Airtm dashboard
TRUSTLESS_WORK_API_KEY=  # From Trustless Work dashboard
```

---

## License

MIT — see [LICENSE](./LICENSE)

---

> Built with ❤️ on Stellar. Powered by trustless escrow.
