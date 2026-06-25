# QMS Document Control — Phase 1 + 2 + 3 + 4

Phase 1 (§9): Firebase project + custom claims, Auth, RBAC middleware/
proxy, Org profile CRUD, Department CRUD, Document CRUD (no workflow),
dashboard skeleton.

Phase 2 (§9): `document_versions` upload + Storage integration, the full
§5 approval state machine, `document_approvals` rows, in-app
notifications (§7), and ISO clause pages + clause↔document mapping.

Phase 3 (§9): Audit Trail UI, Vision & Mission module (simplified
propose→approve), Settings/Numbering (format validation), and the
Access Control UI Phase 1 left as a dead link.

Phase 4 (§9): Dashboard charts (Recharts — status distribution,
department breakdown, all computed from live RBAC-scoped data), global
search (client-side instant, per explicit decision — see "Known gaps"),
Excel export of the document list (PDF export deferred per explicit
priority decision — same data-shaping pattern, not yet built), and
favorites/recently-viewed documents (auto-tracked on page view, per
explicit decision, with throttling to control write costs).

**Stack actually installed:** Next.js 16.2.9 (App Router, Turbopack),
React 19.2.4, TypeScript, Tailwind v4, shadcn/ui (New York style),
Firebase (Auth, Firestore, Storage), Firebase Admin SDK, Cloud Functions
v2. This deviates from the original spec's "Next.js 15" by explicit
decision — see the note at the top of `src/proxy.ts` for what changed
(middleware.ts → proxy.ts is the only breaking rename that affected this
codebase).

## What is and is NOT verified

**Verified in this environment** (ran the actual tool, not just read the
code):
- `npx tsc --noEmit` — clean, both the Next.js app and `functions/`
- `npx eslint src` — clean
- `npm run build` — full production build succeeds, all 18 routes
  compile and prerender correctly (added in Phase 4: `/search`,
  `/api/export/documents`)
- **`npm run test:unit`** — 57 tests across four files, all passing:
  - `tests/permissions.test.ts` (28) — §5 state machine + RBAC matrix.
  - `tests/numbering-template.test.ts` (15) — numbering format validation.
  - `tests/export-xlsx.test.ts` (7, new in Phase 4) — generates a real
    .xlsx buffer and reads it back with ExcelJS to confirm sheet names,
    header row, data rows, human-readable status/type labels, and
    null-date handling are all correct. This is not "the function
    didn't throw" — it's "the file that downloads is structurally
    correct."
  - `tests/dashboard-metrics.test.ts` (7, new in Phase 4) — status
    counting, department grouping, the "Unassigned" fallback, and the
    due-for-review date-boundary logic (including the inclusive-boundary
    edge case: a document due exactly *now* counts as due).

**NOT verified — you must run these yourself before trusting this in
production:**
- **`tests/firestore-rules.tenant-isolation.test.ts`** (`npm run
  test:rules`) — same sandbox limitation as every previous phase.
  Note: this test file does NOT cover the new `user_document_interactions`
  collection's rules (favorites/recent) — those rules were reasoned
  through carefully (see the long comment in `firestore.rules` about
  the `list` rule's real limitation) but never exercised against a live
  emulator. Add coverage for it before relying on those rules in
  production.
- The actual Excel download end-to-end (hitting `/api/export/documents`
  in a real browser, confirming the file opens correctly in Excel) —
  the unit tests verify the buffer's internal structure via ExcelJS,
  which is strong evidence but not the same as a human opening the
  downloaded file.
- Global search's in-memory filtering against a REAL multi-hundred-
  document index for performance — reasoned to be fine at expected
  scale (see the comment in `app/actions/search.ts`), not load-tested.
- The recordView() throttle's actual behavior under real concurrent
  page loads (e.g. two browser tabs open to the same document) — the
  throttle window is a simple time-based check, not synchronized across
  concurrent requests, so two near-simultaneous requests could both pass
  the throttle check before either one's write lands. Harmless for this
  feature's purpose (a "recently viewed" list doesn't need exact
  precision), but worth knowing if you ever reuse this pattern somewhere
  that does need precision.

## Setup

### 1. Create the Firebase project

```bash
firebase login
firebase projects:create <your-project-id>
# or use an existing project: firebase use <your-project-id>
```

Enable in the Firebase Console: Authentication (Email/Password provider
at minimum), Firestore (production mode), Storage.

### 2. Get credentials

**Client config** (Project Settings → General → Your apps → Web app):
copy into `.env.local` as the `NEXT_PUBLIC_FIREBASE_*` values.

**Admin SDK config** (Project Settings → Service Accounts → Generate new
private key): downloads a JSON file. Map its fields into `.env.local`:
- `project_id` → `FIREBASE_PROJECT_ID`
- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY` (keep the `\n` escapes literal,
  wrap the whole value in quotes)

```bash
cp .env.example .env.local
# then fill in the values above
```

**Never commit `.env.local`** — `.gitignore` already excludes it, but
double-check before your first push.

### 3. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### 4. Run the mandatory tenant-isolation test

This is §11 handoff note #4 — do this before writing any more app code,
not after.

```bash
firebase emulators:exec --only firestore,auth \
  --project <your-project-id> \
  "npx vitest run tests/firestore-rules.tenant-isolation.test.ts"
