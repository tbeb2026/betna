# Betna MVP design

## Intent

Betna is a trust-first property marketplace launching in Kenya and Uganda. It helps visitors discover verified places and contact the owner or Betna, while letting individual owners submit listings that undergo a physical inspection before public publication. Its initial value is trustworthy discovery and managed inquiry—not online payment, instant booking, or travel reservations.

## Goals

- Provide fast, indexable public property search and property-detail pages.
- Support English from launch and Tigrinya through a managed translation workflow.
- Allow individual owners to manage multiple listings in Kenya and/or Uganda.
- Require every public listing to pass a local, in-person inspection and admin approval.
- Let visitors make an inquiry without an account and contact Betna or an owner through prefilled WhatsApp actions.
- Give owners, field verifiers, and admins purpose-built, permissioned portals.
- Maintain an auditable workflow for verification, inquiries, exact-address release, and earned commissions.

## Explicit non-goals for this release

- Online payment processing, payment-gateway integration, and dynamic currency conversion.
- Instant booking, automatic reservation holds, and automated deposits.
- Travel/flight search or Anseba travel integration.
- Organization/agency accounts and multi-person owner teams.
- Automated translation presented as approved content.

## Users and access

| User | Access |
| --- | --- |
| Visitor | Public search, property pages, guest inquiry form, email/WhatsApp contact actions. No account is required to inquire. |
| Owner | Sign in with email/password or phone OTP; manage a personal multi-listing portfolio, property content, availability, and inquiry responses. |
| Field verifier (employee) | Sees assigned inspections only within their country/city/district territory; captures inspection evidence and submits reports. Cannot publish listings. |
| Admin | One unified role (not country-specific): reviews submissions, manages users/territories/taxonomy, assigns verifiers, approves/rejects verification, controls publishing, release of exact location, translations, inquiries, commission records, audit history, and urgent after-hours exceptions. |

Public listings identify the contact party only as **Verified Betna owner**. Real owner/agent identity is confined to protected roles.

## Product and workflow decisions

### Listing and verification lifecycle

1. An individual owner verifies email and phone, accepts an authorization attestation, and creates a property submission.
2. An admin performs an initial review and assigns an eligible employee verifier by territory/workload.
3. The verifier inspects in person and records address/precise pin, ownership or authorization evidence, site photos, amenities, observed price and availability, checklist answers, and notes.
4. An admin approves, rejects, or requests changes. A property is public only after admin approval.
5. Administrators publish the English version after verification. Tigrinya translation may remain pending and is added/reviewed by Betna staff later.
6. Material edits (base price, core photos, exact location, category, bedrooms/capacity, amenities, and other facts checked at inspection) trigger review/re-verification before the public record changes. Text-only changes and availability-calendar changes do not. The approved public version stays visible while a material edit is under review.
7. Listings expose a verification badge and last-inspection date, never private evidence.
8. Verification is valid for one year. The system sends renewal reminders, automatically pauses a listing at expiry, and requires a new inspection before republication. A report of fraud immediately hides a listing pending admin investigation. Confirmed ownership or authorized-agent changes require full re-verification.

Every inspection follows a mandatory baseline (identity/authorization, exact location, current photos, stated price, category, and safety/condition notes) plus a configurable category-specific checklist for residential, land, and commercial listings. The checklist defines required evidence and pass/fail/document-escalation rules.

Owner screening is intentionally light at onboarding. The physical inspection is the meaningful verification point; unclear cases can be escalated for documentation.

### Property model and discovery

