"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAccounts,
  listBusinesses,
  listTransactions,
  summarizeTransactions,
  type PageCursor,
  type TransactionsSummary,
} from "@/lib/firebase/firestore";
import {
  getPeriodBounds,
  type PeriodKind,
} from "@/lib/account-period";
import { canCreateTransaction, isMaker, transactionApproverName } from "@/lib/permissions";
import type {
  Account,
  Business,
  Transaction,
  TransactionDirection,
  TransactionStatus,
} from "@/lib/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/types";
import {
  cn,
  formatCompactMMK,
  formatDate,
  formatMMK,
  formatAccountLabel,
  formatTime,
} from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { useMinWidth } from "@/lib/use-min-width";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";
import { TransferRoute } from "@/components/transfer-route";

type AppliedFilters = {
  status: string;
  direction: string;
  businessId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
};

type TransferLegs = {
  out?: Transaction;
  inLeg?: Transaction;
};

function buildTransferLegIndex(items: Transaction[]): {
  byId: Map<string, Transaction>;
  byGroupDirection: Map<string, Transaction>;
} {
  const byId = new Map(items.map((t) => [t.id, t]));
  const byGroupDirection = new Map<string, Transaction>();
  for (const t of items) {
    if (!t.transferGroupId) continue;
    byGroupDirection.set(`${t.transferGroupId}:${t.direction}`, t);
  }
  return { byId, byGroupDirection };
}

function resolveTransferLegs(
  tx: Transaction,
  index: ReturnType<typeof buildTransferLegIndex>
): TransferLegs {
  const linked = tx.linkedTransactionId
    ? index.byId.get(tx.linkedTransactionId)
    : undefined;
  const out =
    tx.direction === "expense"
      ? tx
      : linked?.direction === "expense"
        ? linked
        : tx.transferGroupId
          ? index.byGroupDirection.get(`${tx.transferGroupId}:expense`)
          : undefined;
  const inLeg =
    tx.direction === "income"
      ? tx
      : linked?.direction === "income"
        ? linked
        : tx.transferGroupId
          ? index.byGroupDirection.get(`${tx.transferGroupId}:income`)
          : undefined;
  return { out, inLeg };
}

const MONTH_OPTIONS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
] as const;

const EMPTY_SUMMARY: TransactionsSummary = {
  count: 0,
  totalIn: 0,
  totalOut: 0,
  net: 0,
};

function datesFromPeriod(
  period: PeriodKind,
  year: number,
  month: number
): Pick<AppliedFilters, "dateFrom" | "dateTo"> {
  const bounds = getPeriodBounds(period, year, month);
  return {
    dateFrom: bounds.start ?? "",
    dateTo: bounds.end ?? "",
  };
}

function PeriodSegment({
  value,
  period,
  onChange,
}: {
  value: PeriodKind;
  period: PeriodKind;
  onChange: (period: PeriodKind) => void;
}) {
  const labels: Record<PeriodKind, string> = {
    month: "Month",
    year: "Year",
    all: "All time",
  };
  const active = value === period;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={cn(
        "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3",
        active
          ? "bg-white text-zinc-950 shadow-sm"
          : "text-zinc-500 hover:text-zinc-800"
      )}
    >
      {labels[value]}
    </button>
  );
}

