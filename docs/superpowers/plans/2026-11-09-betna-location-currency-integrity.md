# Betna Location and Currency Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make exact-location access audit/revocation-safe and enforce country-currency integrity at the PostgreSQL boundary.

**Architecture:** Treat exact-location reads as sensitive transactions: lock current release state, write immutable audit, then return data only if still unrecalled. Use PostgreSQL trigger constraints, not application-only checks, to compare offering/conversion currency to the property country.

**Tech Stack:** NestJS, Prisma/PostgreSQL migrations, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-betna-mvp-design.md`

## Global Constraints

- Exact addresses and coordinates are private; each read is auditable and revocation takes effect before any later read.
- Kenya properties use KES and Uganda properties use UGX; no direct database write may create mismatched offering or conversion currency.
- Sensitive state and audit writes are transactionally consistent and fail closed.

## Review Focus

- Concurrent token read/revoke must never return a location after revoke commits; Task 1 tests a lock/interleaving.
- Repeated/idempotent release must log each disclosure/read; Task 1 tests both release branches.
- SQL inserts/updates bypassing services must reject country/currency mismatch; Task 2 includes migration-level tests/documentation.

---

### Task 1: Serialize and audit all exact-location disclosures

**Files:**
- Modify: `apps/api/src/inquiries/location-release.service.ts`, related service tests

**Interfaces:**
- Produces: locked transaction helpers for idempotent release and token redemption that record `EXACT_LOCATION_VIEWED` before returning coordinates.

- [ ] **Step 1: Write failing tests** for idempotent release audit, token-read/revoke interleaving, and missing audit persistence fail-closed behavior.
- [ ] **Step 2: Run focused tests** and confirm current release/token paths miss the invariant.
- [ ] **Step 3: Implement locked transaction reads** that revalidate active release after locking and persist audit before returning any exact location.
- [ ] **Step 4: Run location-release tests** and commit `fix: serialize and audit exact location access`.

### Task 2: Enforce property currency consistency in PostgreSQL

**Files:**
- Create: migration under `apps/api/prisma/migrations/`
- Modify: Prisma/service tests and `docs/operations.md`

**Interfaces:**
- Produces: database triggers/constraints rejecting Offerings and Conversion records whose currency differs from their property country.

- [ ] **Step 1: Write failing integration/migration fixture tests** or SQL assertions for KES/UGX mismatches through direct database writes.
- [ ] **Step 2: Implement an idempotent migration trigger** resolving a related property country for insert/update and raising a clear constraint error on mismatch.
- [ ] **Step 3: Run schema validation, service tests, and database integration gate where configured**; document the required command.
- [ ] **Step 4: Commit** `fix: enforce property currency consistency in database`.

## Self-Review

- Spec coverage: Task 1 owns all exact-location disclosure/read paths; Task 2 owns the DB-level financial invariant.
- Review focus: both concurrency/audit and direct-SQL bypass cases have a named test.
