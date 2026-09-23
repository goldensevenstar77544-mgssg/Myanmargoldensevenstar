import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
  getAggregateFromServer,
  count,
  sum,
  type DocumentData,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type Transaction as FsTransaction,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/client";
import { toDate } from "@/lib/firebase/converters";
import {
  getCachedAccounts,
  getCachedBusinesses,
  invalidateAccountsCache,
  invalidateBusinessesCache,
  setCachedAccounts,
  setCachedBusinesses,
} from "@/lib/firebase/master-data-cache";
import {
  adjustPendingCount,
  applyPendingCountDelta,
  groupSummaryRef,
  mapGroupSummary,
  readSummarySnapsForApprove,
  writeApproveSummaries,
  writeApproveSummariesMulti,
} from "@/lib/firebase/summaries";
import { DEFAULT_PAGE_SIZE } from "@/lib/types";
import type {
  Account,
  AppUser,
  AuditAction,
  AuditChange,
  AuditEntityType,
  AuditLog,
  Business,
  BusinessAccountBalance,
  FixedAsset,
  Transaction,
  TransactionAttachment,
  TransactionDirection,
  TransactionStatus,
  UserRole,
} from "@/lib/types";
import { formatAccountLabel } from "@/lib/utils";

export type PageCursor = QueryDocumentSnapshot;

export type PageResult<T> = {
  items: T[];
  nextCursor: PageCursor | null;
};

function mapTransactionList(data: DocumentData, id: string): Transaction {
  const tx = mapTransaction(data, id);
  return { ...tx, attachments: [] };
}

function mapAttachment(raw: DocumentData): TransactionAttachment {
  return {
    path: raw.path,
    url: raw.url,
    name: raw.name,
    contentType: raw.contentType,
    size: Number(raw.size ?? 0),
    uploadedAt: toDate(raw.uploadedAt),
    uploadedBy: raw.uploadedBy,
  };
}

function serializeAttachments(
  attachments: TransactionAttachment[]
): DocumentData[] {
  return attachments.map((a) => ({
    path: a.path,
    url: a.url,
    name: a.name,
    contentType: a.contentType,
    size: a.size,
    uploadedAt:
      a.uploadedAt instanceof Date
        ? Timestamp.fromDate(a.uploadedAt)
        : Timestamp.fromDate(new Date(a.uploadedAt)),
    uploadedBy: a.uploadedBy,
  }));
}
function mapUser(data: DocumentData, id: string): AppUser {
  return {
    id,
    email: data.email ?? "",
    displayName: data.displayName ?? "",
    role: (data.role as UserRole | null) ?? null,
    mustChangePassword: Boolean(data.mustChangePassword),
    createdAt: toDate(data.createdAt),
  };
}

