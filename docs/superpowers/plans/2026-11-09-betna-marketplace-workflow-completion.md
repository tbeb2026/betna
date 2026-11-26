# Betna Marketplace Workflow Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the owner-to-verification workflow and enforce public snapshot, request-ID, and bilingual communication invariants identified by final branch audit.

**Architecture:** Property submission atomically creates the first inspection record and routes it into admin assignment. Public discovery serves approved snapshots during material review only after strict media ownership/purpose validation. API DTOs validate UUID references before Prisma. Web and notification copy select English or Tigrinya through centralized locale resources.

**Tech Stack:** NestJS, Next.js App Router, Prisma/PostgreSQL, class-validator, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-06-betna-mvp-design.md`

## Global Constraints

- Every submitted listing receives physical inspection before publication; verifier queue begins from normal owner submission.
- Approved public content stays visible during a material review; exact/private data and non-listing media never appear publicly.
- All invalid UUID request fields return controlled 4xx before persistence.
- English and Tigrinya cover the entire shell, forms, dashboards, status labels, email/WhatsApp notifications, and metadata.

## Review Focus

- Owner submit must transactionally create exactly one assignable inspection; Task 1 tests retries/concurrent submit semantics.
- Pending material edit must remain searchable by slug/search through its approved snapshot; Task 2 tests expiry/fraud exclusions.
- Cross-property/private evidence media IDs must be rejected in material edits and never project publicly; Task 2 tests both.
- Every UUID reference in body DTOs must reject malformed values before service invocation; Task 3 HTTP tests representative routes.
- Tigrinya notification/UI paths must have no fallback hardcoded English; Task 4 key and rendered-message tests cover changed surfaces.

---

### Task 1: Create inspection workflow on owner submission

**Files:**
- Modify: `apps/api/src/properties/properties.service.ts`, `apps/api/src/verification/inspections.service.ts`, modules and tests

- [ ] **Step 1: Write failing owner-submit tests** proving a new eligible submission creates exactly one draft inspection with property city/territory context and reaches admin/verifier assignment queue.
- [ ] **Step 2: Run focused tests** and confirm current submission only changes status.
- [ ] **Step 3: Implement transactional submission-to-inspection creation** with idempotent retry protection and atomic property/inspection lifecycle writes.
- [ ] **Step 4: Run API workflow tests** and commit `feat: create inspections from owner submissions`.

### Task 2: Preserve approved public snapshots and isolate listing media

**Files:**
- Modify: `apps/api/src/properties/search.service.ts`, `publishing.service.ts`, DTO/service tests

- [ ] **Step 1: Write failing tests** for pending-review approved snapshot visibility, expired/fraud exclusion, cross-property/non-listing media projection rejection, and invalid material-edit media IDs.
- [ ] **Step 2: Implement search/slug eligibility** for current approved snapshots while preserving status/privacy rules.
- [ ] **Step 3: Validate material-edit media transactionally** (same property, clean listing purpose, public listing prefix) and enforce identical projection criteria.
- [ ] **Step 4: Run focused discovery/publishing/media tests** and commit `fix: preserve safe approved public snapshots`.

### Task 3: Validate all body UUID references

**Files:**
- Modify: DTOs/controllers in inquiries, commissions, properties, publishing and tests

- [ ] **Step 1: Inventory every body ID/reference field** and add failing HTTP pipeline tests for malformed property/offering/inquiry/geography/media identifiers.
- [ ] **Step 2: Add `IsUUID("4")`/`each: true` validation** while maintaining valid contracts and service-level errors.
- [ ] **Step 3: Run real Nest HTTP validation tests** and commit `fix: validate UUID request references`.

### Task 4: Complete English and Tigrinya UI and notification copy

**Files:**
- Modify: message catalogs, search/property/owner/verifier components, inquiry/availability notification composition, locale tests

- [ ] **Step 1: Write failing catalog parity/render tests** for audit-named hardcoded surfaces and English/Tigrinya notifications.
- [ ] **Step 2: Move visible text and notification templates into locale resources**, select recipient/request locale with transparent English content fallback only where spec allows listing translations.
- [ ] **Step 3: Run web/API locale suites and build** then commit `feat: complete bilingual marketplace communication`.

## Self-Review

- Each final-review finding has an owning task and direct regression gate.
- The plan preserves the existing security/transaction boundaries rather than bypassing them for UI convenience.
