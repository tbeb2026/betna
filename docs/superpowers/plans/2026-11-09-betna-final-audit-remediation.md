# Betna Final Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the load-bearing security, verification, availability, audit, and input-validation defects found in the final Betna whole-branch review.

**Architecture:** Keep NestJS as the authoritative domain boundary. Make inspection requirements database-backed and injected, enforce invariants at every public/action path, and use Prisma transaction clients for domain mutation plus immutable audit insertion. Next.js invokes explicit API-backed owner/auth flows and never receives protected contact or evidence data.

**Tech Stack:** Next.js App Router, NestJS, Prisma/PostgreSQL, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-betna-mvp-design.md`

## Global Constraints

- Public listings require current in-person verification, public identity is only `Verified Betna owner`, and real contacts/evidence remain protected.
- Owners verify email and phone, attest authorization, and sign in by password or phone OTP; MFA is not mandatory.
- Verification lasts one year; a missing or expired validity date is never public or inquiry-eligible.
- Every sensitive action has immutable audit history, including private evidence access and released-location viewing.
- Owners control unavailable short-stay dates; confirmation atomically rejects dates blocked by either calendar source.
- All API boundaries use runtime validation and return controlled 4xx errors for malformed input.
- English and Tigrinya remain LTR and locale-complete across changed forms and notifications.

## Review Focus

- Null verification expiry must deny visibility, contact, media, and inquiry actions; test each entry point in Task 2.
- A verifier with a guessed foreign media ID must be denied completion and read access; test in Task 2.
- A date marked unavailable must prevent confirm-and-block under concurrent confirmation; test in Task 3.
- Failure to persist an audit event must roll back the corresponding sensitive mutation; test in Task 3.
- New owner onboarding must request phone OTP and complete both email and phone verification; test browser/API paths in Task 1.

---

### Task 1: Complete verified owner onboarding and durable checklist injection

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`, `apps/api/src/auth/otp.service.ts`, `apps/api/src/auth/*.spec.ts`
- Modify: `apps/web/src/app/[locale]/sign-in/*`, `apps/web/e2e/*.spec.ts`
- Modify: `apps/api/src/verification/inspections.service.ts`, `apps/api/src/verification/inspections.controller.ts`, `apps/api/src/verification/*.spec.ts`

**Interfaces:**
- Consumes: persisted `ChecklistDefinition` records and the existing `OtpService` provider.
- Produces: `requestOwnerPhoneOtp(phone)`, email-verification confirmation during onboarding, and a Nest-injected `ChecklistService` used consistently by submissions and admin management.

- [ ] **Step 1: Write failing API and browser tests** proving onboarding can request a WhatsApp code, rejects missing email verification, accepts valid verified email/phone onboarding, and that a published checklist definition/version is used by submission.
- [ ] **Step 2: Run the focused tests** and confirm they fail against the current separate/in-memory service instances.
- [ ] **Step 3: Implement a provider-backed onboarding verification flow** with requestable phone OTP, email challenge/confirmation through a configured notification boundary, rate limits, and no activation until both channels/attestation are complete.
- [ ] **Step 4: Inject `ChecklistService` through Nest** (no fallback instances), load the current persisted category definition in submission/review paths, and retain its version on the inspection.
- [ ] **Step 5: Run focused auth/verification and browser tests**, then commit `fix: complete onboarding verification and checklist injection`.

### Task 2: Enforce public verification and evidence authorization invariants

**Files:**
- Modify: `apps/api/src/properties/publishing.service.ts`, `apps/api/src/media/media.service.ts`, `apps/api/src/inquiries/inquiries.service.ts`
- Modify: `apps/api/src/media/media.controller.ts`, `apps/api/src/audit/*`
- Test: `apps/api/src/properties/*.spec.ts`, `apps/api/src/media/*.spec.ts`, `apps/api/src/inquiries/*.spec.ts`

**Interfaces:**
- Consumes: current property lifecycle/expiry state, inspection assignment and territory authorization, `AuditService`.
- Produces: a shared current-public-verification predicate and evidence operations authorized by the linked inspection/assignment.

