# Golden 7 Financial System — MVP setup

## 1. Environment

```bash
cp .env.local.example .env.local
```

Fill in Firebase **web** config from Project settings → Your apps (`NEXT_PUBLIC_FIREBASE_*`).

### Firebase Admin (required for Users page)

Checkers create Maker/Checker accounts via `/api/users`, which needs a service account:

1. Firebase Console → Project settings → **Service accounts** → **Generate new private key**.
2. From the JSON file, set in `.env.local`:

```bash
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-...@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`FIREBASE_ADMIN_PRIVATE_KEY` must be **double-quoted**, on **one line**, with real newlines turned into `\n`. See [`.env.local.example`](.env.local.example) for correct vs wrong formats. Never commit this file or use `NEXT_PUBLIC_` for Admin vars.

Restart `npm run dev` after changing env vars.

## 2. Firebase Console

1. Enable **Email/Password** authentication.
2. Enable **Firebase Storage** (default bucket) if not already on.
3. Deploy rules and indexes:
   - Firestore rules: `firebase deploy --only firestore:rules`
   - Firestore indexes: `firebase deploy --only firestore:indexes`
   - Storage: `firebase deploy --only storage`
   (or paste [`firestore.rules`](firestore.rules) / [`storage.rules`](storage.rules) in the Console).
4. **One-time summary backfill** (after deploying app code that uses `summaries/*`):
   ```bash
   npm install
   npm run backfill:summaries
   ```
   Re-run after bulk imports or if dashboard totals look wrong; it rebuilds rollups from all transactions.
5. Bootstrap the **first Checker** manually:
   - Create an Auth user in Console (or sign up once).
   - Sign in once so `users/{uid}` exists (or create the doc).
   - Set `{ "role": "checker" }` on that user doc.
6. After Admin env is configured, use **Users** in the app to create more Makers and Checkers.

Accounts created via **Users** must change password on first login (`mustChangePassword`). Redeploy Firestore rules after pulling this change:

```bash
firebase deploy --only firestore:rules
```

## 3. Smoke test

1. As Checker: **Users** → create a Maker with an initial password.
2. Sign in as that Maker → you should be forced to **Set a new password** before using the app.
3. As Checker: create a business, plus shared group accounts (one bank, one cash).
4. As Maker: create an income transaction → **Submit for review**.
5. As Checker: Approvals → approve → confirm account `currentBalance` increased.
6. As Maker: create expense → submit for review → Checker rejects with reason.
7. Dashboard: income/expense/net and balances reflect **approved** records only; pending count updates.

## 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000 → redirects to `/login`.