function KpiRow({
  label,
  amount,
  tone,
  isCount,
  hero,
  className,
}: {
  label: string;
  amount: number;
  tone?: "income" | "expense" | "neutral";
  isCount?: boolean;
  hero?: boolean;
  className?: string;
}) {
  const valueTone =
    tone === "income"
      ? "text-emerald-700"
      : tone === "expense"
        ? "text-rose-700"
        : "text-zinc-950";

  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-3 px-2.5 sm:px-3",
        hero ? "py-2.5 sm:py-3" : "py-2",
        className
      )}
    >
      <div className="min-w-0 shrink truncate text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        title={isCount ? String(amount) : formatMMK(amount)}
        className={cn(
          "min-w-0 text-right font-semibold tracking-tight tabular-nums leading-tight",
          hero ? "text-base sm:text-lg" : "text-sm sm:text-base",
          valueTone
        )}
      >
        {isCount ? amount.toLocaleString() : formatCompactMMK(amount)}
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [items, setItems] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [period, setPeriod] = useState<PeriodKind>("month");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [businessId, setBusinessId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    status: "all",
    direction: "all",
    businessId: "all",
    accountId: "all",
    ...datesFromPeriod("month", currentYear, currentMonth),
  }));
  const [summary, setSummary] = useState<TransactionsSummary>(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const businessMap = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );
  const accountMap = useMemo(
    () =>
      Object.fromEntries(
        accounts.map((a) => [a.id, formatAccountLabel(a)])
      ),
    [accounts]
  );

  const transferIndex = useMemo(() => buildTransferLegIndex(items), [items]);
  const { matches: isDesktop, ready: layoutReady } = useMinWidth(768);

  const listFiltersFromApplied = useCallback(
    (filters: AppliedFilters) => {
      if (!profile) return null;
      const transferOnly = filters.direction === "transfer";
      return {
        status:
          filters.status === "all"
            ? undefined
            : (filters.status as TransactionStatus),
        direction:
          filters.direction === "all" || transferOnly
            ? undefined
            : (filters.direction as TransactionDirection),
        transferOnly: transferOnly || undefined,
        businessId:
          filters.businessId === "all" ? undefined : filters.businessId,
        accountId: filters.accountId === "all" ? undefined : filters.accountId,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        makerId: isMaker(profile) ? profile.id : undefined,
      };
    },
    [profile]
  );

  const fetchPage = useCallback(
    async (filters: AppliedFilters, after: PageCursor | null, append: boolean) => {
      const base = listFiltersFromApplied(filters);
      if (!base) return;
      const page = await listTransactions({
        ...base,
        pageSize: DEFAULT_PAGE_SIZE,
        cursor: after,
      });
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    },
    [listFiltersFromApplied]
  );

  const loadMaster = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [biz, acc] = await Promise.all([
        listBusinesses(),
        listAccounts(),
      ]);
      setBusinesses(biz);
      setAccounts(acc);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load transactions");
      setLoading(false);
    }
  }, [profile]);

  useLoadOnMount(loadMaster);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      setSummaryLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setSummaryLoading(true);

    const base = listFiltersFromApplied(applied);
    if (!base) return;

    Promise.all([
      fetchPage(applied, null, false),
      summarizeTransactions(base),
    ])
      .then(([, kpi]) => {
        if (!cancelled) setSummary(kpi);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load transactions");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setSummaryLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [profile, applied, fetchPage, listFiltersFromApplied]);

  const netTone =
    summary.net > 0 ? "income" : summary.net < 0 ? "expense" : "neutral";

  const canGoNextMonth =
    year < currentYear || (year === currentYear && month < currentMonth);
  const canGoNextYear = year < currentYear;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isCurrentYear = year === currentYear;

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }

  function goToCurrentPeriod() {
    setYear(currentYear);
    setMonth(currentMonth);
  }

  // Period controls apply immediately (like business detail).
  useEffect(() => {
    const dates = datesFromPeriod(period, year, month);
    setApplied((prev) => {
      if (prev.dateFrom === dates.dateFrom && prev.dateTo === dates.dateTo) {
        return prev;
      }
      return { ...prev, ...dates };
    });
  }, [period, year, month]);

  const hasActiveFilters =
    status !== "all" ||
    direction !== "all" ||
    businessId !== "all" ||
    accountId !== "all" ||
    period !== "month" ||
    !isCurrentMonth;

  function clearFilters() {
    setStatus("all");
    setDirection("all");
    setBusinessId("all");
    setAccountId("all");
    setPeriod("month");
    setYear(currentYear);
    setMonth(currentMonth);
    setApplied({
      status: "all",
      direction: "all",
      businessId: "all",
      accountId: "all",
      ...datesFromPeriod("month", currentYear, currentMonth),
    });
  }

  function setFilterField(
    field: "status" | "direction" | "businessId" | "accountId",
    value: string
  ) {
    if (field === "status") setStatus(value);
    if (field === "direction") setDirection(value);
    if (field === "businessId") setBusinessId(value);
    if (field === "accountId") setAccountId(value);
    setApplied((prev) => ({
      ...prev,
      [field]: value,
      ...datesFromPeriod(period, year, month),
    }));
  }

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      await fetchPage(applied, cursor, true);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load more");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Transactions
          </h1>
          <p className="hidden text-sm text-zinc-500 sm:block">
            Income and expense records with Maker–Approver workflow.
          </p>
        </div>
        {canCreateTransaction(profile) && (
          <Button asChild className="hidden md:inline-flex">
            <Link href="/transactions/new">
              <Plus className="h-4 w-4" />
              New transaction
            </Link>
          </Button>
        )}
      </div>

      {canCreateTransaction(profile) && (
        <MobileFabStack>
          <MobileFab href="/transactions/new" label="New transaction" />
        </MobileFabStack>
      )}

      <div
        className={cn(
          "overflow-hidden rounded-xl border border-zinc-200 bg-white",
          summaryLoading && "opacity-70"
        )}
      >
        <div className="divide-y divide-zinc-100">
          <KpiRow
            label="Net"
            amount={summary.net}
            tone={netTone}
            hero
          />
          <KpiRow label="Total in" amount={summary.totalIn} tone="income" />
          <KpiRow label="Total out" amount={summary.totalOut} tone="expense" />
          <KpiRow label="Count" amount={summary.count} isCount />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex w-full rounded-lg bg-zinc-100 p-0.5">
          <PeriodSegment value="month" period={period} onChange={setPeriod} />
          <PeriodSegment value="year" period={period} onChange={setPeriod} />
          <PeriodSegment value="all" period={period} onChange={setPeriod} />
        </div>

        {period === "month" && (
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft />
            </Button>
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 sm:flex-none">
              <Select
                value={String(month)}
                onValueChange={(v) => setMonth(Number(v))}
              >
                <SelectTrigger className="h-9 w-[4.5rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={String(opt.value)}
                      disabled={
                        year === currentYear && opt.value > currentMonth
                      }
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="min-w-12 text-center text-sm font-medium tabular-nums">
                {year}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Next month"
              disabled={!canGoNextMonth}
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={isCurrentMonth}
              onClick={goToCurrentPeriod}
            >
              Current
            </Button>
          </div>
        )}

        {period === "year" && (
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Previous year"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-14 flex-1 text-center text-sm font-medium tabular-nums sm:flex-none">
              {year}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Next year"
              disabled={!canGoNextYear}
              onClick={() => setYear((y) => Math.min(currentYear, y + 1))}
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={isCurrentYear}
              onClick={goToCurrentPeriod}
            >
              Current
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          value={businessId}
          onValueChange={(v) => setFilterField("businessId", v)}
        >
          <SelectTrigger
            aria-label="Business"
            title={
              businessId === "all"
                ? "All businesses"
                : businesses.find((b) => b.id === businessId)?.name || "Business"
            }
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[11rem] sm:text-sm"
          >
            <SelectValue placeholder="Business" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All businesses</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={accountId}
          onValueChange={(v) => setFilterField("accountId", v)}
        >
          <SelectTrigger
            aria-label="Bank or cash"
            title={
              accountId === "all"
                ? "All accounts"
                : (() => {
                    const account = accounts.find((a) => a.id === accountId);
                    return account
                      ? formatAccountLabel(account)
                      : "Account";
                  })()
            }
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[11rem] sm:text-sm"
          >
            <SelectValue placeholder="Account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {formatAccountLabel(a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => setFilterField("status", v)}
        >
          <SelectTrigger
            aria-label="Status"
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[9rem] sm:text-sm"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={direction}
          onValueChange={(v) => setFilterField("direction", v)}
        >
          <SelectTrigger
            aria-label="Type"
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:ml-auto sm:w-[11rem] sm:text-sm"
          >
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="income">In</SelectItem>
            <SelectItem value="expense">Out</SelectItem>
            <SelectItem value="transfer">Internal transfers</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="col-span-2 h-9 sm:col-span-1"
            onClick={clearFilters}
          >
            Clear
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No transactions match filters.</p>
          ) : (
            <>
              {!layoutReady ? (
                <LoadingState variant="page" />
              ) : isDesktop ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>From / To</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Maker</TableHead>
                      <TableHead>Approver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((tx, index) => {
                      const { out, inLeg } = resolveTransferLegs(
                        tx,
                        transferIndex
                      );
                      return (
                        <TableRow
                          key={tx.id}
                          className="cursor-pointer"
                          onClick={() => router.push(`/transactions/${tx.id}`)}
                        >
                          <TableCell className="tabular-nums text-zinc-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {tx.displayId}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5 leading-snug">
                              <p>{formatDate(tx.date)}</p>
                              <p className="text-xs text-zinc-500">
                                {formatTime(tx.createdAt)}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[16rem]">
                            {tx.transferGroupId ? (
                              <TransferRoute
                                compact
                                fromBusiness={
                                  out?.businessId
                                    ? businessMap[out.businessId]
                                    : undefined
                                }
                                fromAccount={
                                  out?.accountId
                                    ? accountMap[out.accountId]
                                    : undefined
                                }
                                toBusiness={
                                  inLeg?.businessId
                                    ? businessMap[inLeg.businessId]
                                    : undefined
                                }
                                toAccount={
                                  inLeg?.accountId
                                    ? accountMap[inLeg.accountId]
                                    : undefined
                                }
                              />
                            ) : (
                              <div className="space-y-0.5 text-xs leading-snug">
                                <p className="truncate">
                                  {businessMap[tx.businessId] || "—"}
                                </p>
                                <p className="truncate text-zinc-500">
                                  {accountMap[tx.accountId] || "—"}
                                </p>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {tx.transferGroupId
                              ? "Transfer"
                              : tx.direction === "income"
                                ? "In"
                                : "Out"}
                          </TableCell>
                          <TableCell className="max-w-[14rem] truncate text-zinc-500">
                            {tx.description?.trim() || "—"}
                          </TableCell>
                          <TableCell
                            className={
                              tx.direction === "income"
                                ? "font-medium text-emerald-700"
                                : "font-medium text-rose-700"
                            }
                          >
                            {tx.direction === "income" ? "+" : "−"}
                            {formatMMK(tx.amount)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={tx.status} />
                          </TableCell>
                          <TableCell className="max-w-[9rem] truncate">
                            {tx.makerName || "—"}
                          </TableCell>
                          <TableCell className="max-w-[9rem] truncate">
                            {transactionApproverName(tx) || "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {items.map((tx) => {
                    const { out, inLeg } = resolveTransferLegs(tx, transferIndex);
                    const typeLabel = tx.transferGroupId
                      ? "Transfer"
                      : tx.direction === "income"
                        ? "In"
                        : "Out";
                    return (
                      <Link
                        key={tx.id}
                        href={`/transactions/${tx.id}`}
                        className="block space-y-2 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs text-zinc-500">
                              {tx.displayId}
                            </p>
                            {tx.transferGroupId ? (
                              <div className="mt-0.5">
                                <TransferRoute
                                  compact
                                  fromBusiness={
                                    out?.businessId
                                      ? businessMap[out.businessId]
                                      : undefined
                                  }
                                  fromAccount={
                                    out?.accountId
                                      ? accountMap[out.accountId]
                                      : undefined
                                  }
                                  toBusiness={
                                    inLeg?.businessId
                                      ? businessMap[inLeg.businessId]
                                      : undefined
                                  }
                                  toAccount={
                                    inLeg?.accountId
                                      ? accountMap[inLeg.accountId]
                                      : undefined
                                  }
                                />
                              </div>
                            ) : (
                              <>
                                <p className="truncate text-sm font-medium text-zinc-950">
                                  {businessMap[tx.businessId] || "—"}
                                </p>
                                <p className="truncate text-xs text-zinc-500">
                                  {accountMap[tx.accountId] || "—"}
                                </p>
                              </>
                            )}
                            <p className="truncate text-xs text-zinc-500">
                              {formatDate(tx.date)} · {typeLabel}
                            </p>
                            <p className="truncate text-xs text-zinc-500">
                              {formatTime(tx.createdAt)}
                            </p>
                            {tx.description?.trim() ? (
                              <p className="truncate text-xs text-zinc-500">
                                {tx.description.trim()}
                              </p>
                            ) : null}
                          </div>
                          <StatusBadge status={tx.status} />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-zinc-500">
                            {tx.makerName || "—"}
                          </span>
                          <span
                            className={
                              tx.direction === "income"
                                ? "text-sm font-semibold tabular-nums text-emerald-700"
                                : "text-sm font-semibold tabular-nums text-rose-700"
                            }
                          >
                            {tx.direction === "income" ? "+" : "−"}
                            {formatMMK(tx.amount)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
              {hasMore && (
                <div className="flex justify-center border-t border-zinc-100 p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
