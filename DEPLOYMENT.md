# Next.js APIs & Vercel deployment

Most of the app talks to **Cloud Firestore / Storage from the browser** under Firebase Auth and security rules. **Next.js Route Handlers** exist only where the **Firebase Admin SDK** is required (Auth user lifecycle and destructive maintenance).

Stack for production: **Next.js 16** (App Router) on **Vercel**, plus a Firebase project for Auth, Firestore, and Storage.

Related docs: [SETUP.md](./SETUP.md) (local Firebase bootstrap), [DATABASE.md](./DATABASE.md) (collections).

---

## Architecture

```text
Browser (Firebase Auth + client SDK)
  ├── Firestore / Storage  ← day-to-day reads & writes (rules-enforced)
  └── fetch /api/*         ← Bearer ID token → Route Handler → Admin SDK
        └── Auth create/delete/reset, Firestore Admin, Storage Admin
```

| Concern | Where it runs |
| --- | --- |
| Login, transactions, approvals, dashboards | Client + Firestore rules |
| Create / delete user, reset password | `app/api/users/*` |
| Purge selected data | `app/api/settings/purge-data` |
| Summary backfill | Local/CI script (`npm run backfill:summaries`), not a Vercel route |

Shared gate: [`lib/api/require-app-admin.ts`](./lib/api/require-app-admin.ts) — verifies `Authorization: Bearer <Firebase ID token>` and requires Firestore `users/{uid}.role === "admin"`.

Admin SDK bootstrap: [`lib/firebase/admin.ts`](./lib/firebase/admin.ts).

---

## Authentication for APIs

Every protected route expects:

```http
Authorization: Bearer <Firebase ID token>
```

The UI obtains the token with `user.getIdToken()` after sign-in.

| Status | Meaning |
| --- | --- |
| `401` | Missing/invalid Bearer token |
| `403` | Authenticated but not `admin` |
| `503` | `FIREBASE_ADMIN_*` missing or PEM/credential failure |

Non-admin roles never call these routes successfully, even if the UI is hidden.

---

## API reference

### `GET /api/users`

Health check for Admin configuration (admin-only).

**Response `200`**

```json
{ "ok": true, "adminConfigured": true }
```

**Response `503`** — Admin env missing or credentials fail to initialize (`ok: false`, `error` message).

---

### `POST /api/users`

Create Auth user + `users/{uid}` profile (`mustChangePassword: true`) and an audit log.

**Body**

| Field | Type | Rules |
| --- | --- | --- |
| `email` | string | Required, normalized to lowercase |
| `password` | string | Min 8 characters |
| `displayName` | string | Required |
| `role` | string | `admin` \| `maker` \| `checker` \| `approver` |

**Response `200`**

```json
{ "id": "<uid>", "email": "...", "displayName": "...", "role": "maker" }
```

| Status | When |
| --- | --- |
| `400` | Validation / invalid email or password |
| `409` | Email already exists |
| `503` / `500` | Admin misconfigured / other failure |

---

### `DELETE /api/users/[id]`

Delete Auth user and Firestore profile; write audit `deleted`. Cannot delete self.

**Response `200`:** `{ "ok": true, "id": "<uid>" }`  
**`404`** if Auth user not found.

---

### `POST /api/users/[id]`

Password reset (Admin Auth + force re-login).

**Body**

```json
{ "action": "resetPassword", "password": "<new password ≥ 8 chars>" }
```

Sets `mustChangePassword: true`, updates Auth password, revokes refresh tokens, writes audit `updated`.

**Response `200`:** `{ "ok": true, "id": "<uid>" }`

---

### `POST /api/settings/purge-data`

Destructive admin maintenance from Settings. Deletes selected categories and related rollups/files.

**Body**

```json
{ "categories": ["transactions", "accounts", "businesses", "auditLogs"] }
```

| Category | Effect (high level) |
| --- | --- |
| `transactions` | Deletes txs, counters, all summary trees, Storage under `transactions/`; resets account/holding balances to openings if accounts are kept |
| `accounts` | Deletes accounts (+ holdings); **requires** `transactions` in the same request |
| `businesses` | Deletes businesses + `fixedAssets` (+ holdings if needed); **requires** `transactions` |
| `auditLogs` | Deletes audit log docs |

**Response `200`:** `{ "deleted": { ...counts } }`

`users` are never purged by this endpoint.

