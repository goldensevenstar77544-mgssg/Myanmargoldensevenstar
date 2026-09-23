import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  type DocumentData,
  type Transaction as FsTransaction,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/client";
import { toDate } from "@/lib/firebase/converters";
import {
  addTxToBucket,
  monthKeyFromDate,
  serializeBucket,
  upsertMapBucket,
} from "@/lib/summaries";
import type {
  EntityMonthSummary,
  EntitySummary,
  GroupMonthSummary,
  GroupSummary,
  IncomeExpenseBucket,
  TransactionDirection,
} from "@/lib/types";

export function groupSummaryRef() {
  return doc(getClientDb(), "summaries", "group");
}

export function groupMonthRef(monthKey: string) {
  return doc(getClientDb(), "summaries", "group", "months", monthKey);
}

export function businessSummaryRef(businessId: string) {
  return doc(getClientDb(), "businessSummaries", businessId);
}

export function businessMonthRef(businessId: string, monthKey: string) {
  return doc(
    getClientDb(),
    "businessSummaries",
    businessId,
    "months",
    monthKey
  );
}

export function accountSummaryRef(accountId: string) {
  return doc(getClientDb(), "accountSummaries", accountId);
}

export function accountMonthRef(accountId: string, monthKey: string) {
  return doc(getClientDb(), "accountSummaries", accountId, "months", monthKey);
}

function mapBucket(data: DocumentData | undefined): IncomeExpenseBucket {
  return {
    income: Number(data?.income ?? 0),
    expense: Number(data?.expense ?? 0),
    transferIn: Number(data?.transferIn ?? 0),
    transferOut: Number(data?.transferOut ?? 0),
  };
}

function mapEntityMap(
  raw: DocumentData | undefined
): Record<string, IncomeExpenseBucket> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, IncomeExpenseBucket> = {};
  for (const [id, value] of Object.entries(raw)) {
    out[id] = mapBucket(value as DocumentData);
  }
  return out;
}

export function mapGroupSummary(data: DocumentData | undefined): GroupSummary {
  const bucket = mapBucket(data);
  return {
    ...bucket,
    pendingCount: Number(data?.pendingCount ?? 0),
    updatedAt: data?.updatedAt ? toDate(data.updatedAt) : undefined,
  };
}

export function mapGroupMonthSummary(
  data: DocumentData | undefined,
  id: string
): GroupMonthSummary {
  const bucket = mapBucket(data);
  return {
    id,
    ...bucket,
    byBusiness: mapEntityMap(data?.byBusiness),
    byAccount: mapEntityMap(data?.byAccount),
  };
}

export function mapEntitySummary(
  data: DocumentData | undefined,
  id: string
): EntitySummary {
  return {
    id,
    ...mapBucket(data),
    updatedAt: data?.updatedAt ? toDate(data.updatedAt) : undefined,
  };
}

export function mapEntityMonthSummary(
  data: DocumentData | undefined,
  id: string
): EntityMonthSummary {
  return { id, ...mapBucket(data) };
}

export async function getGroupSummary(): Promise<GroupSummary> {
  const snap = await getDoc(groupSummaryRef());
  return mapGroupSummary(snap.exists() ? snap.data() : undefined);
}

