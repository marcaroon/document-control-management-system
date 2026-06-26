# QMS Document Control

A Quality Management System document control application built around ISO 9001:2015 document lifecycle
management.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui · Firebase (Auth, Firestore) · Cloudinary (file storage) ·
ExcelJS · Recharts.

---

## Table of Contents

1. [Core Features](#core-features)
2. [Project Structure](#project-structure)
3. [Setup](#setup)
4. [Data Model Overview](#data-model-overview)
5. [Usage Guide](#usage-guide)
6. [Useful Commands](#useful-commands)
7. [Technologies Used](#technologies-used)
8. [License & Support](#license--support)

---

## Core Features

### Document control & lifecycle
- Document CRUD with a configurable document-number format check per
  document type (manual entry, validated against an org-defined
  template like `QM-{number}` — not auto-generated).
- Full approval workflow: **Draft → Submitted for Review → Effective**,
  with **Reject**/**Request Revision** branches back to Draft, plus
  **Start Review** (Effective → Under Review), **Confirm Current**
  (back to Effective) or a fresh revision (back to Draft), and
  **Supersede** (Effective → Obsolete → Archived). See
  [Usage Guide](#usage-guide) for the full diagram.
- File upload and versioning, stored on Cloudinary. The first revision
  can be attached directly from the create-document form, or uploaded
  later from the document page. Every upload becomes a new, immutable
  revision row — nothing is ever overwritten.
- In-app PDF preview (page-by-page, via Cloudinary's PDF-to-image
  transformation). Word/Excel/PowerPoint files upload and download
  correctly but have no rendered in-app preview.
- Per-document audit history and a real-time notification feed (submit/
  approve/reject/request-revision events) for everyone involved.

### ISO 9001 clause management
- Org-specific ISO 9001:2015 clause tree (clauses 4–10 with their
  sub-clauses), one-time seeded per organization, editable afterward
  without affecting other organizations.
- Two-way document↔clause linking: tag clauses from a document (create
  form or edit screen), or link/create a document from a clause's own
  page.
- Sidebar navigation for the clause tree (expandable, no standalone
  clause-list page — see [Usage Guide](#usage-guide)).

### Organization & access management
- Organization profile (name, industry, address, quality policy, etc.)
  with an edit screen.
- Department management: create, rename, assign a department head,
  delete (blocked if any document or user still references it).
- User management: invite users with a one-time temporary password,
  change roles (which immediately revokes the affected user's active
  session — see [Data Model Overview](#data-model-overview)).
- Five fixed roles with a documented permission matrix: **Super Admin**,
  **Document Controller**, **Management Representative**, **Department
  User** (scoped to their own department), **Read Only** (sees
  Effective documents only).

### Governance modules
- Immutable, system-generated audit trail (filterable by module),
  covering every mutating action in the app — no role can edit or
  delete an audit log entry.
- Vision & Mission module with a propose → approve flow and version
  history.
- Numbering template configuration per document type.

### Analytics, search, export
- Dashboard with live metrics (status breakdown, department breakdown,
  pending approvals, due-for-review count) — all respecting the same
  role-based scoping as everywhere else in the app.
- Global instant search across documents, clauses, and a couple of
  organization fields (client-side, no server round-trip per
  keystroke).
- Excel export of the visible document list.
- Favorites and a "recently viewed" list per user, on the dashboard.

---

## Project Structure

```
qms-app/
├── functions/                   # Firebase Cloud Functions (separate package)
│   └── src/index.ts             #   syncs role custom claims on user doc writes
├── scripts/
│   └── seed-accounts.ts         # standalone test-account seeder (see Setup)
├── src/
│   ├── app/
│   │   ├── (auth)/login/        # login page
│   │   ├── (dashboard)/         # everything behind the sidebar layout
│   │   │   ├── dashboard/
│   │   │   ├── documents/[id]/, documents/new/
│   │   │   ├── clauses/[clauseId]/        # no standalone /clauses list page
│   │   │   ├── organization/
│   │   │   ├── vision-mission/
│   │   │   ├── audit-trail/
│   │   │   ├── search/
│   │   │   └── settings/access-control/, settings/numbering/
│   │   ├── actions/             # Server Actions, one file per domain
│   │   │   ├── documents.ts, versions.ts, approvals.ts
│   │   │   ├── clauses.ts, vision-mission.ts
│   │   │   ├── organization.ts, users.ts, settings.ts
│   │   │   ├── audit.ts, search.ts, favorites.ts, dashboard-metrics.ts
│   │   └── api/                 # Route Handlers (session cookie, Excel export)
│   ├── components/
│   │   ├── ui/                  # shadcn primitives
│   │   ├── documents/, clauses/, organization/, settings/, vision-mission/
│   │   ├── dashboard/, audit/, search/, shared/
│   │   └── providers/           # auth-provider.tsx (live claims/revocation)
│   ├── lib/
│   │   ├── firebase/            # admin.ts (server), client.ts (browser)
│   │   ├── cloudinary/          # server.ts (signed upload/download), resource-type.ts (pure)
│   │   ├── auth/session.ts      # cookie-based session verification
│   │   ├── rbac/permissions.ts  # the permission matrix + state machine, as code
│   │   ├── types/                # core.ts, document.ts, audit.ts
│   │   ├── numbering/, dashboard/, export/, seed/, storage/
│   │   └── utils.ts
│   ├── middleware → proxy.ts    # route protection (Next.js 16 naming)
│   └── app/globals.css          # design tokens (status colors, etc.)
├── tests/                       # see Useful Commands
├── firestore.rules / .indexes.json
├── firebase.json
└── .env.example
```

The permission matrix in `lib/rbac/permissions.ts` and the Firestore
rules in `firestore.rules` are two independent expressions of the same
RBAC model — TypeScript can't import into security rules, so they're
kept in sync by hand. If you change one, check the other.

---

## Setup

### 1. Firebase project

```bash
firebase login
firebase projects:create <your-project-id>   # or: firebase use <existing-project-id>
```

Enable in the Firebase Console: **Authentication** (Email/Password
provider), **Firestore** (production mode). Firebase Storage is **not**
used by this app — file storage is Cloudinary (next step).

### 2. Cloudinary project

Create a free Cloudinary account if you don't have one, then grab your
**Cloud name**, **API key**, and **API secret** from the dashboard.

### 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in:
- `NEXT_PUBLIC_FIREBASE_*` — from Firebase Console → Project Settings → Your apps
- `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` —
  from a service account key (Project Settings → Service Accounts →
  Generate new private key); keep the `\n` escapes literal, wrap the
  value in quotes
- `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` —
  from the Cloudinary dashboard; also set the two `NEXT_PUBLIC_CLOUDINARY_*`
  copies (cloud name and API key are safe to expose; the secret is not
  and must stay server-only)
- `SEED_PASSWORD` — only needed if you'll run the account seeder (step 6)

**Never commit `.env.local`.**

### 4. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 5. Deploy Firestore rules, indexes, and the custom-claims Cloud Function

```bash
cd functions && npm run build && cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions
```

The Cloud Function (`functions/src/index.ts`) keeps each user's role/
org/department **custom claims** in sync with their `users/{uid}`
Firestore document — this is the dependency the entire RBAC model
relies on, since both Server Actions and Firestore rules read role/org/
department from the auth token, not from a database lookup.

### 6. Create your first accounts

There's no public "sign up" flow — accounts are created by a Super
Admin from inside the app, which means you need at least one Super
Admin to already exist. Two ways to get there:

**Option A — the seeder (fastest for trying the app out):**
```bash
npm run seed:accounts
```
Creates one organization, two departments, and six accounts — one per
role, plus a second Department User in a different department so
cross-department scoping is actually testable. See
[Useful Commands](#useful-commands) for exactly what it creates and the
emails/role list it prints.

**Option B — manual, for a real deployment:** create the first user via
the Firebase Console or the Admin SDK directly, then set their custom
claims (`role: "super_admin"`, `orgId`, `departmentId: null`) and a
matching `users/{uid}` Firestore document by hand. Every subsequent
user can then be created from **Settings → Access Control** inside the
app.

### 7. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, sign in with one of the seeded accounts
(or the one you created manually), and you should land on the
dashboard.

### 8. (Recommended) Run against the Firebase Emulator Suite first

```bash
firebase emulators:start
# in another terminal:
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
```

Especially worth doing before your first deploy — see
[the mandatory tenant-isolation test](#useful-commands) below.

---

## Data Model Overview

All collections are scoped by `orgId` and
every Firestore rule and Server Action filters by it. Timestamps are
Firestore server timestamps unless noted.

| Collection | Purpose | Notes |
|---|---|---|
| `organizations/{orgId}` | Org profile (name, industry, quality policy, etc.) | |
| `users/{uid}` | App user — role, department, active flag | doc ID **is** the Firebase Auth UID |
| `departments/{id}` | Department name + head user | |
| `documents/{id}` | The document master record (number, title, type, status, current revision pointer, clause tags) | `status` drives the workflow; `clauseIds[]` is the document↔clause link |
| `document_versions/{id}` | One row per uploaded revision — **append-only** | deterministic ID (`{documentId}_v{N}`); `fileUrl` is a Cloudinary `public_id`, not a URL; `resourceType` (`image`/`raw`) determines whether preview is possible |
| `document_approvals/{id}` | One row per submit-for-review cycle — **append-only** | `decision`: pending / approved / rejected / revision_requested |
| `document_reviews/{id}` | Periodic-review outcomes (distinct from approvals) | written when a Document Controller confirms a document is still current |
| `iso_clauses/{id}` | This org's own copy of the ISO 9001:2015 clause tree | `parentClauseId` links sub-clauses to their main clause |
| `vision_mission/{id}` | One row per type (`vision`/`mission`) | `status`: draft (pending approval) / approved |
| `vision_mission/{id}/history/{id}` | Previous approved versions — **append-only** | |
| `notifications/{id}` | Per-user notification inbox | scoped to `userId === auth.uid`, both in rules and in every query |
| `audit_logs/{id}` | Every mutating action, system-generated — **append-only, no role can write to it directly** | the single source of truth for "who did what, when" |
| `settings/{orgId}` | Numbering templates, etc. | Super Admin only |
| `user_document_interactions/{uid}_{documentId}` | Favorites + last-viewed timestamp per (user, document) pair | not in the original spec; added for the dashboard's Favorites/Recent widgets |

**Auth custom claims** (`role`, `orgId`, `departmentId`) are the
authoritative source of identity for both Server Actions and Firestore
rules — never a database lookup, to avoid the latency/race-condition
anti-pattern Firestore rules are prone to. Changing a user's role
**immediately revokes their active session** (`revokeRefreshTokens`),
closing the gap where a demoted user could otherwise keep their old
permissions for up to an hour.

---

## Usage Guide

### Document lifecycle (the core workflow)

```
Draft ──submit_for_review──▶ Submitted for Review
  ▲                                   │
  │                      ┌────────────┼────────────┐
  │                   approve      reject     request_revision
  │                      │            │            │
  │                      ▼            └─────┬──────┘
  │                  Effective               ▼
  │                /    │    \           (back to Draft)
  │         start_review │  supersede
  │              │       │       │
  │              ▼       │       ▼
  │        Under Review  │   Obsolete
  │          /      \    │       │
  │  confirm_current  start_new_revision   archive
  │         │              │         │
  └─────────┴──────────────┘         ▼
        (back to Effective/Draft)  Archived (terminal)
```

- **Submit for review** requires at least one uploaded revision —
  Document Controller or Super Admin.
- **Approve / Reject / Request Revision** — Management Representative
  or Super Admin only. Document Controller **cannot approve their own
  submission** (deliberate segregation of duty).
- **Start Review** / **Confirm Current** are manual actions, not a
  scheduled job — there's no background process moving documents to
  "Under Review" when a review date passes; a Document Controller (or
  above) decides when to start a review.
- **Supersede** and **Archive** retire a document outside the normal
  revision cycle.

### Creating a document

From **Documents → New document**: pick a type and department, type a
document number (validated against that type's numbering template if
one is configured), optionally tag ISO clauses, and optionally attach
the first file right there — no separate trip to the document page
required. If the upload fails after the document itself was created
successfully, the document still exists as an empty Draft; finish the
upload from its page.

### Working with ISO clauses

There's no standalone "all clauses" page — open the **ISO Clauses**
section in the sidebar to expand the tree (main clauses 4–10, each
expandable to its sub-clauses) and click through to a specific clause's
page. From there you can see every document already linked to it, link
an existing document, or jump to "New document" with that clause
pre-selected.

### Roles, at a glance

| Role | Can do |
|---|---|
| **Super Admin** | Everything, including org/department/user/settings management |
| **Document Controller** | Create/edit/archive documents, upload revisions, submit for review, manage ISO clauses |
| **Management Representative** | Approve/reject/request revision on submissions; read everything |
| **Department User** | Full read/write within their own department's documents only |
| **Read Only** | Read access to Effective documents only, org-wide |

### Notifications & audit trail

Every submit/approve/reject/request-revision action notifies the
relevant person in-app (bell icon, top right). Every mutating action —
not just workflow ones — writes an audit log row automatically; browse
and filter it from the **Audit Trail** page, or see a single document's
history on its own page.

---

## Useful Commands

```bash
npm run dev              # local dev server
npm run build             # production build
npm run start             # run a production build locally
npm run lint               # ESLint

npm run seed:accounts     # create test org + departments + one account per role
                            #   (idempotent — safe to re-run; resets passwords to
                            #   whatever SEED_PASSWORD currently is)

npm run test:unit          # pure-function tests, no Firebase/emulator needed —
                            #   permission matrix + state machine, numbering
                            #   template validation, Excel export structure,
                            #   dashboard metrics aggregation, Cloudinary
                            #   resource-type resolution (66 tests total)
npm run test:rules         # MANDATORY tenant-isolation test, via the Firebase
                            #   emulator — run this before trusting firestore.rules
                            #   in production (requires `firebase emulators:start`
                            #   to be reachable; see Setup step 8)
```

Cloud Functions (separate package):
```bash
cd functions
npm run build              # compile TypeScript
npm run deploy              # deploy to Firebase
npm run logs                 # tail function logs
```

Firebase CLI, from the project root:
```bash
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only functions
firebase emulators:start    # local Auth + Firestore emulator
```

---

## Technologies Used

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Route Handlers) |
| UI | React 19, TypeScript, Tailwind CSS v4, shadcn/ui (New York style), Radix UI primitives, lucide-react icons |
| Charts | Recharts |
| Auth & database | Firebase Authentication, Cloud Firestore, Firebase Admin SDK |
| Custom-claims sync | Firebase Cloud Functions (2nd gen) |
| File storage | Cloudinary (signed uploads, authenticated assets, PDF-to-image preview transformation) |
| Spreadsheet export | ExcelJS |
| Validation | Zod |
| Testing | Vitest, `@firebase/rules-unit-testing` |
| Tooling | ESLint 9, tsx (standalone script runner), dotenv |

---

## License & Support

This is a bespoke internal application built for PT Total Quality Indonesia there is no open-source license attached, and it
is not intended for redistribution outside that engagement.

**Support / questions:** route them back through whoever commissioned
this build rather than to any public issue tracker — there
isn't one. If you're a developer picking this codebase up, the most
useful first stops are:
- This README's [Data Model Overview](#data-model-overview) and
  [Usage Guide](#usage-guide) for how the pieces fit together
- The comment blocks in `lib/rbac/permissions.ts`,
  `lib/cloudinary/server.ts`, and `app/actions/*.ts` — most non-obvious
  decisions are explained inline, right where the relevant code is,
  rather than only in this file
- [Known Gaps and Deliberate Deferrals](#known-gaps-and-deliberate-deferrals)
  below before assuming something is a bug rather than a documented
  trade-off