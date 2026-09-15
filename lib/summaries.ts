import type {
  IncomeExpenseBucket,
  EntityMonthSummary,
  GroupMonthSummary,
} from "@/lib/types";
import type { TransactionDirection } from "@/lib/types";

export type SummaryMetric =
  | "net"
  | "income"
  | "expense"
  | "transferIn"
  | "transferOut";

export function emptyBucket(): IncomeExpenseBucket {
  return { income: 0, expense: 0, transferIn: 0, transferOut: 0 };
}

export function isTransferCategory(category: string | undefined): boolean {
  return category === "transfers_received" || category === "transfers_sent";
}

/** Classify a tx into bucket fields (transfers vs external P&L). */
export function addTxToBucket(
  bucket: IncomeExpenseBucket,
  input: {
    direction: TransactionDirection;
    amount: number;
    category?: string;
    /** Fallback when category missing (legacy). */
    transferGroupId?: string | null;
  }
): IncomeExpenseBucket {
  const amount = input.amount;
  const category = input.category;
  const isTransfer =
    isTransferCategory(category) || Boolean(input.transferGroupId);

  if (isTransfer) {
    if (
      category === "transfers_received" ||
      (!category && input.direction === "income")
    ) {
      return { ...bucket, transferIn: bucket.transferIn + amount };
    }
    return { ...bucket, transferOut: bucket.transferOut + amount };
  }

  if (input.direction === "income") {
    return { ...bucket, income: bucket.income + amount };
  }
  return { ...bucket, expense: bucket.expense + amount };
}

/** @deprecated Prefer addTxToBucket — treats everything as external P&L. */
export function addToBucket(
  bucket: IncomeExpenseBucket,
  direction: TransactionDirection,
  amount: number
): IncomeExpenseBucket {
  return addTxToBucket(bucket, { direction, amount });
}

/** External P&L net (excludes internal transfers). */
export function bucketNet(bucket: IncomeExpenseBucket): number {
  return bucket.income - bucket.expense;
}

/** Cash-movement net including transfers (for opening/closing). */
export function bucketFlowNet(bucket: IncomeExpenseBucket): number {
  return (
    bucket.income +
    bucket.transferIn -
    bucket.expense -
    bucket.transferOut
  );
}

export function monthKeyFromDate(date: string): string {
  return date.slice(0, 7);
}

/** Sum month flow nets with `YYYY-MM` strictly before `start` (`YYYY-MM-DD` or null). */
export function netBeforePeriodStart(
  months: EntityMonthSummary[],
  start: string | null
): number {
  if (!start) return 0;
  const beforeKey = start.slice(0, 7);
  let net = 0;
  for (const month of months) {
    if (month.id >= beforeKey) continue;
    net += bucketFlowNet(month);
  }
  return net;
}

export function sumBuckets(
  months: Iterable<IncomeExpenseBucket>
): IncomeExpenseBucket {
  let income = 0;
  let expense = 0;
  let transferIn = 0;
  let transferOut = 0;
  for (const m of months) {
    income += m.income;
    expense += m.expense;
    transferIn += m.transferIn ?? 0;
    transferOut += m.transferOut ?? 0;
  }
  return { income, expense, transferIn, transferOut };
}

export function metricFromBucket(
  bucket: IncomeExpenseBucket,
  metric: SummaryMetric
): number {
  if (metric === "income") return bucket.income;
  if (metric === "expense") return bucket.expense;
  if (metric === "transferIn") return bucket.transferIn ?? 0;
  if (metric === "transferOut") return bucket.transferOut ?? 0;
  return bucketNet(bucket);
}

export function mapBucket(
  map: Record<string, IncomeExpenseBucket> | undefined,
  id: string
): IncomeExpenseBucket {
  return map?.[id] ?? emptyBucket();
}

export function upsertMapBucket(
  map: Record<string, IncomeExpenseBucket>,
  id: string,
  direction: TransactionDirection,
  amount: number,
  category?: string,
  transferGroupId?: string | null
): Record<string, IncomeExpenseBucket> {
  const next = { ...map };
  next[id] = addTxToBucket(next[id] ?? emptyBucket(), {
    direction,
    amount,
    category,
    transferGroupId,
  });
  return next;
}

export function emptyGroupMonth(id: string): GroupMonthSummary {
  return {
    id,
    ...emptyBucket(),
    byBusiness: {},
    byAccount: {},
  };
}

export function serializeBucket(bucket: IncomeExpenseBucket): IncomeExpenseBucket {
  return {
    income: bucket.income,
    expense: bucket.expense,
    transferIn: bucket.transferIn ?? 0,
    transferOut: bucket.transferOut ?? 0,
  };
}