function mapBusiness(data: DocumentData, id: string): Business {
  return {
    id,
    name: data.name,
    code: data.code,
    status: data.status,
    notes: data.notes,
    isSystem: Boolean(data.isSystem),
    totalCapital:
      data.totalCapital !== undefined && data.totalCapital !== null
        ? Number(data.totalCapital)
        : undefined,
    fixedAssetExpense:
      data.fixedAssetExpense !== undefined && data.fixedAssetExpense !== null
        ? Number(data.fixedAssetExpense)
        : undefined,
    totalSaleVolume:
      data.totalSaleVolume !== undefined && data.totalSaleVolume !== null
        ? Number(data.totalSaleVolume)
        : undefined,
    operationExpense:
      data.operationExpense !== undefined && data.operationExpense !== null
        ? Number(data.operationExpense)
        : undefined,
    totalProfit:
      data.totalProfit !== undefined && data.totalProfit !== null
        ? Number(data.totalProfit)
        : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function mapAccount(data: DocumentData, id: string): Account {
  return {
    id,
    type: data.type,
    name: data.name,
    bankName: data.bankName,
    accountNumber: data.accountNumber,
    bankBranch: data.bankBranch,
    bankAddress: data.bankAddress,
    currency: "MMK",
    openingBalance: Number(data.openingBalance ?? 0),
    currentBalance: Number(data.currentBalance ?? 0),
    pendingCount: Number(data.pendingCount ?? 0),
    approvedCount: Number(data.approvedCount ?? 0),
    status: data.status,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export function businessAccountBalanceId(
  businessId: string,
  accountId: string
): string {
  return `${businessId}_${accountId}`;
}

function businessAccountBalanceRef(businessId: string, accountId: string) {
  return doc(
    getClientDb(),
    "businessAccountBalances",
    businessAccountBalanceId(businessId, accountId)
  );
}

function mapBusinessAccountBalance(
  data: DocumentData,
  id: string
): BusinessAccountBalance {
  return {
    id,
    businessId: data.businessId,
    accountId: data.accountId,
    openingBalance: Number(data.openingBalance ?? 0),
    currentBalance: Number(data.currentBalance ?? 0),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Apply an approved-tx delta to a business↔account holding.
 * Must be called only after all transaction reads (Firestore txn rules).
 */
function applyHoldingDeltaInTxn(
  transaction: FsTransaction,
  holdingSnap: Awaited<ReturnType<FsTransaction["get"]>>,
  holdingRef: ReturnType<typeof businessAccountBalanceRef>,
  businessId: string,
  accountId: string,
  delta: number
): void {
  if (!holdingSnap.exists()) {
    transaction.set(holdingRef, {
      businessId,
      accountId,
      openingBalance: 0,
      currentBalance: delta,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }
  const holdingData = holdingSnap.data() as DocumentData;
  const current = Number(holdingData.currentBalance ?? 0);
  transaction.update(holdingRef, {
    currentBalance: current + delta,
    updatedAt: serverTimestamp(),
  });
}

function mapTransaction(data: DocumentData, id: string): Transaction {
  const approverId = data.approverId || data.checkerId;
  const approverName = data.approverName || data.checkerName;
  return {
    id,
    displayId: data.displayId || id,
    businessId: data.businessId,
    accountId: data.accountId,
    direction: data.direction,
    category: data.category,
    amount: Number(data.amount ?? 0),
    date: data.date,
    description: data.description ?? "",
    status: data.status === "draft" ? "pending" : data.status,
    makerId: data.makerId,
    makerName: data.makerName,
    checkerId: data.checkerId,
    checkerName: data.checkerName,
    approverId,
    approverName,
    rejectionReason: data.rejectionReason,
    transferGroupId: data.transferGroupId,
    linkedTransactionId: data.linkedTransactionId,
    attachments: Array.isArray(data.attachments)
      ? data.attachments.map((item: DocumentData) => mapAttachment(item))
      : [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    submittedAt: data.submittedAt ? toDate(data.submittedAt) : undefined,
    approvedAt: data.approvedAt ? toDate(data.approvedAt) : undefined,
    rejectedAt: data.rejectedAt ? toDate(data.rejectedAt) : undefined,
  };
}

/** DDMMYY counter key from YYYY-MM-DD. */
export function txnCounterIdFromDate(date: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) throw new Error("Invalid transaction date");
  return `txn-${d}${m}${y.slice(2)}`;
}

export function formatTxnDisplayId(date: string, seq: number): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) throw new Error("Invalid transaction date");
  return `TXN-${d}${m}${y.slice(2)}-${seq}`;
}

async function readCounterSeq(
  transaction: FsTransaction,
  date: string
): Promise<{ ref: ReturnType<typeof doc>; current: number }> {
  const ref = doc(getClientDb(), "counters", txnCounterIdFromDate(date));
  const snap = await transaction.get(ref);
  return {
    ref,
    current: snap.exists() ? Number(snap.data()?.seq ?? 0) : 0,
  };
}

function writeAllocatedDisplayIds(
  transaction: FsTransaction,
  counterRef: ReturnType<typeof doc>,
  date: string,
  current: number,
  count: number
): string[] {
  const ids: string[] = [];
  for (let i = 1; i <= count; i++) {
    ids.push(formatTxnDisplayId(date, current + i));
  }
  transaction.set(counterRef, { seq: current + count }, { merge: true });
  return ids;
}

function mapAuditLog(data: DocumentData, id: string): AuditLog {
  return {
    id,
    action: data.action as AuditAction,
    entityType:
      data.entityType === "user" ? "user" : ("transaction" as AuditEntityType),
    entityId: data.entityId,
    actorId: data.actorId,
    actorName: data.actorName ?? "",
    previousStatus: data.previousStatus,
    newStatus: data.newStatus,
    changes: Array.isArray(data.changes) ? data.changes : undefined,
    rejectionReason: data.rejectionReason,
    businessId: data.businessId,
    accountId: data.accountId,
    amount:
      data.amount !== undefined && data.amount !== null
        ? Number(data.amount)
        : undefined,
    direction: data.direction,
    description: data.description,
    transferGroupId: data.transferGroupId,
    linkedTransactionId: data.linkedTransactionId,
    createdAt: toDate(data.createdAt),
  };
}

function auditPayload(input: {
  action: AuditAction;
  entityType?: AuditEntityType;
  entityId: string;
  actorId: string;
  actorName: string;
  previousStatus?: TransactionStatus;
  newStatus?: TransactionStatus;
  changes?: AuditChange[];
  rejectionReason?: string;
  businessId?: string;
  accountId?: string;
  amount?: number;
  direction?: TransactionDirection;
  description?: string;
  transferGroupId?: string;
  linkedTransactionId?: string;
}): DocumentData {
  const payload: DocumentData = {
    action: input.action,
    entityType: input.entityType ?? "transaction",
    entityId: input.entityId,
    actorId: input.actorId,
    actorName: input.actorName.trim(),
    createdAt: serverTimestamp(),
  };
  if (input.previousStatus !== undefined)
    payload.previousStatus = input.previousStatus;
  if (input.newStatus !== undefined) payload.newStatus = input.newStatus;
  if (input.changes !== undefined && input.changes.length > 0)
    payload.changes = input.changes;
  if (input.rejectionReason !== undefined)
    payload.rejectionReason = input.rejectionReason;
  if (input.businessId !== undefined) payload.businessId = input.businessId;
  if (input.accountId !== undefined) payload.accountId = input.accountId;
  if (input.amount !== undefined) payload.amount = Number(input.amount);
  if (input.direction !== undefined) payload.direction = input.direction;
  if (input.description !== undefined)
    payload.description = input.description;
  if (input.transferGroupId !== undefined)
    payload.transferGroupId = input.transferGroupId;
  if (input.linkedTransactionId !== undefined)
    payload.linkedTransactionId = input.linkedTransactionId;
  return payload;
}

function diffTransactionFields(
  before: Transaction,
  input: Partial<{
    businessId: string;
    accountId: string;
    direction: TransactionDirection;
    category: string;
    amount: number;
    date: string;
    description: string;
    attachments: TransactionAttachment[];
  }>
): AuditChange[] {
  const changes: AuditChange[] = [];
  const push = (
    field: string,
    from: string | number | null,
    to: string | number | null
  ) => {
    if (from === to) return;
    changes.push({ field, from, to });
  };

  if (input.businessId !== undefined)
    push("businessId", before.businessId, input.businessId);
  if (input.accountId !== undefined)
    push("accountId", before.accountId, input.accountId);
  if (input.direction !== undefined)
    push("direction", before.direction, input.direction);
  if (input.category !== undefined)
    push("category", before.category, input.category);
  if (input.amount !== undefined)
    push("amount", before.amount, Number(input.amount));
  if (input.date !== undefined) push("date", before.date, input.date);
  if (input.description !== undefined)
    push("description", before.description, input.description.trim());
  if (input.attachments !== undefined)
    push("attachments", before.attachments.length, input.attachments.length);

  return changes;
}

export async function appendAuditLog(input: {
  action: AuditAction;
  entityType?: AuditEntityType;
  entityId: string;
  actorId: string;
  actorName: string;
  previousStatus?: TransactionStatus;
  newStatus?: TransactionStatus;
  changes?: AuditChange[];
  rejectionReason?: string;
  businessId?: string;
  accountId?: string;
  amount?: number;
  direction?: TransactionDirection;
  description?: string;
  transferGroupId?: string;
  linkedTransactionId?: string;
}): Promise<string> {
  const ref = await addDoc(
    collection(getClientDb(), "auditLogs"),
    auditPayload(input)
  );
  return ref.id;
}

export async function listAuditLogs(filters?: {
  action?: AuditAction;
  entityType?: AuditEntityType;
  dateFrom?: string;
  dateTo?: string;
  pageSize?: number;
  cursor?: PageCursor | null;
}): Promise<PageResult<AuditLog>> {
  const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
  const constraints: QueryConstraint[] = [];

  if (filters?.action) constraints.push(where("action", "==", filters.action));
  if (filters?.entityType)
    constraints.push(where("entityType", "==", filters.entityType));

  if (filters?.dateFrom) {
    const from = Timestamp.fromDate(
      new Date(`${filters.dateFrom}T00:00:00`)
    );
    constraints.push(where("createdAt", ">=", from));
  }
  if (filters?.dateTo) {
    const to = Timestamp.fromDate(
      new Date(`${filters.dateTo}T23:59:59.999`)
    );
    constraints.push(where("createdAt", "<=", to));
  }

  constraints.push(orderBy("createdAt", "desc"));

  if (filters?.cursor) constraints.push(startAfter(filters.cursor));
  constraints.push(limit(pageSize));

  const q = query(collection(getClientDb(), "auditLogs"), ...constraints);
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => mapAuditLog(d.data(), d.id));

  const nextCursor =
    snap.docs.length === pageSize
      ? snap.docs[snap.docs.length - 1] ?? null
      : null;

  return { items, nextCursor };
}

export { ensureUserProfile } from "@/lib/firebase/user-profile";

export async function getUserProfile(uid: string): Promise<AppUser | null> {
  const snap = await getDoc(doc(getClientDb(), "users", uid));
  if (!snap.exists()) return null;
  return mapUser(snap.data(), snap.id);
}

export async function listUsers(): Promise<AppUser[]> {
  const q = query(collection(getClientDb(), "users"), orderBy("email"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapUser(d.data(), d.id));
}

export async function updateUserProfile(
  id: string,
  input: Partial<Pick<AppUser, "displayName" | "role">>,
  actor: { actorId: string; actorName: string }
): Promise<void> {
  const before = await getUserProfile(id);
  if (!before) throw new Error("User not found");

  await updateDoc(doc(getClientDb(), "users", id), {
    ...input,
    ...(input.displayName !== undefined
      ? { displayName: input.displayName.trim() }
      : {}),
  });

  const changes: AuditChange[] = [];
  if (input.role !== undefined && input.role !== before.role) {
    changes.push({
      field: "role",
      from: before.role,
      to: input.role,
    });
  }
  if (input.displayName !== undefined) {
    const nextName = input.displayName.trim();
    if (nextName !== before.displayName) {
      changes.push({
        field: "displayName",
        from: before.displayName || null,
        to: nextName,
      });
    }
  }
  if (changes.length === 0) return;

  const nextName =
    input.displayName !== undefined
      ? input.displayName.trim()
      : before.displayName;
  const nextRole = input.role !== undefined ? input.role : before.role;

  await appendAuditLog({
    action: "updated",
    entityType: "user",
    entityId: id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    changes,
    description: `${nextName || before.email} (${before.email})${
      nextRole ? ` · ${nextRole}` : ""
    }`,
  });
}

export async function clearMustChangePassword(uid: string): Promise<void> {
  await updateDoc(doc(getClientDb(), "users", uid), {
    mustChangePassword: false,
  });
}

function isRetainedEarningsBusiness(business: Business): boolean {
  return Boolean(business.isSystem) || business.code === "RE";
}

export async function listBusinesses(): Promise<Business[]> {
  const cached = getCachedBusinesses();
  if (cached) return cached;
  const q = query(collection(getClientDb(), "businesses"), orderBy("name"));
  const snap = await getDocs(q);
  const items = snap.docs
    .map((d) => mapBusiness(d.data(), d.id))
    .filter((b) => !isRetainedEarningsBusiness(b));
  setCachedBusinesses(items);
  return items;
}

export async function getBusiness(id: string): Promise<Business | null> {
  const snap = await getDoc(doc(getClientDb(), "businesses", id));
  if (!snap.exists()) return null;
  const business = mapBusiness(snap.data(), snap.id);
  if (isRetainedEarningsBusiness(business)) return null;
  return business;
}

export async function createBusiness(input: {
  name: string;
  code: string;
  notes?: string;
  fixedAssetExpense?: number;
  openings?: { accountId: string; amount: number }[];
}): Promise<string> {
  const db = getClientDb();
  const openings = (input.openings ?? [])
    .map((o) => ({
      accountId: o.accountId,
      amount: Number(o.amount) || 0,
    }))
    .filter((o) => o.amount > 0);

  for (const o of openings) {
    if (o.amount < 0) {
      throw new Error("Opening amounts cannot be negative");
    }
  }

  const batch = writeBatch(db);
  const businessRef = doc(collection(db, "businesses"));
  const totalCapital = openings.reduce((sum, o) => sum + o.amount, 0);

  batch.set(businessRef, {
    name: input.name.trim(),
    code: input.code.trim().toUpperCase(),
    status: "active",
    notes: input.notes?.trim() || "",
    fixedAssetExpense: Number(input.fixedAssetExpense) || 0,
    totalCapital,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const o of openings) {
    const accountRef = doc(db, "accounts", o.accountId);
    const accountSnap = await getDoc(accountRef);
    if (!accountSnap.exists()) {
      throw new Error("Account not found");
    }
    const account = accountSnap.data();
    const opening = Number(account.openingBalance ?? 0);
    const current = Number(account.currentBalance ?? 0);

    batch.update(accountRef, {
      openingBalance: opening + o.amount,
      currentBalance: current + o.amount,
      updatedAt: serverTimestamp(),
    });

    const holdingRef = doc(
      db,
      "businessAccountBalances",
      businessAccountBalanceId(businessRef.id, o.accountId)
    );
    batch.set(holdingRef, {
      businessId: businessRef.id,
      accountId: o.accountId,
      openingBalance: o.amount,
      currentBalance: o.amount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  invalidateBusinessesCache();
  if (openings.length > 0) invalidateAccountsCache();
  return businessRef.id;
}

export async function listBusinessAccountBalances(
  businessId: string
): Promise<BusinessAccountBalance[]> {
  const q = query(
    collection(getClientDb(), "businessAccountBalances"),
    where("businessId", "==", businessId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapBusinessAccountBalance(d.data(), d.id));
}

export async function listAccountBusinessBalances(
  accountId: string
): Promise<BusinessAccountBalance[]> {
  const q = query(
    collection(getClientDb(), "businessAccountBalances"),
    where("accountId", "==", accountId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapBusinessAccountBalance(d.data(), d.id));
}

/**
 * Set opening capital per account for a business.
 * Deltas vs previous openings are applied to both holdings and shared accounts.
 */
export async function setBusinessOpeningBalances(
  businessId: string,
  allocations: { accountId: string; amount: number }[]
): Promise<void> {
  const normalized = allocations.map((o) => ({
    accountId: o.accountId,
    amount: Number(o.amount) || 0,
  }));
  for (const o of normalized) {
    if (o.amount < 0) {
      throw new Error("Opening amounts cannot be negative");
    }
  }

  const db = getClientDb();
  const businessRef = doc(db, "businesses", businessId);
  const existingHoldings = await listBusinessAccountBalances(businessId);
  const allocationAccountIds = new Set(normalized.map((o) => o.accountId));
  const extraHoldingIds = existingHoldings
    .filter((h) => !allocationAccountIds.has(h.accountId))
    .map((h) => h.id);

  await runTransaction(db, async (transaction) => {
    const businessSnap = await transaction.get(businessRef);
    if (!businessSnap.exists()) throw new Error("Business not found");

    type Planned = {
      accountId: string;
      amount: number;
      holdingRef: ReturnType<typeof doc>;
      accountRef: ReturnType<typeof doc>;
      holdingSnap: Awaited<ReturnType<FsTransaction["get"]>>;
      accountSnap: Awaited<ReturnType<FsTransaction["get"]>>;
    };
    const planned: Planned[] = [];

    for (const o of normalized) {
      const holdingRef = doc(
        db,
        "businessAccountBalances",
        businessAccountBalanceId(businessId, o.accountId)
      );
      const accountRef = doc(db, "accounts", o.accountId);
      const holdingSnap = await transaction.get(holdingRef);
      const accountSnap = await transaction.get(accountRef);
      planned.push({
        accountId: o.accountId,
        amount: o.amount,
        holdingRef,
        accountRef,
        holdingSnap,
        accountSnap,
      });
    }

    const extraSnaps: Awaited<ReturnType<FsTransaction["get"]>>[] = [];
    for (const id of extraHoldingIds) {
      extraSnaps.push(
        await transaction.get(doc(db, "businessAccountBalances", id))
      );
    }

    let totalCapital = 0;
    for (const snap of extraSnaps) {
      if (snap.exists()) {
        const data = snap.data() as DocumentData;
        totalCapital += Number(data.openingBalance ?? 0);
      }
    }

    for (const row of planned) {
      if (!row.accountSnap.exists()) {
        throw new Error("Account not found");
      }
      const holdingData = row.holdingSnap.exists()
        ? (row.holdingSnap.data() as DocumentData)
        : null;
      const accountData = row.accountSnap.data() as DocumentData;
      const prevOpening = holdingData
        ? Number(holdingData.openingBalance ?? 0)
        : 0;
      const prevCurrent = holdingData
        ? Number(holdingData.currentBalance ?? 0)
        : 0;
      const delta = row.amount - prevOpening;
      const nextHoldingCurrent = prevCurrent + delta;
      const acctOpening = Number(accountData.openingBalance ?? 0);
      const acctCurrent = Number(accountData.currentBalance ?? 0);
      const nextAcctOpening = acctOpening + delta;
      const nextAcctCurrent = acctCurrent + delta;

      if (nextHoldingCurrent < 0 || nextAcctCurrent < 0) {
        throw new Error(
          "Cannot reduce opening capital below available balance in that account"
        );
      }

      totalCapital += row.amount;

      if (delta !== 0) {
        transaction.update(row.accountRef, {
          openingBalance: nextAcctOpening,
          currentBalance: nextAcctCurrent,
          updatedAt: serverTimestamp(),
        });
      }

      if (!row.holdingSnap.exists()) {
        if (row.amount === 0) continue;
        transaction.set(row.holdingRef, {
          businessId,
          accountId: row.accountId,
          openingBalance: row.amount,
          currentBalance: nextHoldingCurrent,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.update(row.holdingRef, {
          openingBalance: row.amount,
          currentBalance: nextHoldingCurrent,
          updatedAt: serverTimestamp(),
        });
      }
    }

    transaction.update(businessRef, {
      totalCapital,
      updatedAt: serverTimestamp(),
    });
  });

  invalidateBusinessesCache();
  invalidateAccountsCache();
}

export async function updateBusiness(
  id: string,
  input: Partial<
    Pick<
      Business,
      | "name"
      | "code"
      | "notes"
      | "status"
      | "totalCapital"
      | "fixedAssetExpense"
      | "totalSaleVolume"
      | "operationExpense"
      | "totalProfit"
    >
  >
): Promise<void> {
  const payload: DocumentData = {
    updatedAt: serverTimestamp(),
  };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.code !== undefined) payload.code = input.code.trim().toUpperCase();
  if (input.notes !== undefined) payload.notes = input.notes;
  if (input.status !== undefined) payload.status = input.status;
  if (input.totalCapital !== undefined)
    payload.totalCapital = Number(input.totalCapital) || 0;
  if (input.fixedAssetExpense !== undefined)
    payload.fixedAssetExpense = Number(input.fixedAssetExpense) || 0;
  if (input.totalSaleVolume !== undefined)
    payload.totalSaleVolume = Number(input.totalSaleVolume) || 0;
  if (input.operationExpense !== undefined)
    payload.operationExpense = Number(input.operationExpense) || 0;
  if (input.totalProfit !== undefined)
    payload.totalProfit = Number(input.totalProfit) || 0;

  await updateDoc(doc(getClientDb(), "businesses", id), payload);
  invalidateBusinessesCache();
}

function mapFixedAsset(data: DocumentData, id: string): FixedAsset {
  return {
    id,
    name: data.name ?? "",
    amount: Number(data.amount ?? 0),
    date: data.date ?? "",
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function fixedAssetsCollection(businessId: string) {
  return collection(getClientDb(), "businesses", businessId, "fixedAssets");
}

export async function listFixedAssets(
  businessId: string
): Promise<FixedAsset[]> {
  const q = query(fixedAssetsCollection(businessId), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapFixedAsset(d.data(), d.id));
}

async function recomputeFixedAssetExpense(businessId: string): Promise<number> {
  const snap = await getDocs(fixedAssetsCollection(businessId));
  const sum = snap.docs.reduce(
    (acc, d) => acc + (Number(d.data()?.amount) || 0),
    0
  );
  await updateDoc(doc(getClientDb(), "businesses", businessId), {
    fixedAssetExpense: sum,
    updatedAt: serverTimestamp(),
  });
  invalidateBusinessesCache();
  return sum;
}

export async function createFixedAsset(
  businessId: string,
  input: { name: string; amount: number; date: string; notes?: string }
): Promise<string> {
  const amount = Number(input.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  const ref = await addDoc(fixedAssetsCollection(businessId), {
    name: input.name.trim(),
    amount,
    date: input.date,
    notes: input.notes?.trim() || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await recomputeFixedAssetExpense(businessId);
  return ref.id;
}

export async function updateFixedAsset(
  businessId: string,
  assetId: string,
  input: Partial<{ name: string; amount: number; date: string; notes: string }>
): Promise<void> {
  const payload: DocumentData = { updatedAt: serverTimestamp() };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.amount !== undefined) {
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new Error("Amount must be greater than zero");
    payload.amount = amount;
  }
  if (input.date !== undefined) payload.date = input.date;
  if (input.notes !== undefined) payload.notes = input.notes.trim();

  await updateDoc(
    doc(getClientDb(), "businesses", businessId, "fixedAssets", assetId),
    payload
  );
  await recomputeFixedAssetExpense(businessId);
}

export async function deleteFixedAsset(
  businessId: string,
  assetId: string
): Promise<void> {
  await deleteDoc(
    doc(getClientDb(), "businesses", businessId, "fixedAssets", assetId)
  );
  await recomputeFixedAssetExpense(businessId);
}

export async function listAccounts(): Promise<Account[]> {
  const cached = getCachedAccounts();
  if (cached) return cached;
  const q = query(collection(getClientDb(), "accounts"), orderBy("name"));
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => mapAccount(d.data(), d.id));
  setCachedAccounts(items);
  return items;
}

export async function getAccount(id: string): Promise<Account | null> {
  const snap = await getDoc(doc(getClientDb(), "accounts", id));
  if (!snap.exists()) return null;
  return mapAccount(snap.data(), snap.id);
}

export async function createAccount(input: {
  type: Account["type"];
  name: string;
  bankName?: string;
  accountNumber?: string;
  bankBranch?: string;
  bankAddress?: string;
  openingBalance: number;
}): Promise<string> {
  const opening = Number(input.openingBalance) || 0;
  const ref = await addDoc(collection(getClientDb(), "accounts"), {
    type: input.type,
    name: input.name.trim(),
    bankName: input.bankName?.trim() || "",
    accountNumber: input.accountNumber?.trim() || "",
    bankBranch: input.bankBranch?.trim() || "",
    bankAddress: input.bankAddress?.trim() || "",
    currency: "MMK",
    openingBalance: opening,
    currentBalance: opening,
    pendingCount: 0,
    approvedCount: 0,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  invalidateAccountsCache();
  return ref.id;
}

export async function updateAccount(
  id: string,
  input: Partial<
    Pick<
      Account,
      | "name"
      | "bankName"
      | "accountNumber"
      | "bankBranch"
      | "bankAddress"
      | "status"
      | "type"
    >
  >
): Promise<void> {
  const payload: DocumentData = {
    updatedAt: serverTimestamp(),
  };
  if (input.name !== undefined) payload.name = input.name.trim();
  if (input.bankName !== undefined) payload.bankName = input.bankName.trim();
  if (input.accountNumber !== undefined)
    payload.accountNumber = input.accountNumber.trim();
  if (input.bankBranch !== undefined)
    payload.bankBranch = input.bankBranch.trim();
  if (input.bankAddress !== undefined)
    payload.bankAddress = input.bankAddress.trim();
  if (input.status !== undefined) payload.status = input.status;
  if (input.type !== undefined) payload.type = input.type;

  await updateDoc(doc(getClientDb(), "accounts", id), payload);
  invalidateAccountsCache();
}

export type ListTransactionsFilters = {
  status?: TransactionStatus;
  businessId?: string;
  accountId?: string;
  direction?: TransactionDirection;
  dateFrom?: string;
  dateTo?: string;
  makerId?: string;
  pageSize?: number;
  cursor?: PageCursor | null;
  /** Include attachment metadata (detail-style). Default false for lists. */
  includeAttachments?: boolean;
};

export type TransactionsSummary = {
  count: number;
  totalIn: number;
  totalOut: number;
  net: number;
};

/** Equality / range filters only (no orderBy). Safe for aggregate queries. */
function transactionFilterConstraints(
  filters?: Omit<
    ListTransactionsFilters,
    "pageSize" | "cursor" | "includeAttachments"
  >
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];

  if (filters?.makerId)
    constraints.push(where("makerId", "==", filters.makerId));
  if (filters?.status) constraints.push(where("status", "==", filters.status));
  if (filters?.businessId)
    constraints.push(where("businessId", "==", filters.businessId));
  if (filters?.accountId)
    constraints.push(where("accountId", "==", filters.accountId));
  if (filters?.direction)
    constraints.push(where("direction", "==", filters.direction));

  if (filters?.dateFrom)
    constraints.push(where("date", ">=", filters.dateFrom));
  if (filters?.dateTo) constraints.push(where("date", "<=", filters.dateTo));

  return constraints;
}

function transactionListConstraints(
  filters?: ListTransactionsFilters
): QueryConstraint[] {
  const useDateOrder = Boolean(filters?.dateFrom || filters?.dateTo);
  const constraints = transactionFilterConstraints(filters);
  if (useDateOrder) {
    // Date range requires ordering by date first; secondary createdAt puts latest first within a day.
    constraints.push(orderBy("date", "desc"));
    constraints.push(orderBy("createdAt", "desc"));
  } else {
    constraints.push(orderBy("createdAt", "desc"));
  }
  return constraints;
}

export async function listTransactions(
  filters?: ListTransactionsFilters
): Promise<PageResult<Transaction>> {
  const pageSize = filters?.pageSize ?? DEFAULT_PAGE_SIZE;
  const constraints = transactionListConstraints(filters);

  if (filters?.cursor) constraints.push(startAfter(filters.cursor));
  constraints.push(limit(pageSize));

  const q = query(collection(getClientDb(), "transactions"), ...constraints);
  const snap = await getDocs(q);
  const mapFn = filters?.includeAttachments ? mapTransaction : mapTransactionList;
  const items = snap.docs.map((d) => mapFn(d.data(), d.id));
  const nextCursor =
    snap.docs.length === pageSize
      ? snap.docs[snap.docs.length - 1] ?? null
      : null;

  return { items, nextCursor };
}

/**
 * KPI totals via Firestore aggregate queries (count + sum) — no full doc scans.
 * Uses two direction-scoped aggregates when direction is unrestricted.
 */
export async function summarizeTransactions(
  filters?: Omit<
    ListTransactionsFilters,
    "pageSize" | "cursor" | "includeAttachments"
  >
): Promise<TransactionsSummary> {
  const col = collection(getClientDb(), "transactions");

  async function aggregateDirection(
    direction: TransactionDirection
  ): Promise<{ count: number; total: number }> {
    const constraints = transactionFilterConstraints({
      ...filters,
      direction,
    });
    const snap = await getAggregateFromServer(query(col, ...constraints), {
      count: count(),
      total: sum("amount"),
    });
    const data = snap.data();
    return {
      count: data.count,
      total: Number(data.total ?? 0),
    };
  }

  if (filters?.direction === "income") {
    const income = await aggregateDirection("income");
    return {
      count: income.count,
      totalIn: income.total,
      totalOut: 0,
      net: income.total,
    };
  }
  if (filters?.direction === "expense") {
    const expense = await aggregateDirection("expense");
    return {
      count: expense.count,
      totalIn: 0,
      totalOut: expense.total,
      net: -expense.total,
    };
  }

  const [income, expense] = await Promise.all([
    aggregateDirection("income"),
    aggregateDirection("expense"),
  ]);
  const totalIn = income.total;
  const totalOut = expense.total;
  return {
    count: income.count + expense.count,
    totalIn,
    totalOut,
    net: totalIn - totalOut,
  };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const snap = await getDoc(doc(getClientDb(), "transactions", id));
  if (!snap.exists()) return null;
  return mapTransaction(snap.data(), snap.id);
}

export async function createTransaction(input: {
  businessId: string;
  accountId: string;
  direction: TransactionDirection;
  category: string;
  amount: number;
  date: string;
  description: string;
  makerId: string;
  makerName: string;
}): Promise<string> {
  const amount = Number(input.amount);
  const description = input.description.trim();
  const makerName = input.makerName.trim();
  const db = getClientDb();

  const ref = doc(collection(db, "transactions"));
  const auditRef = doc(collection(db, "auditLogs"));
  const accountRef = doc(db, "accounts", input.accountId);

  await runTransaction(db, async (transaction) => {
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) throw new Error("Account not found");

    const counter = await readCounterSeq(transaction, input.date);
    const groupRef = groupSummaryRef();
    const groupSnap = await transaction.get(groupRef);
    const group = mapGroupSummary(
      groupSnap.exists() ? groupSnap.data() : undefined
    );

    const [displayId] = writeAllocatedDisplayIds(
      transaction,
      counter.ref,
      input.date,
      counter.current,
      1
    );
    applyPendingCountDelta(transaction, groupRef, group, 1);

    const pendingCount = Number(accountSnap.data()?.pendingCount ?? 0);
    transaction.update(accountRef, {
      pendingCount: pendingCount + 1,
      updatedAt: serverTimestamp(),
    });

    transaction.set(ref, {
      displayId,
      businessId: input.businessId,
      accountId: input.accountId,
      direction: input.direction,
      category: input.category,
      amount,
      date: input.date,
      description,
      status: "pending",
      makerId: input.makerId,
      makerName,
      attachments: [],
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(
      auditRef,
      auditPayload({
        action: "created",
        entityId: ref.id,
        actorId: input.makerId,
        actorName: makerName,
        previousStatus: undefined,
        newStatus: "pending",
        businessId: input.businessId,
        accountId: input.accountId,
        amount,
        direction: input.direction,
        description: `${displayId}: ${description}`,
      })
    );
  });

  invalidateAccountsCache();
  return ref.id;
}

export async function createTransfer(input: {
  fromBusinessId: string;
  toBusinessId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  description: string;
  makerId: string;
  makerName: string;
}): Promise<{ outId: string; inId: string; transferGroupId: string }> {
  if (input.fromAccountId === input.toAccountId) {
    throw new Error("Transfer requires two different accounts");
  }
  const amount = Number(input.amount);
  if (!(amount > 0)) throw new Error("Amount must be greater than zero");
  const description = input.description.trim();
  const makerName = input.makerName.trim();
  const db = getClientDb();

  const outRef = doc(collection(db, "transactions"));
  const inRef = doc(collection(db, "transactions"));
  const transferGroupId = outRef.id;
  const outAuditRef = doc(collection(db, "auditLogs"));
  const inAuditRef = doc(collection(db, "auditLogs"));
  const fromAccountRef = doc(db, "accounts", input.fromAccountId);
  const toAccountRef = doc(db, "accounts", input.toAccountId);

  await runTransaction(db, async (transaction) => {
    const [fromSnap, toSnap] = await Promise.all([
      transaction.get(fromAccountRef),
      transaction.get(toAccountRef),
    ]);
    if (!fromSnap.exists() || !toSnap.exists()) {
      throw new Error("Account not found");
    }
    const fromAccountLabel = formatAccountLabel(
      mapAccount(fromSnap.data()!, fromSnap.id)
    );
    const toAccountLabel = formatAccountLabel(
      mapAccount(toSnap.data()!, toSnap.id)
    );

    const counter = await readCounterSeq(transaction, input.date);
    const groupRef = groupSummaryRef();
    const groupSnap = await transaction.get(groupRef);
    const group = mapGroupSummary(
      groupSnap.exists() ? groupSnap.data() : undefined
    );

    const [outDisplayId, inDisplayId] = writeAllocatedDisplayIds(
      transaction,
      counter.ref,
      input.date,
      counter.current,
      2
    );
    applyPendingCountDelta(transaction, groupRef, group, 2);

    transaction.update(fromAccountRef, {
      pendingCount: Number(fromSnap.data()?.pendingCount ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
    transaction.update(toAccountRef, {
      pendingCount: Number(toSnap.data()?.pendingCount ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });

    transaction.set(outRef, {
      displayId: outDisplayId,
      businessId: input.fromBusinessId,
      accountId: input.fromAccountId,
      direction: "expense",
      category: "transfers_sent",
      amount,
      date: input.date,
      description,
      status: "pending",
      makerId: input.makerId,
      makerName,
      transferGroupId,
      linkedTransactionId: inRef.id,
      attachments: [],
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(inRef, {
      displayId: inDisplayId,
      businessId: input.toBusinessId,
      accountId: input.toAccountId,
      direction: "income",
      category: "transfers_received",
      amount,
      date: input.date,
      description,
      status: "pending",
      makerId: input.makerId,
      makerName,
      transferGroupId,
      linkedTransactionId: outRef.id,
      attachments: [],
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    transaction.set(
      outAuditRef,
      auditPayload({
        action: "created",
        entityId: outRef.id,
        actorId: input.makerId,
        actorName: makerName,
        newStatus: "pending",
        businessId: input.fromBusinessId,
        accountId: input.fromAccountId,
        amount,
        direction: "expense",
        transferGroupId,
        linkedTransactionId: inRef.id,
        description: `Internal transfer ${outDisplayId} → ${inDisplayId}: from ${fromAccountLabel} to ${toAccountLabel} — ${description}`,
      })
    );
    transaction.set(
      inAuditRef,
      auditPayload({
        action: "created",
        entityId: inRef.id,
        actorId: input.makerId,
        actorName: makerName,
        newStatus: "pending",
        businessId: input.toBusinessId,
        accountId: input.toAccountId,
        amount,
        direction: "income",
        transferGroupId,
        linkedTransactionId: outRef.id,
        description: `Internal transfer ${outDisplayId} → ${inDisplayId}: from ${fromAccountLabel} to ${toAccountLabel} — ${description}`,
      })
    );
  });

  invalidateAccountsCache();
  return { outId: outRef.id, inId: inRef.id, transferGroupId };
}

export async function listTransactionsByTransferGroup(
  transferGroupId: string
): Promise<Transaction[]> {
  const q = query(
    collection(getClientDb(), "transactions"),
    where("transferGroupId", "==", transferGroupId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapTransaction(d.data(), d.id));
}

export async function updateTransaction(
  id: string,
  input: Partial<{
    businessId: string;
    accountId: string;
    direction: TransactionDirection;
    category: string;
    amount: number;
    date: string;
    description: string;
    attachments: TransactionAttachment[];
  }>,
  actor: { actorId: string; actorName: string }
): Promise<void> {
  const before = await getTransaction(id);
  if (!before) throw new Error("Transaction not found");

  const { attachments, ...rest } = input;
  await updateDoc(doc(getClientDb(), "transactions", id), {
    ...rest,
    ...(rest.description !== undefined
      ? { description: rest.description.trim() }
      : {}),
    ...(rest.amount !== undefined ? { amount: Number(rest.amount) } : {}),
    ...(attachments !== undefined
      ? { attachments: serializeAttachments(attachments) }
      : {}),
    updatedAt: serverTimestamp(),
  });

  const changes = diffTransactionFields(before, input);
  if (changes.length === 0) return;

  await appendAuditLog({
    action: "updated",
    entityId: id,
    actorId: actor.actorId,
    actorName: actor.actorName,
    previousStatus: before.status,
    newStatus: before.status,
    changes,
    businessId: input.businessId ?? before.businessId,
    accountId: input.accountId ?? before.accountId,
    amount: input.amount !== undefined ? Number(input.amount) : before.amount,
    direction: input.direction ?? before.direction,
    description:
      input.description !== undefined
        ? input.description.trim()
        : before.description,
  });
}

export async function rejectTransaction(
  id: string,
  approverId: string,
  approverName: string,
  reason: string
): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) throw new Error("Transaction not found");
  if (tx.transferGroupId) {
    await rejectTransferGroup(
      tx.transferGroupId,
      approverId,
      approverName,
      reason
    );
    return;
  }
  await rejectSingleTransaction(id, approverId, approverName, reason);
}

async function rejectSingleTransaction(
  id: string,
  approverId: string,
  approverName: string,
  reason: string
): Promise<void> {
  const db = getClientDb();
  const txRef = doc(db, "transactions", id);
  const auditRef = doc(collection(db, "auditLogs"));
  const trimmedReason = reason.trim();
  const name = approverName.trim();

  await runTransaction(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found");
    const data = txSnap.data();
    if (data.status !== "pending") {
      throw new Error("Only pending transactions can be rejected");
    }

    const accountRef = doc(db, "accounts", data.accountId);
    const accountSnap = await transaction.get(accountRef);

    await adjustPendingCount(transaction, -1);

    if (accountSnap.exists()) {
      transaction.update(accountRef, {
        pendingCount: Math.max(
          0,
          Number(accountSnap.data()?.pendingCount ?? 0) - 1
        ),
        updatedAt: serverTimestamp(),
      });
    }

    transaction.update(txRef, {
      status: "rejected",
      approverId,
      approverName: name,
      rejectionReason: trimmedReason,
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.set(
      auditRef,
      auditPayload({
        action: "rejected",
        entityId: id,
        actorId: approverId,
        actorName: name,
        previousStatus: "pending",
        newStatus: "rejected",
        rejectionReason: trimmedReason,
        businessId: data.businessId,
        accountId: data.accountId,
        amount: Number(data.amount),
        direction: data.direction,
        description: data.description ?? "",
      })
    );
  });

  invalidateAccountsCache();
}

export async function rejectTransferGroup(
  transferGroupId: string,
  approverId: string,
  approverName: string,
  reason: string
): Promise<void> {
  const legs = await listTransactionsByTransferGroup(transferGroupId);
  if (legs.length !== 2) throw new Error("Transfer group incomplete");
  if (legs.some((l) => l.status !== "pending")) {
    throw new Error("Only pending transfers can be rejected");
  }

  const db = getClientDb();
  const name = approverName.trim();
  const trimmedReason = reason.trim();
  const legRefs = legs.map((l) => doc(db, "transactions", l.id));
  const accountRefs = legs.map((l) => doc(db, "accounts", l.accountId));
  const auditRefs = legs.map(() => doc(collection(db, "auditLogs")));

  await runTransaction(db, async (transaction) => {
    const legSnaps = await Promise.all(legRefs.map((r) => transaction.get(r)));
    const accountSnaps = await Promise.all(
      accountRefs.map((r) => transaction.get(r))
    );

    for (const snap of legSnaps) {
      if (!snap.exists() || snap.data()?.status !== "pending") {
        throw new Error("Only pending transfers can be rejected");
      }
    }

    await adjustPendingCount(transaction, -2);

    const outLeg = legs.find((l) => l.direction === "expense");
    const inLeg = legs.find((l) => l.direction === "income");
    const outIdx = outLeg ? legs.findIndex((l) => l.id === outLeg.id) : -1;
    const inIdx = inLeg ? legs.findIndex((l) => l.id === inLeg.id) : -1;
    const fromAccountLabel =
      outIdx >= 0 && accountSnaps[outIdx]?.exists()
        ? formatAccountLabel(
            mapAccount(accountSnaps[outIdx]!.data()!, accountSnaps[outIdx]!.id)
          )
        : null;
    const toAccountLabel =
      inIdx >= 0 && accountSnaps[inIdx]?.exists()
        ? formatAccountLabel(
            mapAccount(accountSnaps[inIdx]!.data()!, accountSnaps[inIdx]!.id)
          )
        : null;
    const routeLabel =
      outLeg && inLeg
        ? `${outLeg.displayId} → ${inLeg.displayId}`
        : legs.map((l) => l.displayId).join(" · ");
    const routePlaces =
      fromAccountLabel && toAccountLabel
        ? ` from ${fromAccountLabel} to ${toAccountLabel}`
        : "";

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      const accountSnap = accountSnaps[i]!;
      if (accountSnap.exists()) {
        transaction.update(accountRefs[i]!, {
          pendingCount: Math.max(
            0,
            Number(accountSnap.data()?.pendingCount ?? 0) - 1
          ),
          updatedAt: serverTimestamp(),
        });
      }
      transaction.update(legRefs[i]!, {
        status: "rejected",
        approverId,
        approverName: name,
        rejectionReason: trimmedReason,
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(
        auditRefs[i]!,
        auditPayload({
          action: "rejected",
          entityId: leg.id,
          actorId: approverId,
          actorName: name,
          previousStatus: "pending",
          newStatus: "rejected",
          rejectionReason: trimmedReason,
          businessId: leg.businessId,
          accountId: leg.accountId,
          amount: leg.amount,
          direction: leg.direction,
          transferGroupId,
          linkedTransactionId: leg.linkedTransactionId,
          description: `Internal transfer rejected (${routeLabel})${routePlaces}: ${leg.description}`,
        })
      );
    }
  });

  invalidateAccountsCache();
}

export async function approveTransaction(
  id: string,
  approverId: string,
  approverName: string
): Promise<void> {
  const tx = await getTransaction(id);
  if (!tx) throw new Error("Transaction not found");
  if (tx.transferGroupId) {
    await approveTransferGroup(tx.transferGroupId, approverId, approverName);
    return;
  }
  await approveSingleTransaction(id, approverId, approverName);
}

async function approveSingleTransaction(
  id: string,
  approverId: string,
  approverName: string
): Promise<void> {
  const db = getClientDb();
  const txRef = doc(db, "transactions", id);
  const auditRef = doc(collection(db, "auditLogs"));

  await runTransaction(db, async (transaction) => {
    const txSnap = await transaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found");
    const data = txSnap.data();
    if (data.status !== "pending") {
      throw new Error("Only pending transactions can be approved");
    }

    const accountRef = doc(db, "accounts", data.accountId);
    const accountSnap = await transaction.get(accountRef);
    if (!accountSnap.exists()) throw new Error("Account not found");

    const businessId = data.businessId as string;
    const accountId = data.accountId as string;
    const holdingRef = businessAccountBalanceRef(businessId, accountId);
    const holdingSnap = await transaction.get(holdingRef);

    const amount = Number(data.amount);
    const summaryInput = {
      businessId,
      accountId,
      direction: data.direction as TransactionDirection,
      amount,
      date: data.date as string,
      category: data.category as string,
      transferGroupId: (data.transferGroupId as string | undefined) ?? null,
    };
    const summaryCtx = await readSummarySnapsForApprove(
      transaction,
      summaryInput
    );

    const currentBalance = Number(accountSnap.data().currentBalance ?? 0);
    const pendingCount = Number(accountSnap.data().pendingCount ?? 0);
    const approvedCount = Number(accountSnap.data().approvedCount ?? 0);
    const delta = data.direction === "income" ? amount : -amount;
    const name = approverName.trim();

    transaction.update(txRef, {
      status: "approved",
      approverId,
      approverName: name,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(accountRef, {
      currentBalance: currentBalance + delta,
      pendingCount: Math.max(0, pendingCount - 1),
      approvedCount: approvedCount + 1,
      updatedAt: serverTimestamp(),
    });
    applyHoldingDeltaInTxn(
      transaction,
      holdingSnap,
      holdingRef,
      businessId,
      accountId,
      delta
    );
    writeApproveSummaries(transaction, summaryInput, summaryCtx, -1);
    transaction.set(
      auditRef,
      auditPayload({
        action: "approved",
        entityId: id,
        actorId: approverId,
        actorName: name,
        previousStatus: "pending",
        newStatus: "approved",
        businessId,
        accountId,
        amount,
        direction: data.direction,
        description: data.description ?? "",
      })
    );
  });

  invalidateAccountsCache();
}

export async function approveTransferGroup(
  transferGroupId: string,
  approverId: string,
  approverName: string
): Promise<void> {
  const legs = await listTransactionsByTransferGroup(transferGroupId);
  if (legs.length !== 2) throw new Error("Transfer group incomplete");
  if (legs.some((l) => l.status !== "pending")) {
    throw new Error("Only pending transfers can be approved");
  }

  const db = getClientDb();
  const name = approverName.trim();
  const legRefs = legs.map((l) => doc(db, "transactions", l.id));
  const accountRefs = legs.map((l) => doc(db, "accounts", l.accountId));
  const holdingRefs = legs.map((l) =>
    businessAccountBalanceRef(l.businessId, l.accountId)
  );
  const auditRefs = legs.map(() => doc(collection(db, "auditLogs")));

  await runTransaction(db, async (transaction) => {
    const legSnaps = await Promise.all(legRefs.map((r) => transaction.get(r)));
    const accountSnaps = await Promise.all(
      accountRefs.map((r) => transaction.get(r))
    );
    const holdingSnaps = await Promise.all(
      holdingRefs.map((r) => transaction.get(r))
    );

    for (let i = 0; i < legs.length; i++) {
      if (!legSnaps[i]?.exists() || legSnaps[i]!.data()?.status !== "pending") {
        throw new Error("Only pending transfers can be approved");
      }
      if (!accountSnaps[i]?.exists()) throw new Error("Account not found");
    }

    const summaryInputs = legs.map((leg) => ({
      businessId: leg.businessId,
      accountId: leg.accountId,
      direction: leg.direction,
      amount: leg.amount,
      date: leg.date,
      category: leg.category,
      transferGroupId: leg.transferGroupId ?? transferGroupId,
    }));
    const summaryCtxs = [];
    for (const input of summaryInputs) {
      summaryCtxs.push(await readSummarySnapsForApprove(transaction, input));
    }

    writeApproveSummariesMulti(transaction, summaryInputs, summaryCtxs, -2);

    const outLeg = legs.find((l) => l.direction === "expense");
    const inLeg = legs.find((l) => l.direction === "income");
    const outIdx = outLeg ? legs.findIndex((l) => l.id === outLeg.id) : -1;
    const inIdx = inLeg ? legs.findIndex((l) => l.id === inLeg.id) : -1;
    const fromAccountLabel =
      outIdx >= 0 && accountSnaps[outIdx]?.exists()
        ? formatAccountLabel(
            mapAccount(accountSnaps[outIdx]!.data()!, accountSnaps[outIdx]!.id)
          )
        : null;
    const toAccountLabel =
      inIdx >= 0 && accountSnaps[inIdx]?.exists()
        ? formatAccountLabel(
            mapAccount(accountSnaps[inIdx]!.data()!, accountSnaps[inIdx]!.id)
          )
        : null;
    const routeLabel =
      outLeg && inLeg
        ? `${outLeg.displayId} → ${inLeg.displayId}`
        : legs.map((l) => l.displayId).join(" · ");
    const routePlaces =
      fromAccountLabel && toAccountLabel
        ? ` from ${fromAccountLabel} to ${toAccountLabel}`
        : "";

    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      const accountSnap = accountSnaps[i]!;
      const amount = leg.amount;
      const currentBalance = Number(accountSnap.data()?.currentBalance ?? 0);
      const pendingCount = Number(accountSnap.data()?.pendingCount ?? 0);
      const approvedCount = Number(accountSnap.data()?.approvedCount ?? 0);
      const delta = leg.direction === "income" ? amount : -amount;

      transaction.update(legRefs[i]!, {
        status: "approved",
        approverId,
        approverName: name,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(accountRefs[i]!, {
        currentBalance: currentBalance + delta,
        pendingCount: Math.max(0, pendingCount - 1),
        approvedCount: approvedCount + 1,
        updatedAt: serverTimestamp(),
      });
      applyHoldingDeltaInTxn(
        transaction,
        holdingSnaps[i]!,
        holdingRefs[i]!,
        leg.businessId,
        leg.accountId,
        delta
      );
      transaction.set(
        auditRefs[i]!,
        auditPayload({
          action: "approved",
          entityId: leg.id,
          actorId: approverId,
          actorName: name,
          previousStatus: "pending",
          newStatus: "approved",
          businessId: leg.businessId,
          accountId: leg.accountId,
          amount,
          direction: leg.direction,
          transferGroupId,
          linkedTransactionId: leg.linkedTransactionId,
          description: `Internal transfer approved (${routeLabel})${routePlaces}: ${leg.description}`,
        })
      );
    }
  });

  invalidateAccountsCache();
}