```

If this fails, **do not proceed to Phase 2** until it passes — a failure
here means `firestore.rules` has a tenant-isolation gap, which is risk #4
in the register (§10), the highest-priority risk in the whole spec.

### 4b. Run the permission/state-machine unit tests (no emulator needed)

```bash
npm run test:unit
```

These don't need Firebase at all — pure-function tests over
`lib/rbac/permissions.ts`. Run them on every change to that file; they're
fast (under a second) and they're what actually caught the approval
segregation-of-duty decision and the illegal-transition rejections being
correct, rather than just commented as correct.

### 5. Set up custom claims for your first Super Admin

New users get a `users/{uid}` Firestore doc but claims only sync via the
`syncUserRoleClaim` Cloud Function once it's deployed, or instantly via
`setUserRoleClaim` if created through the `inviteUser` server action.
For your very first user (before any UI exists to invite anyone), do it
manually:

```bash
cd functions && npm run build
firebase deploy --only functions
```

Then create the first user + Firestore doc + claims via a one-off script
or the Firebase Console + Admin SDK, since `inviteUser` requires an
existing authenticated super_admin session to call it (chicken-and-egg
for user #1, by design — there is no public "become admin" endpoint).

### 6. Run the app

```bash
# Against the Emulator Suite (recommended for development, per §11 note #1):
firebase emulators:start
# in another terminal:
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev

# Against real Firebase (be careful — this writes real data):
npm run dev
```

### 7. Deploy rules/indexes/functions

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage:rules,functions
```

## Post-Phase-4 changes (per direct request)

These came after Phase 4 was marked complete, in response to specific
UX/structural feedback rather than the original spec's phase plan:

- **Sidebar restructure**: "ISO Clauses" in the sidebar is now a
  collapsible section (clicking it only toggles expand/collapse — it
  does not navigate anywhere), with a clause tree underneath (parent
  clauses, each expandable to their sub-clauses). **The standalone
  `/clauses` list page was REMOVED** per explicit decision — individual
  clause pages (`/clauses/[clauseId]`) are now reached only through the
  sidebar tree or a direct link. If you want a `/clauses` overview page
  back, that's a few lines plus a sidebar link, not a structural change.
- **Document↔Clause linking, both directions**:
  - From the document side: the create-document form now has a clause
    picker (multi-select, grouped by parent clause, optional). Extracted
    as `ClausePickerList` so the exact same picker UI is used both here
    and in the existing per-document `ClauseTagger` (edit screen) — no
    duplicated picker logic.
  - From the clause side: the clause detail page now has "Link existing
    document" (search/pick from documents you can already see, add this
    clause to them) and "New document" (jumps to the create form with
    this clause pre-selected via `?clauseId=` query param). Both
    converge on the same `updateDocumentMetadata`/`createDocument`
    Server Actions the document-side UI already used.
- **Per-clause custom content/dashboards — explicitly DESCOPED.** The
  original request asked for clause-specific data (e.g. external/internal
  issues for Clause 4) with its own dashboard per clause. After
  discussing the scope (each ISO 9001 clause would need a genuinely
  different schema, and "universal across all deployments" is a much
  stronger claim than ISO 9001 compliance itself supports), this was set
  aside in favor of making document↔clause mapping itself solid. If
  this comes back later, treat it as N separate small features, not one
  generic system.
- **Department management was a real gap, now fixed**: there was NO UI
  anywhere to create, rename, or delete a department, or to set/change
  a department's head, despite `createDepartment` existing as a server
  action since Phase 1. Also added: `updateDepartment` and
  `deleteDepartment` (neither existed before at all). `deleteDepartment`
  refuses to delete if any document or user still references that
  department, per explicit decision, to avoid orphaned `departmentId`
  references.
- **Organization profile editing was also a real gap, now fixed**: the
  organization page only ever displayed the profile; `updateOrganizationProfile`
  had existed as a server action since Phase 1 with no UI calling it.
- **ISO clause seeding moved from the (now-removed) `/clauses` page to
  the Organization page** — shown only when the org has zero clauses
  yet.

## Known gaps / deliberate deferrals (read before Phase 3)

**Carried over from Phase 1:**
- Review-date transitions are manual, not scheduled.
- Token revocation has a live-session blind spot.
- Document Controller cannot approve their own submissions (now backed
  by `tests/permissions.test.ts`, not just a comment).
- `document_versions` IDs are deterministic, not auto-generated.
- Custom claims carry `orgId`/`departmentId`, not just `role`.
- The Firestore-write-then-claims-call in `changeUserRole` is not atomic.

**New in Phase 4:**
- **PDF export is not implemented** — per explicit priority decision,
  Excel shipped first. The data-fetching/shaping pattern in
  `lib/export/fetch-documents.ts` is reusable for a PDF version; only
  `lib/export/documents-xlsx.ts`'s rendering layer would need a PDF
  equivalent (e.g. via `@react-pdf/renderer` or `pdf-lib`).