- Launch countries: Kenya (`KES`) and Uganda (`UGX`). Country is a first-class attribute of property, city, currency, territory, and operational views.
- Initial taxonomy is broad: apartment, house, room, furnished stay, guesthouse, vacation home, land, office, shop, warehouse, commercial space, and other. Category-specific fields are rendered from a managed taxonomy rather than separate products.
- Every property supports independently configured **short-stay** and **long-term** offerings. Visitors switch modes on a property page and search in the intended mode.
- Short stay: owner-controlled calendar, nightly price, minimum nights, and guest details. Multiple inquiries can target the same available dates; dates remain open until owner confirmation, when the system atomically blocks the dates and automatically declines competing overlapping inquiries. This is not instant booking.
- Long term: monthly price, move-in date, and intended lease duration.
- A public price is mandatory. The public base rate is shown in its local currency and can be marked negotiable. Short-stay and long-term prices are visible in their respective mode views.
- Public location is neighborhood/area plus an approximate map pin. Exact address and coordinates are private verification data.
- Public routes will be country/city oriented (for example `/ke/nairobi/...` and `/ug/kampala/...`) and server-rendered with canonical metadata, structured data, and sitemaps.

### Inquiry and contact lifecycle

- Guest inquiry collects name, email, phone/WhatsApp number, mode-specific stay details, and message.
- On submission, both the owner and Betna staff are notified. Inquiries receive a reference number and visitor confirmation by email and WhatsApp.
- Listing pages also provide two prefilled WhatsApp actions: **Contact Betna** (country business number) and **Contact owner**. An email action routes to Betna. The app records outgoing contact clicks but cannot read external WhatsApp conversations.
- Betna reviews inquiries only during configured business hours. The visitor immediately sees that expectation; any admin may act on an urgent case outside those hours.
- Betna staff, not owners, approve/release exact location after reviewing a legitimate inquiry. Inquiry statuses include `new`, `contacted`, `location approved`, and `closed`, with audit history.
- Owners can decline or confirm their inquiries. On confirmation of a short stay, the system blocks the relevant calendar dates and declines competing inquiries; staff can assist, intervene, and correct disputed state. The owner reports a completed rental/stay, Betna staff verify first-payment evidence, and only then is the commission recorded as due.

### Translation and notifications

- The entire app shell, forms, dashboards, status labels, emails, and metadata support English and Tigrinya. Both use left-to-right layout. New languages, including future RTL languages, must be feasible.
- Owners submit property title/description in one language. Betna keeps the original, creates approved translations, records author/time, and allows English publication while Tigrinya is pending. Tigrinya UI falls back transparently to English listing content until approved translation exists.
- Critical notifications use in-app, email, and WhatsApp/SMS channels. Owners and visitors may select preference for nonessential updates. Notifications link to the relevant protected page and avoid sensitive information.
- Published listings alone enter sitemaps. Draft, pending, paused, fraud-investigation, and unpublished pages are inaccessible to search engines; removed listings return an appropriate unavailable response. Localized public pages publish canonical and `hreflang` metadata only for approved translations, and sitemap updates occur on publish, pause, unpublish, and translation publication.

### Commission workflow

- The owner owes Betna a percentage commission when they receive a successful renter/guest's first month/night payment. The renter/guest does not pay a separate Betna charge in this MVP.
- The same configured percentage applies to long-term and short stay at launch. It is stored as a configurable rule, and the applied percentage is snapshotted on each earned-commission record.
- Until payments are integrated, the managed rental-conversion workflow is: visitor inquiry, owner negotiation, owner reports agreement/completion, staff verify payment evidence, commission becomes due, staff record settlement. Staff manually record evidence (owner/guest confirmation, receipt, or payment reference), calculate the owner obligation from the first-payment amount, and manage lifecycle: `confirmed`, `commission due`, `paid`, `waived`, or `disputed`.

## Architecture decision

### Selected approach: Next.js + NestJS modular monolith

Use a TypeScript monorepo with separate deployable applications, sharing contracts and utilities:

```
apps/
  web/          Next.js App Router: public website + role-specific portals
  api/          NestJS: API, domain modules, integrations, jobs/workers
packages/
  contracts/    versioned request/response DTOs and shared domain types
  ui/           shared accessible design-system components
  config/       TypeScript, linting, formatting configuration
infra/          local Docker, deployment and CI definitions
```

