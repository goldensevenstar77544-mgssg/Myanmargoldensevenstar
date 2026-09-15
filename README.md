# Golden 7 Financial System

Centralized financial management MVP for **The Golden 7 Myanmar Group Co., Ltd.**

Stack: Next.js 16 · Firebase Auth · Cloud Firestore · Maker–Checker workflow

## Quick start

See **[SETUP.md](./SETUP.md)** for Firebase env vars, security rules, roles, and smoke-test steps.

```bash
cp .env.local.example .env.local
# fill Firebase web config
npm run dev
```

## Modules

- Dashboard — approved income/expense, balances, pending count
- Businesses / Accounts — shared group bank & cash (Checker manages); linked per transaction
- Transactions — submit for review → approve/reject; optional invoice/voucher images
- Approvals — Checker queue (own records marked, still approvable)
- Users — Checker creates Maker/Checker accounts (Firebase Admin API)
# MG7SFinancial
