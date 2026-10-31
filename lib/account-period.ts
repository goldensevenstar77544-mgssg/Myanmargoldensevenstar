import type { Account, EntityMonthSummary, Transaction } from "@/lib/types";
import {
  addTxToBucket,
  bucketFlowNet,
  bucketNet,
  emptyBucket,
  netBeforePeriodStart,
  sumBuckets,
} from "@/lib/summaries";

export type PeriodKind = "day" | "month" | "year" | "all";
/** @deprecated Prefer PeriodKind */
export type AccountPeriod = PeriodKind;

export type PeriodMatchField = "accountId" | "businessId";

export interface PeriodBounds {
  start: string | null;
  end: string | null;
  label: string;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  /** External P&L net (excludes transfers). */
  net: number;
  /** Cash movement including transfers (for opening/closing). */
  flowNet: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function getPeriodBounds(
  period: PeriodKind,
  year: number,
  month: number,
  day = 1
): PeriodBounds {
  if (period === "all") {
    return { start: null, end: null, label: "all time" };
  }
  if (period === "year") {
    return {
      start: `${year}-01-01`,
      end: `${year}-12-31`,
      label: String(year),
    };
  }
  const m = pad2(month);
  if (period === "day") {
    const maxDay = lastDayOfMonth(year, month);
    const safeDay = Math.min(Math.max(1, day), maxDay);
    const key = `${year}-${m}-${pad2(safeDay)}`;
    return {
      start: key,
      end: key,
      label: `${safeDay} ${MONTH_NAMES[month - 1]} ${year}`,
    };
  }
  const last = lastDayOfMonth(year, month);
  return {
    start: `${year}-${m}-01`,
    end: `${year}-${m}-${pad2(last)}`,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
  };
}

export function filterByPeriod(
  transactions: Transaction[],
  start: string | null,
  end: string | null
): Transaction[] {
  if (!start && !end) return transactions;
  return transactions.filter((tx) => {
    if (start && tx.date < start) return false;
    if (end && tx.date > end) return false;
    return true;
  });
}

function matchesEntity(
  tx: Transaction,
  entityId: string,
  matchField: PeriodMatchField
): boolean {
  return tx[matchField] === entityId;
}

export function approvedNetBefore(
  transactions: Transaction[],
  entityId: string,
  matchField: PeriodMatchField,
  start: string | null
): number {
  if (!start) return 0;
  let net = 0;
  for (const tx of transactions) {
    if (tx.status !== "approved") continue;
    if (!matchesEntity(tx, entityId, matchField)) continue;
    if (tx.date >= start) continue;
    net += tx.direction === "income" ? tx.amount : -tx.amount;
  }
  return net;
}

export function periodOpening(
  account: Account,
  transactions: Transaction[],
  start: string | null
): number {
  return (
    account.openingBalance +
    approvedNetBefore(transactions, account.id, "accountId", start)
  );
}

export function periodOpeningFromMonths(
  account: Account,
  months: EntityMonthSummary[],
  start: string | null
): number {
  return account.openingBalance + netBeforePeriodStart(months, start);
}

/**
 * Opening when only months on/after `start` are loaded, using lifetime flow
 * from the entity summary: before = lifetime − sum(months ≥ start).
 */
export function periodOpeningFromLifetime(
  openingBalance: number,
  lifetimeFlowNet: number,
  monthsFromStart: EntityMonthSummary[],
  start: string | null
): number {
  if (!start) return openingBalance;
  const beforeKey = start.slice(0, 7);
  let fromStart = 0;
  for (const month of monthsFromStart) {
    if (month.id < beforeKey) continue;
    fromStart += bucketFlowNet(month);
  }
  return openingBalance + lifetimeFlowNet - fromStart;
}

export function businessPeriodOpening(
  openingCapital: number,
  businessId: string,
  transactions: Transaction[],
  start: string | null
): number {
  return (
    openingCapital +
    approvedNetBefore(transactions, businessId, "businessId", start)
  );
}

export function businessPeriodOpeningFromMonths(
  openingCapital: number,
  months: EntityMonthSummary[],
  start: string | null
): number {
  return openingCapital + netBeforePeriodStart(months, start);
}

export function businessPeriodOpeningFromLifetime(
  openingCapital: number,
  lifetimeFlowNet: number,
  monthsFromStart: EntityMonthSummary[],
  start: string | null
): number {
  return periodOpeningFromLifetime(
    openingCapital,
    lifetimeFlowNet,
    monthsFromStart,
    start
  );
}

export function summarizeApproved(transactions: Transaction[]): PeriodSummary {
  let bucket = emptyBucket();
  for (const tx of transactions) {
    if (tx.status !== "approved") continue;
    bucket = addTxToBucket(bucket, {
      direction: tx.direction,
      amount: tx.amount,
      category: tx.category,
      transferGroupId: tx.transferGroupId,
    });
  }
  return {
    ...bucket,
    net: bucketNet(bucket),
    flowNet: bucketFlowNet(bucket),
  };
}

export function summarizeMonthsInPeriod(
  months: EntityMonthSummary[],
  period: PeriodKind,
  year: number,
  month: number
): PeriodSummary {
  let selected: EntityMonthSummary[] = [];
  if (period === "all") {
    selected = months;
  } else if (period === "year") {
    const prefix = `${year}-`;
    selected = months.filter((m) => m.id.startsWith(prefix));
  } else {
    // month and day views both use that calendar month's rollup.
    const key = `${year}-${pad2(month)}`;
    selected = months.filter((m) => m.id === key);
  }
  const bucket = sumBuckets(selected);
  return {
    ...bucket,
    net: bucketNet(bucket),
    flowNet: bucketFlowNet(bucket),
  };
}

export function periodClosing(
  opening: number,
  account: Account,
  periodFlowNet: number,
  period: PeriodKind
): number {
  if (period === "all") return account.currentBalance;
  return opening + periodFlowNet;
}

export function businessPeriodClosing(
  opening: number,
  periodFlowNet: number,
  period: PeriodKind,
  currentHoldingsTotal: number
): number {
  if (period === "all") return currentHoldingsTotal;
  return opening + periodFlowNet;
}

/** Month key (YYYY-MM) to start fetching rollups for a period view. */
export function monthSummariesSinceKey(
  period: PeriodKind,
  year: number,
  month: number
): string | null {
  if (period === "all") return null;
  if (period === "year") return `${year}-01`;
  return `${year}-${pad2(month)}`;
}

/** Day keys `YYYY-MM-DD` for a calendar month. */
export function monthDayKeys(year: number, month: number): string[] {
  const days = lastDayOfMonth(year, month);
  const m = pad2(month);
  return Array.from({ length: days }, (_, i) => `${year}-${m}-${pad2(i + 1)}`);
}

/** Year keys from earliest month summary through `throughYear`. */
export function allTimeYearKeysFromMonths(
  months: EntityMonthSummary[],
  throughYear: number
): number[] {
  let earliest = throughYear;
  for (const month of months) {
    const y = Number(month.id.slice(0, 4));
    if (Number.isFinite(y) && y < earliest) earliest = y;
  }
  if (months.length === 0) return [throughYear];
  const years: number[] = [];
  for (let y = earliest; y <= throughYear; y++) years.push(y);
  return years;
}

/** Year keys from earliest approved tx year through `throughYear`. */
export function allTimeYearKeys(
  transactions: Transaction[],
  entityId: string,
  throughYear: number,
  matchField: PeriodMatchField = "accountId"
): number[] {
  let earliest = throughYear;
  for (const tx of transactions) {
    if (tx.status !== "approved") continue;
    if (!matchesEntity(tx, entityId, matchField)) continue;
    const y = Number(tx.date.slice(0, 4));
    if (Number.isFinite(y) && y < earliest) earliest = y;
  }
  const years: number[] = [];
  for (let y = earliest; y <= throughYear; y++) years.push(y);
  return years;
}

export function formatDayLabel(dateKey: string): string {
  return String(Number(dateKey.slice(8, 10)));
}
