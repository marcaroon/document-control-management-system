# Document Control Management System

A comprehensive ISO 9001 document control and compliance management system supporting multi-tenant organizations, role-based workflows, and complete audit trails. Built with Next.js, Firebase/Firestore, and Cloudinary for document storage.

## Key Features

- **ISO Compliance**: Pre-configured ISO 9001:2015 clauses with document mapping
- **Document Control**: Full versioning, approvals, and audit trails
- **Role-Based Access**: Super Admin, Document Controller, Management Representative, Department User, Read-Only
- **Multi-Tenant**: Complete data isolation per organization with Firestore security rules
- **File Storage**: Cloudinary integration for document uploads/downloads
- **Real-time Sync**: Custom user claims via Cloud Functions for instant permission updates
- **Numbering Templates**: Configurable document numbering per type and department

## System Architecture

- **Frontend**: Next.js 16+ with React 19, deployed with Server Actions
- **Backend**: Firestore (real-time database), Cloud Functions (custom claims sync)
- **Auth**: Firebase Authentication with Email/Password
- **Storage**: Cloudinary (primary file storage)
- **Testing**: Vitest with Firestore emulator for rules/isolation testing

---

## Installation & Setup

### Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- npm or yarn
- Cloudinary account (free tier works for development)

### 1. Create Firebase Project

```bash
firebase login
firebase projects:create <your-project-id>
# or use an existing project: firebase use <your-project-id>
```

In the Firebase Console, enable:

- **Authentication**: Email/Password provider
- **Firestore**: Production mode with rules (uploaded later)
- **Storage**: For backup (primary is Cloudinary)
- **Cloud Functions**: For custom claims sync

### 2. Create Cloudinary Account

Setup time: ~2 minutes (free tier)

1. Sign up at [cloudinary.com](https://cloudinary.com)
2. Go to **Dashboard** → note your **Cloud Name**, **API Key**, **API Secret**
3. Keep API Secret private (server-side only)

### 3. Get All Required Credentials

**Firebase Client Config** (Project Settings → General → Your apps → Web app):
Copy all `NEXT_PUBLIC_FIREBASE_*` values.

**Firebase Admin SDK** (Project Settings → Service Accounts → Generate new private key):

- Download JSON file and extract:
  - `project_id` → `FIREBASE_PROJECT_ID`
  - `client_email` → `FIREBASE_CLIENT_EMAIL`
  - `private_key` → `FIREBASE_PRIVATE_KEY`

**Note**: Keep the literal `\n` in the private key when copying.

### 4. Configure Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with ALL values:

```dotenv
# ===== Firebase Client (PUBLIC, safe in browser) =====
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=false

# ===== Firebase Admin (SERVER ONLY, never expose) =====
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="...keep \n literal..."

# ===== Cloudinary (PRIMARY file storage) =====
# CLOUDINARY_API_SECRET must NEVER be exposed to browser
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
NEXT_PUBLIC_CLOUDINARY_API_KEY=

# ===== Test Data Seeding (optional) =====
SEED_PASSWORD=Password123!
SEED_ORG_ID=my-org
SEED_ORG_NAME=My Organization
```

**Critical**: `.env.local` is already in `.gitignore` — **never commit it**.

### 5. Install Dependencies

```bash
# Root project
npm install

# Cloud Functions (required for custom claims sync)
cd functions && npm install && cd ..
```

### 6. Build & Deploy Cloud Functions

Cloud Functions handle custom user claims sync (permission updates sync instantly to all sessions):

```bash
cd functions && npm run build
firebase deploy --only functions
```

### 7. Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 8. Run Mandatory Tests

**Firestore tenant-isolation test** (security rules validation):

```bash
firebase emulators:exec --only firestore,auth \
  "npx vitest run tests/firestore-rules.tenant-isolation.test.ts"
```

If this fails, **STOP** — tenant isolation is the highest security priority. Fix before proceeding.

**RBAC & unit tests** (no emulator needed):

```bash
npm run test:unit
```

### 9. Seed Test Data (Optional)

**Option A: Seed ISO clauses only** (recommended first run)

1. Start emulator:
   ```bash
   firebase emulators:start
   ```
2. In another terminal, seed clauses via admin tools — or use the Organization page UI once app is running (appears when org has zero clauses)

**Option B: Seed test accounts** (6 roles × 2 departments for full RBAC testing)

Edit `.env.local`:

```dotenv
SEED_ORG_ID=test-org-123
SEED_ORG_NAME=Test Organization
SEED_PASSWORD=TestPass123!
```

Then run:

```bash
npm run seed:accounts
```

This creates:

- super_admin@mail.com (Super Admin)
- controller@mail.com (Document Controller)
- mr@mail.com (Management Representative)
- qa-user@mail.com (Department User — QA)
- production-user@mail.com (Department User — Production)
- readonly@mail.com (Read Only)

### 10. Run the Application

**Option A: Development with Emulator (Recommended)**

Terminal 1:

```bash
firebase emulators:start
```

Terminal 2:

```bash
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

**Option B: Against Real Firebase**

```bash
npm run dev
```

**Note**: This writes real data to your Firebase project. Use a dedicated test project.

---

## Deployment to Production

### 1. Build for Production

```bash
npm run build
```

### 2. Deploy Everything

```bash
firebase deploy
```

This deploys:

- Firestore rules & indexes
- Cloud Storage rules
- Cloud Functions
- (Next.js app: deploy separately to your hosting provider)

### 3. Set Up First Super Admin

After deploying:

```bash
cd functions && npm run build
firebase deploy --only functions
```

Then via Firebase Console or Admin SDK, create first user with Super Admin role before any UI is available (bootstrapping requirement).

---

## Testing

### Test Scripts

```bash
npm run test:unit              # RBAC + format validation (fast)
npm run test:rules             # Firestore rules with emulator
npm run seed:accounts          # Create test users
```

### Development Tools

**Firebase Console**: [console.firebase.google.com](https://console.firebase.google.com)

**Firebase Emulator UI**: [http://localhost:4000](http://localhost:4000) (when emulators running)

---

## Troubleshooting

| Issue                                                          | Solution                                                                      |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `FIREBASE_PRIVATE_KEY` formatting errors                       | Ensure `\n` are literal, wrap entire value in quotes                          |
| Tenant-isolation test fails                                    | Firestore rules have a security gap — fix before proceeding                   |
| Custom claims not syncing                                      | Verify Cloud Functions deployed properly (check Firebase Console → Functions) |
| Cloudinary upload fails                                        | Check `CLOUDINARY_API_KEY` and `CLOUDINARY_CLOUD_NAME` are set                |
| "No emulator project. Did you run `firebase emulators:start`?" | Start emulator in another terminal before running tests                       |
