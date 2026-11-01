"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { DashboardHero } from "@/components/dashboard-hero";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAccounts,
  listBusinesses,
  listTransactions,
  type PageCursor,
} from "@/lib/firebase/firestore";
import {
  getGroupMonthsForYear,
  getGroupSummary,
  listBusinessSummaries,
  listGroupMonthSummaries,
} from "@/lib/firebase/summaries";
import {
  getPeriodBounds,
  summarizeMonthsInPeriod,
  type PeriodKind,
} from "@/lib/account-period";
import { emptyBucket, sumBuckets } from "@/lib/summaries";
import {
  canCreateTransaction,
  isAdmin,
  isMaker,
} from "@/lib/permissions";
import type {
  Account,
  Business,
  EntitySummary,
  GroupMonthSummary,
  GroupSummary,
  Transaction,
} from "@/lib/types";
import { cn, formatDate, formatMMK } from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";

const CHART_TX_PAGE_SIZE = 200;

async function listAllApprovedTransactionsInRange(
  dateFrom: string,
  dateTo: string,
  makerId?: string
): Promise<Transaction[]> {
  const items: Transaction[] = [];
  let cursor: PageCursor | null = null;
  for (;;) {
    const page = await listTransactions({
      status: "approved",
      dateFrom,
      dateTo,
      pageSize: CHART_TX_PAGE_SIZE,
      cursor,
      makerId,
    });
    items.push(...page.items);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return items;
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

const chartFallback = (
  <Card>
    <CardContent className="py-10">
      <LoadingState variant="inline" />
    </CardContent>
  </Card>
);

const BusinessTrendsChart = dynamic(
  () =>
    import("@/components/business-trends-chart").then(
      (m) => m.BusinessTrendsChart
    ),
  { ssr: false, loading: () => chartFallback }
);

const AccountFlowsChart = dynamic(
  () =>
    import("@/components/account-flows-chart").then(
      (m) => m.AccountFlowsChart
    ),
  { ssr: false, loading: () => chartFallback }
);

const BusinessComparisonChart = dynamic(
  () =>
    import("@/components/business-comparison-chart").then(
      (m) => m.BusinessComparisonChart
    ),
  { ssr: false, loading: () => chartFallback }
);

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
    day: "Day",
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

function periodBusinessSummaries(
  months: GroupMonthSummary[],
  period: PeriodKind,
  year: number,
  month: number,
  lifetime: Record<string, EntitySummary>
): Record<string, EntitySummary> {
  if (period === "all") return lifetime;

  let selected = months;
  if (period === "year") {
    const prefix = `${year}-`;
    selected = months.filter((m) => m.id.startsWith(prefix));
  } else {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    selected = months.filter((m) => m.id === key);
  }

  const totals = new Map<string, ReturnType<typeof emptyBucket>>();
  for (const m of selected) {
    for (const [bizId, bucket] of Object.entries(m.byBusiness)) {
      const prev = totals.get(bizId) ?? emptyBucket();
      totals.set(bizId, sumBuckets([prev, bucket]));
    }
  }

  const result: Record<string, EntitySummary> = {};
  for (const [id, bucket] of totals) {
    result[id] = { id, ...bucket };
  }
  return result;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bizSummaries, setBizSummaries] = useState<
    Record<string, EntitySummary>
  >({});
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [months, setMonths] = useState<GroupMonthSummary[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [monthTransactions, setMonthTransactions] = useState<Transaction[]>(
    []
  );
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [monthsLoading, setMonthsLoading] = useState(false);
  const [monthTxLoading, setMonthTxLoading] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);
  const loadedMonthsKeyRef = useRef<string | null>(null);

  const bounds = useMemo(
    () => getPeriodBounds(period, year, month),
    [period, year, month]
  );

  const monthsCacheKey = period === "all" ? "all" : `year:${year}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [biz, acc, summary, monthDocs, bizSummaryList] = await Promise.all([
        listBusinesses(),
        listAccounts(),
        getGroupSummary(),
        getGroupMonthsForYear(currentYear),
        listBusinessSummaries(),
      ]);
      setBusinesses(biz);
      setAccounts(acc);
      setBizSummaries(
        Object.fromEntries(bizSummaryList.map((s) => [s.id, s]))
      );
      setGroup(summary);
      setMonths(monthDocs);
      loadedMonthsKeyRef.current = `year:${currentYear}`;
    } catch (error) {
      console.error(error);
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [currentYear]);

  useLoadOnMount(load);

  useEffect(() => {
    if (loading) return;
    if (loadedMonthsKeyRef.current === monthsCacheKey) return;
    let cancelled = false;
    setMonthsLoading(true);
    const fetchMonths =
      period === "all"
        ? listGroupMonthSummaries()
        : getGroupMonthsForYear(year);
    fetchMonths
      .then((docs) => {
        if (!cancelled) {
          setMonths(docs);
          loadedMonthsKeyRef.current = monthsCacheKey;
        }
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load chart data");
      })
      .finally(() => {
        if (!cancelled) setMonthsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loading, monthsCacheKey, period, year]);

  const makerId = isMaker(profile) ? profile.id : undefined;

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setRecentLoading(true);
    listTransactions({
      pageSize: 8,
      dateFrom: bounds.start ?? undefined,
      dateTo: bounds.end ?? undefined,
      makerId,
    })
      .then((page) => {
        if (!cancelled) setRecent(page.items);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load recent transactions");
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bounds.start, bounds.end, loading, makerId]);

  useEffect(() => {
    if (loading) return;
    if (period !== "month" || !bounds.start || !bounds.end) {
      setMonthTransactions([]);
      setMonthTxLoading(false);
      return;
    }
    let cancelled = false;
    setMonthTxLoading(true);
    listAllApprovedTransactionsInRange(bounds.start, bounds.end, makerId)
      .then((items) => {
        if (!cancelled) setMonthTransactions(items);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) {
          setMonthTransactions([]);
          toast.error("Failed to load daily chart data");
        }
      })
      .finally(() => {
        if (!cancelled) setMonthTxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bounds.end, bounds.start, loading, makerId, period]);

  const periodSummary = useMemo(() => {
    if (period === "all") {
      return {
        income: group?.income ?? 0,
        expense: group?.expense ?? 0,
        transferIn: group?.transferIn ?? 0,
        transferOut: group?.transferOut ?? 0,
        net: (group?.income ?? 0) - (group?.expense ?? 0),
      };
    }
    return summarizeMonthsInPeriod(months, period, year, month);
  }, [period, group, months, year, month]);

  const comparisonSummaries = useMemo(
    () =>
      periodBusinessSummaries(months, period, year, month, bizSummaries),
    [months, period, year, month, bizSummaries]
  );

  const stats = useMemo(() => {
    const bankBalance = accounts
      .filter((a) => a.type === "bank" && a.status === "active")
      .reduce((sum, a) => sum + a.currentBalance, 0);
    const cashBalance = accounts
      .filter((a) => a.type === "cash" && a.status === "active")
      .reduce((sum, a) => sum + a.currentBalance, 0);
    return {
      income: periodSummary.income,
      expenses: periodSummary.expense,
      transferIn: periodSummary.transferIn,
      transferOut: periodSummary.transferOut,
      net: periodSummary.net,
      bankBalance,
      cashBalance,
      available: bankBalance + cashBalance,
      businessCount: businesses.filter((b) => b.status === "active").length,
      bankAccountCount: accounts.filter(
        (a) => a.type === "bank" && a.status === "active"
      ).length,
      cashAccountCount: accounts.filter(
        (a) => a.type === "cash" && a.status === "active"
      ).length,
      pending: group?.pendingCount ?? 0,
      recent,
    };
  }, [periodSummary, accounts, businesses, group, recent]);

  const businessMap = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );

  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isCurrentYear = year === currentYear;
  const canGoNextYear = year < currentYear;
  const canGoNextMonth =
    year < currentYear || (year === currentYear && month < currentMonth);

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }

  function goToCurrentPeriod() {
    setYear(currentYear);
    setMonth(currentMonth);
  }

  const showMobileFabs = canCreateTransaction(profile);

  return (
    <div className={showMobileFabs ? "space-y-6 pb-24 md:pb-0" : "space-y-6"}>
      {loading ? (
        <LoadingState variant="inline" />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex w-full rounded-lg bg-zinc-100 p-0.5 sm:w-auto">
              <PeriodSegment
                value="month"
                period={period}
                onChange={setPeriod}
              />
              <PeriodSegment
                value="year"
                period={period}
                onChange={setPeriod}
              />
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

          <DashboardHero
            stats={stats}
            periodLabel={bounds.label}
            showApprovalsCta={isAdmin(profile)}
            showNewTransactionCta={canCreateTransaction(profile)}
          />

          <BusinessTrendsChart
            businesses={businesses}
            months={monthsLoading ? [] : months}
            transactions={monthTransactions}
            period={period}
            year={year}
            month={month}
            periodLabel={bounds.label}
            loading={
              period === "month" ? monthTxLoading : monthsLoading
            }
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <AccountFlowsChart
              accounts={accounts}
              months={monthsLoading ? [] : months}
              transactions={monthTransactions}
              period={period}
              year={year}
              month={month}
              periodLabel={bounds.label}
              loading={
                period === "month" ? monthTxLoading : monthsLoading
              }
            />

            <BusinessComparisonChart
              businesses={businesses}
              summaries={
                monthsLoading && period !== "all" ? {} : comparisonSummaries
              }
              periodLabel={bounds.label}
            />
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Recent transactions</CardTitle>
                <CardDescription>
                  Latest activity for {bounds.label}
                  {recentLoading ? " · updating…" : ""}.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/transactions">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {stats.recent.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">
                  No transactions for {bounds.label}.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent.map((tx, index) => (
                      <TableRow key={tx.id}>
                        <TableCell className="tabular-nums text-zinc-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {tx.displayId}
                        </TableCell>
                        <TableCell>{formatDate(tx.date)}</TableCell>
                        <TableCell>
                          {businessMap[tx.businessId] || "—"}
                        </TableCell>
                        <TableCell className="capitalize">
                          {tx.transferGroupId ? "Transfer" : tx.direction}
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
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`/transactions/${tx.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {!profile?.role && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-900">Role not assigned</CardTitle>
                <CardDescription className="text-amber-800">
                  Your user profile exists but has no role. Ask an Admin to set
                  your role to <code>admin</code>, <code>maker</code>,{" "}
                  <code>checker</code>, or <code>approver</code>.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