Next.js owns server-rendered SEO pages, localized routing, forms, portal experiences, and backend-for-frontend calls. NestJS owns domain workflows and authorization; it is the stable API boundary for a future mobile client. Keep it a modular monolith: each module owns its use cases and persistence access, but deploy no microservices in the MVP.

NestJS modules: identity/access, owners, properties/taxonomy, verification, territories, media, availability, inquiry, notifications, translations, commissions, audit, and admin configuration. Future payments and travel integrations are adapters/modules rather than part of core workflow code.

### Alternatives considered

1. **Next.js only:** cheaper/faster initially, but places complex verification, commission, external communication, and future mobile API responsibilities in one web application. Rejected for weaker long-term separation.
2. **Next.js + NestJS modular monolith:** selected; operational business rules stay API-owned while UI and SEO remain strong.
3. **Microservices from launch:** rejected; complexity and operational cost are not justified before marketplace volume or independently scaling integrations exist.

## Data and technical foundations

- PostgreSQL is the system of record. Enable PostGIS for exact internal geographic coordinates and approximate public-map queries.
- Use an ORM/migrations layer selected by the builder; relational constraints and transactions enforce lifecycle integrity.
- S3-compatible object storage holds public listing media and private inspection evidence in separate buckets/prefixes with private, expiring access URLs for evidence. Uploads enforce configurable file-size/count/type limits, malware scanning, server-side image processing and thumbnail generation. Private inspection evidence is retained indefinitely after a listing is removed, subject to strict role-based access and audit logs.
- A job queue and Redis support notification delivery, retryable communication, image processing, reminders, and later webhooks. User-visible actions remain transactional even when messages are queued.
- Search begins with PostgreSQL full-text/filter indexes and PostGIS. Introduce a dedicated search service only when relevance/scale demands it.
- Use server-side validation at every API boundary, secure sessions/tokens, role/territory authorization, rate limits/spam controls for guest forms, immutable audit events for sensitive actions, and idempotent notification/integration processing. Owners may sign in by email/password or phone OTP; WhatsApp codes are available for staff sign-in/recovery without mandatory MFA. Implement configurable OTP rate limits, account-recovery throttles, session expiry/revocation, and confirmation for sensitive identity/contact changes.
- Verification uses a mandatory baseline (identity/authorization, exact location, current photos, stated price, category, and safety/condition notes) plus configurable category-specific checklists for residential, land, and commercial listings. Inspection evidence and pass/fail/document-escalation rules are administratively managed.
- Verifier inspection forms are mobile-first and offline capable: drafts and encrypted upload queues remain on-device, a submitted report may be `pending upload`, and automatic retry resumes on connectivity. An admin cannot approve the report until required evidence has synced and passed validation.

## Page and route areas

- Public: home, search results, map/list discovery, country/city/category landing pages, property detail, guest inquiry confirmation, informational pages.
- Owner portal: sign-in/onboarding, portfolio, listing creation/editing, media, calendar, inquiries, verification status, notification preferences.
- Verifier portal: assigned inspections, inspection detail, checklists/evidence capture, report submission, territory/profile.
- Admin portal: submissions, inspections/assignments, review/publishing, translation queue, inquiries/location release, owner/user controls, taxonomy/territories, commission ledger, audit log.

## Constraints and builder calls

- Design mobile-first; owner, verifier, and admin portals must work on low-bandwidth mobile devices.
- Use no live third-party payment or travel integrations in MVP, but define adapter interfaces rather than embedding provider assumptions.
- Use production-grade managed PostgreSQL/object storage/Redis when deploying; exact vendor is a builder/deployment decision.
- Select the authentication provider/library, WhatsApp/SMS provider, email provider, maps provider, ORM, and hosting provider during implementation based on availability, pricing, and local-country support.
- Initial countries use business hours configured per country; exact hours are admin configuration.