- **Global search is genuinely client-side** per explicit decision —
  the FULL lightweight index (all visible documents + clauses + a
  couple of org fields) downloads to the browser once per `/search`
  visit, then every keystroke filters in memory. Read the large comment
  block at the top of `app/actions/search.ts` for exactly what fields
  are and aren't included (no document `description`, no file URLs, no
  PII) and the scale ceiling this approach has (fine for hundreds of
  documents, not designed for tens of thousands).
- **`user_document_interactions` (favorites/recent) is a Phase 4
  addition with no equivalent in the original spec's §3 data model** —
  it's a new collection, new Firestore indexes, and new rules, not a
  field added to an existing collection.
- **Recent-view auto-tracking is throttled to one write per 5 minutes
  per (user, document) pair** — a deliberate cost-control decision (see
  the comment above `recordView` in `app/actions/favorites.ts`), not a
  correctness mechanism. Don't rely on `lastViewedAt` for anything that
  needs second-level precision.
- **The dashboard's department breakdown and status distribution charts
  use the SAME row-level RBAC scoping as every list view** — a
  department_user's dashboard only reflects their department's
  documents, a read_only's dashboard only reflects effective documents.
  There is no separate "see everything" admin dashboard data path.

**New in Phase 3:**
- **Vision & Mission's "reject" flow has a first-proposal edge case** —
  if a draft is rejected and there is NO prior approved history (i.e.
  this was the very first-ever proposal for that type), there's nothing
  to revert to, so the rejected draft's content is marked "approved" by
  fiat rather than truly discarded. Flagged explicitly in the comment
  above `rejectVisionMissionEdit` in `app/actions/vision-mission.ts`.
- **Numbering templates validate format only, never auto-generate** —
  per explicit decision. A Document Controller can still type a
  document number that doesn't match ANY configured template if no
  template exists for that document type yet; enforcement is opt-in per
  type, configured from Settings → Numbering.
- **The numbering-template format hint on the document creation form is
  intentionally NOT gated by Settings access** — Settings (viewing/
  changing the template) is Super-Admin-only per §2, but the hint is
  shown to anyone who can create documents (Document Controller
  included), via a separate, narrower `getNumberingTemplatesForHint()`
  action rather than reusing the Settings-gated `getOrgSettings()`. This
  was an actual bug introduced and then caught mid-implementation —
  gating the hint behind Settings access would have hidden it from
  exactly the role that needs it most.
- **Audit Trail pagination is cursor-based but the UI doesn't expose a
  "load more" control yet** — `listAuditLogs` supports `startAfterId`,
  but the page only renders the first page. Wire up pagination controls
  before this audit log gets large enough that "most recent 50" stops
  being sufficient for a real investigation.

**New in Phase 2:**
- **Approval authority has no per-document assignment** — §2/§3 don't
  model "this specific MR is the approver for this document," so
  `submitForReview` notifies EVERY `management_representative` in the
  org, and whoever acts first becomes `approverId`. If GIN/DBG needs
  per-department assigned approvers, that's a schema addition (see the
  comment block at the top of `app/actions/approvals.ts`), not a quick
  tweak.
- **Revision-number race window** — `reserveVersionUploadPath` computes
  the next revision number from current state, but two concurrent
  reservations for the same document (rare — would need two people
  uploading to the same Draft at literally the same moment) can still
  collide. `recordUploadedVersion` detects the mismatch and throws
  rather than silently corrupting data, but doesn't auto-retry. See the
  comment above `reserveVersionUploadPath`.
- **`listPendingApprovals` and the dashboard's pending-approval count do
  a Firestore read-then-filter in application code**, not a single
  query — `document_approvals` has no `orgId` field of its own (§3's
  schema), so cross-org filtering happens after fetching all pending
  rows globally. Fine at expected QMS data volumes (tens to low hundreds
  of pending approvals); revisit with a denormalized `orgId` field if
  that assumption stops holding — see the comment in
  `app/actions/approvals.ts`.
- **Office file preview (DOCX/XLSX/PPTX) is explicitly NOT implemented**
  per §6's own recommendation — those files upload and download
  correctly, but only PDF gets an in-app preview commitment. The
  version history table's "Download" button is the only way to view a
  non-PDF revision in v1. Don't let this get demoed as "preview" to
  GIN/DBG without the caveat — §6 flagged this explicitly so it
  wouldn't be discovered during UAT.
- **"Compare versions" is metadata-diff only** (revision date, changed
  by, change description, side-by-side download) — there is no
  content-diff button anywhere, and none should be added without the
  explicit scoping/budget conversation §6 calls for.
- **ISO clause seeding is one-shot and non-destructive-by-refusal** —
  `seedIsoClauses` throws if the org already has any clauses, rather
  than offering a "re-seed" option that could silently wipe
  customizations. Deleting and re-seeding is a manual two-step process
  by design.

## Project structure

Matches §8 with one addition: `functions/` for Cloud Functions (not in
the original spec's folder diagram, needed for the custom-claims sync
trigger per §11 note #2).
