# AI.md — NEXUS-HUB Developer Guide for AI Assistants

> Read this file first before writing any code in this repository.

---

## Project Identity

**Name:** NEXUS-HUB  
**Purpose:** Trustless payments orchestrator for freelance and e-commerce marketplaces.  
**Stack:** Node.js 20 · TypeScript 5.4 · NestJS 10 · Prisma 5 · PostgreSQL · Redis · BullMQ · Stellar/Soroban (via Trustless Work) · Airtm

---

## Monorepo Layout

```
apps/api/          NestJS API — all HTTP routes, guards, controllers, services
apps/worker/       BullMQ worker — async processors for Stellar, Airtm, webhooks
packages/shared/   Enums, types, DTOs shared across apps (no NestJS deps here)
packages/database/ Prisma schema only; PrismaClient is generated here
packages/sdk/      Client SDK for marketplace integrations
```

---

## Critical Conventions

### 1. Idempotency is mandatory on all mutating endpoints
- Every POST that creates a transaction MUST accept `X-Idempotency-Key` header.
- Check `Transaction.idempotencyKey` before processing and return early if found.
- Use the `@IdempotencyKey()` decorator from `common/decorators`.

### 2. Balance mutations use optimistic locking
- The `Balance` model has a `version` integer field.
- Always include `version: balance.version` in the `where` clause when updating.
- If update affects 0 rows, throw `ConflictException('Balance was modified concurrently')`.

### 3. All Stellar calls are async (go through BullMQ)
- Never call Trustless Work API directly from an HTTP handler.
- Enqueue jobs via the `@InjectQueue(QueueName.ESCROW)` queue.
- Use `JobName` enum from `@nexus-hub/shared/enums` for job names.

### 4. Webhook events fire from the worker, not the API
- After a worker job completes, enqueue a `DELIVER_WEBHOOK` job to `QueueName.WEBHOOK`.
- The webhook processor signs payloads with HMAC-SHA256 using the endpoint's `secret`.

### 5. Role guards
- Use `@Roles(UserRole.ADMIN)` decorator + `RolesGuard` for admin-only routes.
- Use `@Public()` decorator to skip JWT auth on public endpoints (e.g. `/auth/login`).
- ADMIN can access all resources. CLIENT and FREELANCER can only access their own.

### 6. Response shape
All responses are wrapped by `ResponseInterceptor`:
```json
{
  "success": true,
  "statusCode": 200,
  "data": { ... },
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```
Do not manually wrap responses in controllers.

### 7. Error handling
Throw NestJS built-in exceptions (`NotFoundException`, `BadRequestException`, etc.).  
The global `HttpExceptionFilter` formats them consistently. Never `res.status(xxx).json(...)`.

---

## Module Structure Template

Every feature module follows this pattern:

```
src/<feature>/
  <feature>.module.ts      — imports, providers, exports
  <feature>.controller.ts  — routes, guards, swagger decorators
  <feature>.service.ts     — business logic, prisma calls, queue enqueues
  dto/
    create-<feature>.dto.ts
    update-<feature>.dto.ts
  entities/
    <feature>.entity.ts    — Swagger response schemas
```

---

## Naming Rules

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Methods/variables: `camelCase`
- Env vars: `SCREAMING_SNAKE_CASE`
- Queue names: use `QueueName` enum (never raw strings)
- Job names: use `JobName` enum (never raw strings)
- Prisma relations: accessed via `include:`, never expose raw `passwordHash`

---

## What Not To Do

- Do NOT add business logic to controllers — services only.
- Do NOT call Trustless Work or Airtm APIs from services — queue it.
- Do NOT create transactions without an `idempotencyKey`.
- Do NOT expose `passwordHash`, `secret`, or `refreshTokens` in responses.
- Do NOT use `any` type — use proper TypeScript types or Prisma-generated types.
- Do NOT skip `@IsEmail()` / `@IsString()` etc. validators on DTOs.

---

## Adding a New Feature Checklist

- [ ] Create module/controller/service in `apps/api/src/<feature>/`
- [ ] Register module in `AppModule`
- [ ] Add Prisma model to `packages/database/prisma/schema.prisma`
- [ ] Run `npm run prisma:migrate`
- [ ] Add any new enums to `packages/shared/src/enums/index.ts`
- [ ] Add `@ApiTags`, `@ApiOperation`, `@ApiBearerAuth` Swagger decorators
- [ ] Add `@Roles()` guard if admin-only
- [ ] Add `@IdempotencyKey()` if creating transactions
- [ ] If async work needed: add `JobName` enum value + processor case
- [ ] Fire webhook event from worker after job completion
- [ ] Write unit tests for the service