export async function getGroupMonthsForYear(
  year: number
): Promise<GroupMonthSummary[]> {
  const keys = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${year}-${m}`;
  });
  const snaps = await Promise.all(keys.map((key) => getDoc(groupMonthRef(key))));
  return snaps.map((snap, i) =>
    mapGroupMonthSummary(snap.exists() ? snap.data() : undefined, keys[i]!)
  );
}

/**
 * Group month rollups. When `sinceMonthKey` is set (YYYY-MM), only months on
 * or after that key are fetched.
 */
export async function listGroupMonthSummaries(
  sinceMonthKey?: string | null
): Promise<GroupMonthSummary[]> {
  const col = collection(getClientDb(), "summaries", "group", "months");
  const q = sinceMonthKey
    ? query(
        col,
        where(documentId(), ">=", sinceMonthKey),
        orderBy(documentId(), "asc")
      )
    : query(col, orderBy(documentId(), "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapGroupMonthSummary(d.data(), d.id));
}

export async function getBusinessSummary(
  businessId: string
): Promise<EntitySummary> {
  const snap = await getDoc(businessSummaryRef(businessId));
  return mapEntitySummary(
    snap.exists() ? snap.data() : undefined,
    businessId
  );
}

/** One collection read for all business rollups (avoids N× getDoc on dashboard). */
export async function listBusinessSummaries(): Promise<EntitySummary[]> {
  const snap = await getDocs(collection(getClientDb(), "businessSummaries"));
  return snap.docs.map((d) => mapEntitySummary(d.data(), d.id));
}

export async function getAccountSummary(
  accountId: string
): Promise<EntitySummary> {
  const snap = await getDoc(accountSummaryRef(accountId));
  return mapEntitySummary(snap.exists() ? snap.data() : undefined, accountId);
}

/**
 * Month rollups for a business. When `sinceMonthKey` is set (YYYY-MM), only
 * months on or after that key are fetched.
 */
export async function listBusinessMonthSummaries(
  businessId: string,
  sinceMonthKey?: string | null
): Promise<EntityMonthSummary[]> {
  const col = collection(
    getClientDb(),
    "businessSummaries",
    businessId,
    "months"
  );
  const q = sinceMonthKey
    ? query(
        col,
        where(documentId(), ">=", sinceMonthKey),
        orderBy(documentId(), "asc")
      )
    : query(col, orderBy(documentId(), "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapEntityMonthSummary(d.data(), d.id));
}

/**
 * Month rollups for an account. When `sinceMonthKey` is set (YYYY-MM), only
 * months on or after that key are fetched.
 */
export async function listAccountMonthSummaries(
  accountId: string,
  sinceMonthKey?: string | null
): Promise<EntityMonthSummary[]> {
  const col = collection(
    getClientDb(),
    "accountSummaries",
    accountId,
    "months"
  );
  const q = sinceMonthKey
    ? query(
        col,
        where(documentId(), ">=", sinceMonthKey),
        orderBy(documentId(), "asc")
      )
    : query(col, orderBy(documentId(), "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapEntityMonthSummary(d.data(), d.id));
}

export async function getEntityMonthsForYear(
  kind: "business" | "account",
  entityId: string,
  year: number
): Promise<EntityMonthSummary[]> {
  const keys = Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${year}-${m}`;
  });
  const snaps = await Promise.all(
    keys.map((key) =>
      getDoc(
        kind === "business"
          ? businessMonthRef(entityId, key)
          : accountMonthRef(entityId, key)
      )
    )
  );
  return snaps.map((snap, i) =>
    mapEntityMonthSummary(
      snap.exists() ? snap.data() : undefined,
      keys[i]!
    )
  );
}

export type SummaryTxInput = {
  businessId: string;
  accountId: string;
  direction: TransactionDirection;
  amount: number;
  date: string;
  category: string;
  transferGroupId?: string | null;
};

/**
 * Apply approved-tx rollups inside an existing Firestore transaction.
 * All reads must happen before any writes in the caller; this helper reads
 * summary docs then writes them (caller must not have written yet, or must
 * interleave carefully). Prefer calling this as a block of reads then writes.
 */
export async function readSummarySnapsForApprove(
  transaction: FsTransaction,
  input: SummaryTxInput
) {
  const monthKey = monthKeyFromDate(input.date);
  const groupRef = groupSummaryRef();
  const monthRef = groupMonthRef(monthKey);
  const bizRef = businessSummaryRef(input.businessId);
  const bizMonthRef = businessMonthRef(input.businessId, monthKey);
  const accRef = accountSummaryRef(input.accountId);
  const accMonthRef = accountMonthRef(input.accountId, monthKey);

  const [groupSnap, monthSnap, bizSnap, bizMonthSnap, accSnap, accMonthSnap] =
    await Promise.all([
      transaction.get(groupRef),
      transaction.get(monthRef),
      transaction.get(bizRef),
      transaction.get(bizMonthRef),
      transaction.get(accRef),
      transaction.get(accMonthRef),
    ]);

  return {
    monthKey,
    refs: {
      groupRef,
      monthRef,
      bizRef,
      bizMonthRef,
      accRef,
      accMonthRef,
    },
    snaps: {
      groupSnap,
      monthSnap,
      bizSnap,
      bizMonthSnap,
      accSnap,
      accMonthSnap,
    },
  };
}

export function writeApproveSummaries(
  transaction: FsTransaction,
  input: SummaryTxInput,
  ctx: Awaited<ReturnType<typeof readSummarySnapsForApprove>>,
  pendingDelta: number
): void {
  writeApproveSummariesMulti(transaction, [input], [ctx], pendingDelta);
}

/**
 * Apply multiple approved legs in one write pass so shared group/month docs
 * accumulate correctly (needed for linked transfers).
 */
