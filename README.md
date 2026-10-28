# Golden 7 Financial System

Centralized financial management for **The Golden 7 Myanmar Group Co., Ltd.**

Record income, expenses, and internal transfers across businesses and shared bank/cash accounts, with Maker–Checker–Approver authorization and approved-only balances and reports.

**Stack:** Next.js 16 · React 19 · Firebase Auth · Cloud Firestore · Firebase Storage · Tailwind CSS

## Features

| Module | Description |
| --- | --- |
| **Dashboard** | Group KPIs, trends, and pending count from **approved** transactions |
| **Businesses** | Multi-business registry, KPIs, and retained-earnings (`RE`) unit |
| **Accounts** | Shared group bank & cash accounts with balances and history |
| **Transactions** | Income, expense, and linked internal transfers; optional attachments |
| **Approvals** | Approver queue for pending records (transfers approved/rejected together) |
| **Users** | Create Maker / Checker / Approver accounts (Firebase Admin API) |
| **Audit** | History of financial record changes |
| **Settings** | Approver-only maintenance tools |

## Roles

| Role | Capabilities |
| --- | --- |
| **Maker** | Create and edit own pending transactions; submit for review |
| **Checker** | Manage businesses, accounts, users, and transactions (no approve/reject) |
| **Approver** | Everything Checker can, plus approve/reject pending transactions and Settings |

Only **approved** transactions affect balances, dashboards, and retained earnings.

## Quick start

```bash
npm install
cp .env.local.example .env.local
# fill NEXT_PUBLIC_FIREBASE_* and FIREBASE_ADMIN_* (see SETUP.md)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirects to `/login`.

Full Firebase setup, rules deploy, first Approver/Checker bootstrap, summary backfill, and smoke tests: **[SETUP.md](./SETUP.md)**

Product scope and workflow details: **[systemdescription.md](./systemdescription.md)**

Firestore collections, fields, rollups, and Storage paths: **[DATABASE.md](./DATABASE.md)**

Next.js API routes and Vercel deploy: **[DEPLOYMENT.md](./DEPLOYMENT.md)**

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local development server |
| `npm run build` | Production build |
| `npm run start` | Serve production build |
| `npm run lint` | ESLint |
| `npm run backfill:summaries` | Rebuild `summaries/*` rollups from all transactions |

## Project layout

```
app/           Next.js App Router (pages + API routes)
components/    UI and feature components
lib/           Types, permissions, Firebase client/admin, summaries
scripts/       One-off maintenance (e.g. summary backfill)
firestore.rules / storage.rules / firestore.indexes.json
```

## Security notes

- Never commit `.env.local` or service-account JSON keys (see `.gitignore`).
- Use `.env.local.example` as the template; keep Admin credentials server-only (`FIREBASE_ADMIN_*`, never `NEXT_PUBLIC_*`).
- Deploy Firestore and Storage rules before using the app against a shared project.