- [ ] **Step 1: Write failing tests** for null/expired verification across publish/public media/inquiry/contact, foreign-verifier media completion/read denial, and audited private evidence reads.
- [ ] **Step 2: Run focused tests** and confirm the current null-expiry and verifier bypass behavior fails the requirements.
- [ ] **Step 3: Implement the shared current-verification predicate** that requires `PUBLISHED` plus a non-null future expiry; use it for public projection, contact redirects, media variants, and guest inquiries.
- [ ] **Step 4: Bind every inspection-evidence upload, completion, and private read** to its inspection, assigned verifier, and territory; emit immutable read-access audit events.
- [ ] **Step 5: Run property/media/inquiry tests**, then commit `fix: enforce verification and evidence authorization invariants`.

### Task 3: Make availability and sensitive audit writes transactional

**Files:**
- Modify: `apps/api/src/availability/availability.service.ts`, `apps/api/src/inquiries/inquiries.service.ts`
- Modify: `apps/api/src/commissions/conversions.service.ts`, `apps/api/src/commissions/commissions.service.ts`, `apps/api/src/audit/audit.service.ts`
- Test: `apps/api/src/availability/*.spec.ts`, `apps/api/src/inquiries/*.spec.ts`, `apps/api/src/commissions/*.spec.ts`

**Interfaces:**
- Consumes: `UnavailableDate`, `AvailabilityBlock`, Prisma transaction client.
- Produces: `audit.record(tx, event)` semantics where a failure rolls back the authoritative state transition.

- [ ] **Step 1: Write failing tests** proving unavailable dates reject confirmation, competing bookings remain atomic, and injected audit-write failures roll back inquiry/conversion/commission changes.
- [ ] **Step 2: Run focused tests** and confirm each invariant fails on current post-commit audits/calendar-only dates.
- [ ] **Step 3: Extend availability conflict queries** to include owner unavailable dates in the same transaction/locking path as bookings.
- [ ] **Step 4: Add transaction-aware audit insertion and refactor sensitive inquiry, conversion, commission, inspection, and publish mutations** so state and audit are committed together.
- [ ] **Step 5: Run focused workflow tests**, then commit `fix: make availability and audits transactional`.

### Task 4: Finish runtime request validation and release regression gates

**Files:**
- Modify: `apps/api/src/properties/properties.controller.ts`, `apps/api/src/properties/dto.ts`, `apps/api/src/properties/publishing.controller.ts`
- Modify: `apps/api/src/commissions/commissions.controller.ts`, `apps/api/src/inquiries/inquiries.controller.ts`
- Modify: relevant DTOs, specs, `package.json`, CI test documentation

**Interfaces:**
- Consumes: Nest global `ValidationPipe` and class-validator DTO conventions.
- Produces: explicit DTOs for every remaining mutation and reproducible root/unit, database-integration, and Playwright command boundaries.

- [ ] **Step 1: Write failing controller tests** for malformed/null property, publish, conversion, commission-evidence, and admin-inquiry payloads returning controlled 4xx.
- [ ] **Step 2: Run focused tests** and confirm erased interfaces/raw records bypass runtime validation.
- [ ] **Step 3: Replace each mutation body with decorated DTOs** and ensure nested data/whitelisting are validated before services receive it.
- [ ] **Step 4: Run root unit tests, API/web typechecks, lint, production builds, and document/run separate DB and browser gates where environment allows.**
- [ ] **Step 5: Commit** `fix: validate remaining mutation boundaries`.

## Self-Review

- Spec coverage: Tasks 1–4 map every final-review P1/P2 issue to an owning implementation and test gate.
- Step scan: each task begins with failing behavior, implements a named boundary, and ends with a focused verification/commit.
- Type consistency: transaction-aware audit accepts the same Prisma transaction type passed by existing domain services; checklist service is injected from `VerificationModule`.
- Review focus: each of the five high-risk input/state classes has a named test task.
- Proportion: four cohesive tasks avoid mixing independent identity, evidence, transactional, and validation changes.
