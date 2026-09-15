/**
 * Rebuild denormalized summary docs from Firestore transactions.
 *
 * Usage (from repo root, with Admin env in .env.local):
 *   npx tsx --env-file=.env.local scripts/backfill-summaries.ts
 */
import { getAdminDb } from "../lib/firebase/admin";
import {
  addTxToBucket,
  emptyBucket,
  emptyGroupMonth,
  monthKeyFromDate,
  serializeBucket,
  upsertMapBucket,
} from "../lib/summaries";
import type { TransactionDirection } from "../lib/types";

type TxRow = {
  id: string;
  businessId: string;
  accountId: string;
  direction: TransactionDirection;
  amount: number;
  date: string;
  category: string;
  transferGroupId?: string | null;
  status: string;
};

async function main() {
  const db = getAdminDb();
  const snap = await db.collection("transactions").get();

  let pendingCount = 0;
  let groupBucket = emptyBucket();
  const groupMonths = new Map<string, ReturnType<typeof emptyGroupMonth>>();
  const businessTotals = new Map<string, ReturnType<typeof emptyBucket>>();
  const businessMonths = new Map<
    string,
    Map<string, ReturnType<typeof emptyBucket>>
  >();
  const accountTotals = new Map<string, ReturnType<typeof emptyBucket>>();
  const accountMonths = new Map<
    string,
    Map<string, ReturnType<typeof emptyBucket>>
  >();

  for (const doc of snap.docs) {
    const data = doc.data();
    const status = data.status === "draft" ? "pending" : data.status;
    if (status === "pending") {
      pendingCount += 1;
      continue;
    }
    if (status !== "approved") continue;

    const row: TxRow = {
      id: doc.id,
      businessId: data.businessId,
      accountId: data.accountId,
      direction: data.direction,
      amount: Number(data.amount ?? 0),
      date: data.date,
      category: String(data.category ?? ""),
      transferGroupId: data.transferGroupId ?? null,
      status,
    };

    const txFields = {
      direction: row.direction,
      amount: row.amount,
      category: row.category,
      transferGroupId: row.transferGroupId,
    };

    const monthKey = monthKeyFromDate(row.date);
    groupBucket = addTxToBucket(groupBucket, txFields);

    const gm = groupMonths.get(monthKey) ?? emptyGroupMonth(monthKey);
    const nextGm = addTxToBucket(gm, txFields);
    groupMonths.set(monthKey, {
      id: monthKey,
      ...nextGm,
      byBusiness: upsertMapBucket(
        gm.byBusiness,
        row.businessId,
        row.direction,
        row.amount,
        row.category,
        row.transferGroupId
      ),
      byAccount: upsertMapBucket(
        gm.byAccount,
        row.accountId,
        row.direction,
        row.amount,
        row.category,
        row.transferGroupId
      ),
    });

    const biz = businessTotals.get(row.businessId) ?? emptyBucket();
    businessTotals.set(row.businessId, addTxToBucket(biz, txFields));
    const bizMonthMap = businessMonths.get(row.businessId) ?? new Map();
    const bizMonth = bizMonthMap.get(monthKey) ?? emptyBucket();
    bizMonthMap.set(monthKey, addTxToBucket(bizMonth, txFields));
    businessMonths.set(row.businessId, bizMonthMap);

    const acc = accountTotals.get(row.accountId) ?? emptyBucket();
    accountTotals.set(row.accountId, addTxToBucket(acc, txFields));
    const accMonthMap = accountMonths.get(row.accountId) ?? new Map();
    const accMonth = accMonthMap.get(monthKey) ?? emptyBucket();
    accMonthMap.set(monthKey, addTxToBucket(accMonth, txFields));
    accountMonths.set(row.accountId, accMonthMap);
  }

  const batchLimit = 400;
  let batch = db.batch();
  let ops = 0;

  async function commitIfNeeded(force = false) {
    if (ops === 0) return;
    if (force || ops >= batchLimit) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  batch.set(db.doc("summaries/group"), {
    ...serializeBucket(groupBucket),
    pendingCount,
    updatedAt: new Date(),
  });
  ops += 1;

  for (const [monthKey, doc] of groupMonths) {
    batch.set(db.doc(`summaries/group/months/${monthKey}`), {
      ...serializeBucket(doc),
      byBusiness: doc.byBusiness,
      byAccount: doc.byAccount,
    });
    ops += 1;
    await commitIfNeeded();
  }

  for (const [businessId, totals] of businessTotals) {
    batch.set(db.doc(`businessSummaries/${businessId}`), {
      ...serializeBucket(totals),
      updatedAt: new Date(),
    });
    ops += 1;
    await commitIfNeeded();
    const months = businessMonths.get(businessId);
    if (!months) continue;
    for (const [monthKey, totals] of months) {
      batch.set(
        db.doc(`businessSummaries/${businessId}/months/${monthKey}`),
        serializeBucket(totals)
      );
      ops += 1;
      await commitIfNeeded();
    }
  }

  for (const [accountId, totals] of accountTotals) {
    batch.set(db.doc(`accountSummaries/${accountId}`), {
      ...serializeBucket(totals),
      updatedAt: new Date(),
    });
    ops += 1;
    await commitIfNeeded();
    const months = accountMonths.get(accountId);
    if (!months) continue;
    for (const [monthKey, totals] of months) {
      batch.set(
        db.doc(`accountSummaries/${accountId}/months/${monthKey}`),
        serializeBucket(totals)
      );
      ops += 1;
      await commitIfNeeded();
    }
  }

  await commitIfNeeded(true);

  console.log(
    `Backfill complete: ${snap.size} transactions scanned, pending=${pendingCount}, approved income=${groupBucket.income} expense=${groupBucket.expense} transferIn=${groupBucket.transferIn} transferOut=${groupBucket.transferOut}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