---

## Environment variables

Template: [`.env.local.example`](./.env.local.example).

### Client (public)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Also used as Admin Storage bucket fallback |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | |

### Server-only (never `NEXT_PUBLIC_`)

| Variable | Purpose |
| --- | --- |
| `FIREBASE_ADMIN_PROJECT_ID` | Service account project |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account email |
| `FIREBASE_ADMIN_PRIVATE_KEY` | PEM private key (see format below) |
| `FIREBASE_ADMIN_STORAGE_BUCKET` | Optional override if Storage bucket ≠ web `STORAGE_BUCKET` |

### `FIREBASE_ADMIN_PRIVATE_KEY` on Vercel

Preferred (works with `.env` and most hosts): **one line**, double-quoted, real newlines as `\n`:

```bash
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n...\n-----END PRIVATE KEY-----\n"
```

Vercel Project Settings → Environment Variables also accepts a **multiline** secret; the Admin helper strips wrapping quotes and normalizes `\n` / real newlines ([`lib/firebase/admin.ts`](./lib/firebase/admin.ts)).

If Users → Create user returns 503 about credentials, fix this variable first, then redeploy.

---

## Next.js config notes

[`next.config.ts`](./next.config.ts) sets:

```ts
serverExternalPackages: ["firebase-admin", "jose", "jwks-rsa"]
```

This keeps the Admin SDK (and its CJS/ESM dependency chain) out of the bundled server graph so Auth does not crash on Vercel with `ERR_REQUIRE_ESM` from `jwks-rsa` → `jose`. Do not remove without verifying Admin Auth still works in production.

Framework: Next.js **App Router** under `app/`. No custom `output` or middleware is required for the current APIs.

---

## Deploy to Vercel

### 1. Prerequisites

1. Firebase project ready: Email/Password Auth, Firestore, Storage, rules & indexes deployed ([SETUP.md](./SETUP.md)).
2. At least one Firestore user with `role: "admin"`.
3. Git repo pushed (GitHub / GitLab / Bitbucket).

### 2. Create the Vercel project

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → import this repo.
2. Framework Preset: **Next.js** (auto-detected).
3. Root directory: repo root. Build command `next build`, output default.
4. Add **all** env vars from the tables above for **Production** (and Preview if you use preview Firebase or the same project).
5. Deploy.

CLI alternative:

```bash
npm i -g vercel
vercel        # link + preview
vercel --prod # production
```

Set env via dashboard or `vercel env add`.

### 3. Firebase authorized domains

Firebase Console → Authentication → **Settings** → **Authorized domains** — add:

- `localhost` (local)
- your production host, e.g. `your-app.vercel.app`
- any custom domain

Without this, client sign-in fails on the deployed origin.

### 4. Custom domain (optional)

Vercel → Project → **Domains** → add domain → follow DNS instructions. Add the same hostname to Firebase authorized domains.

### 5. Post-deploy checks

1. Open the site → `/login` → sign in as admin.
2. **Users** → create a test maker (exercises `POST /api/users` + Admin PEM).
3. Optional: `GET /api/users` with a Bearer token should return `{ ok: true, adminConfigured: true }`.
4. Confirm Firestore/Storage rules were deployed to the **same** project as the env vars.
5. If dashboard totals are empty after data import, run `npm run backfill:summaries` locally against that project (script is not part of the Vercel build).

---

## Runtime & limits

| Topic | Notes |
| --- | --- |
| Runtime | Node.js serverless Route Handlers (default) |
| Cold starts | First Admin call may be slower; credentials are initialized once per instance |
| Purge | Can run many Admin batch deletes; large datasets may approach Vercel function duration limits — prefer smaller category sets or run from a machine with Admin credentials if timeouts occur |
| Client data path | Unrelated to Vercel function limits; scales with Firestore |

---

## Local vs production

| | Local | Vercel |
| --- | --- | --- |
| Env file | `.env.local` | Project → Environment Variables |
| Dev server | `npm run dev` | — |
| Production build | `npm run build && npm run start` | Automatic on git push |
| Users / purge APIs | Need `FIREBASE_ADMIN_*` | Same vars required |
| Backfill script | `npm run backfill:summaries` | Not on Vercel; run where Admin env is available |

Never commit `.env.local` or service-account JSON. Rotate the private key if it was exposed, then update Vercel env and redeploy.