export function writeApproveSummariesMulti(
  transaction: FsTransaction,
  inputs: SummaryTxInput[],
  ctxs: Awaited<ReturnType<typeof readSummarySnapsForApprove>>[],
  pendingDelta: number
): void {
  if (inputs.length === 0 || inputs.length !== ctxs.length) {
    throw new Error("Summary inputs and contexts must align");
  }

  const first = ctxs[0]!;
  let group = mapGroupSummary(
    first.snaps.groupSnap.exists() ? first.snaps.groupSnap.data() : undefined
  );
  const monthByKey = new Map<
    string,
    {
      ref: ReturnType<typeof groupMonthRef>;
      data: GroupMonthSummary;
    }
  >();
  const bizById = new Map<
    string,
    {
      ref: ReturnType<typeof businessSummaryRef>;
      monthRef: ReturnType<typeof businessMonthRef>;
      data: IncomeExpenseBucket;
      monthData: IncomeExpenseBucket;
      monthSnapExists: boolean;
    }
  >();
  const accById = new Map<
    string,
    {
      ref: ReturnType<typeof accountSummaryRef>;
      monthRef: ReturnType<typeof accountMonthRef>;
      data: IncomeExpenseBucket;
      monthData: IncomeExpenseBucket;
    }
  >();

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const ctx = ctxs[i]!;
    const {
      amount,
      direction,
      businessId,
      accountId,
      category,
      transferGroupId,
    } = input;
    const txFields = { direction, amount, category, transferGroupId };

    group = {
      ...addTxToBucket(group, txFields),
      pendingCount: group.pendingCount,
    };

    if (!monthByKey.has(ctx.monthKey)) {
      monthByKey.set(ctx.monthKey, {
        ref: ctx.refs.monthRef,
        data: mapGroupMonthSummary(
          ctx.snaps.monthSnap.exists() ? ctx.snaps.monthSnap.data() : undefined,
          ctx.monthKey
        ),
      });
    }
    const monthEntry = monthByKey.get(ctx.monthKey)!;
    const nextMonth = addTxToBucket(monthEntry.data, txFields);
    monthEntry.data = {
      ...nextMonth,
      id: monthEntry.data.id,
      byBusiness: upsertMapBucket(
        monthEntry.data.byBusiness,
        businessId,
        direction,
        amount,
        category,
        transferGroupId
      ),
      byAccount: upsertMapBucket(
        monthEntry.data.byAccount,
        accountId,
        direction,
        amount,
        category,
        transferGroupId
      ),
    };

    if (!bizById.has(businessId)) {
      bizById.set(businessId, {
        ref: ctx.refs.bizRef,
        monthRef: ctx.refs.bizMonthRef,
        data: mapBucket(
          ctx.snaps.bizSnap.exists() ? ctx.snaps.bizSnap.data() : undefined
        ),
        monthData: mapBucket(
          ctx.snaps.bizMonthSnap.exists()
            ? ctx.snaps.bizMonthSnap.data()
            : undefined
        ),
        monthSnapExists: ctx.snaps.bizMonthSnap.exists(),
      });
    }
    const bizEntry = bizById.get(businessId)!;
    bizEntry.data = addTxToBucket(bizEntry.data, txFields);
    bizEntry.monthData = addTxToBucket(bizEntry.monthData, txFields);

    if (!accById.has(accountId)) {
      accById.set(accountId, {
        ref: ctx.refs.accRef,
        monthRef: ctx.refs.accMonthRef,
        data: mapBucket(
          ctx.snaps.accSnap.exists() ? ctx.snaps.accSnap.data() : undefined
        ),
        monthData: mapBucket(
          ctx.snaps.accMonthSnap.exists()
            ? ctx.snaps.accMonthSnap.data()
            : undefined
        ),
      });
    }
    const accEntry = accById.get(accountId)!;
    accEntry.data = addTxToBucket(accEntry.data, txFields);
    accEntry.monthData = addTxToBucket(accEntry.monthData, txFields);
  }

  transaction.set(
    first.refs.groupRef,
    {
      ...serializeBucket(group),
      pendingCount: Math.max(0, group.pendingCount + pendingDelta),
      updatedAt: new Date(),
    },
    { merge: true }
  );

  for (const [, monthEntry] of monthByKey) {
    transaction.set(monthEntry.ref, {
      ...serializeBucket(monthEntry.data),
      byBusiness: monthEntry.data.byBusiness,
      byAccount: monthEntry.data.byAccount,
    });
  }

  for (const [, bizEntry] of bizById) {
    transaction.set(
      bizEntry.ref,
      { ...serializeBucket(bizEntry.data), updatedAt: new Date() },
      { merge: true }
    );
    transaction.set(bizEntry.monthRef, serializeBucket(bizEntry.monthData));
  }

  for (const [, accEntry] of accById) {
    transaction.set(
      accEntry.ref,
      { ...serializeBucket(accEntry.data), updatedAt: new Date() },
      { merge: true }
    );
    transaction.set(accEntry.monthRef, serializeBucket(accEntry.monthData));
  }
}

export async function adjustPendingCount(
  transaction: FsTransaction,
  delta: number
): Promise<void> {
  const ref = groupSummaryRef();
  const snap = await transaction.get(ref);
  applyPendingCountDelta(
    transaction,
    ref,
    mapGroupSummary(snap.exists() ? snap.data() : undefined),
    delta
  );
}

export function applyPendingCountDelta(
  transaction: FsTransaction,
  ref: ReturnType<typeof groupSummaryRef>,
  current: GroupSummary,
  delta: number
): void {
  transaction.set(
    ref,
    {
      ...serializeBucket(current),
      pendingCount: Math.max(0, current.pendingCount + delta),
      updatedAt: new Date(),
    },
    { merge: true }
  );
}
