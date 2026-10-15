"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AccountTrendsChart } from "@/components/account-trends-chart";
import { LoadingState } from "@/components/loading-state";
import { PageBackButton } from "@/components/page-back-button";
import { ResponsiveSwitch } from "@/components/responsive-switch";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
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
  getAccount,
  listAccountBusinessBalances,
  listBusinesses,
  listTransactions,
  type PageCursor,
} from "@/lib/firebase/firestore";
import { listAccountMonthSummaries, getAccountSummary } from "@/lib/firebase/summaries";
import {
  getPeriodBounds,
  monthSummariesSinceKey,
  periodClosing,
  periodOpeningFromLifetime,
  periodOpeningFromMonths,
  summarizeMonthsInPeriod,
  type AccountPeriod,
} from "@/lib/account-period";
import { bucketFlowNet } from "@/lib/summaries";
import type {
  Account,
  Business,
  BusinessAccountBalance,
  EntityMonthSummary,
  Transaction,
} from "@/lib/types";
import { CATEGORY_LABELS, DEFAULT_PAGE_SIZE } from "@/lib/types";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import {
  cn,
  formatAccountLabel,
  formatCompactMMK,
  formatDate,
  formatMMK,
} from "@/lib/utils";

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

function MetricRow({
  label,
  amount,
  tone,
  hero,
  className,
}: {
  label: string;
  amount: number;
  tone?: "income" | "expense" | "neutral";
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
        title={formatMMK(amount)}
        className={cn(
          "min-w-0 text-right font-semibold tracking-tight tabular-nums leading-tight",
          hero ? "text-base sm:text-lg" : "text-sm sm:text-base",
          valueTone
        )}
      >
        {formatCompactMMK(amount)}
      </div>
    </div>
  );
}

function PeriodSegment({
  value,
  period,
  onChange,
}: {
  value: AccountPeriod;
  period: AccountPeriod;
  onChange: (period: AccountPeriod) => void;
}) {
  const labels: Record<AccountPeriod, string> = {
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

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [account, setAccount] = useState<Account | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<EntityMonthSummary[]>(
    []
  );
  const [lifetimeFlowNet, setLifetimeFlowNet] = useState(0);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [holdings, setHoldings] = useState<BusinessAccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [period, setPeriod] = useState<AccountPeriod>("month");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const bounds = useMemo(
    () => getPeriodBounds(period, year, month),
    [period, year, month]
  );

  const sinceMonthKey = useMemo(
    () => monthSummariesSinceKey(period, year, month),
    [period, year, month]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, biz, balances, entitySummary] = await Promise.all([
        getAccount(id),
        listBusinesses(),
        listAccountBusinessBalances(id),
        getAccountSummary(id),
      ]);
      setAccount(acc);
      setBusinesses(biz);
      setHoldings(balances);
      setLifetimeFlowNet(bucketFlowNet(entitySummary));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load account");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLoadOnMount(load);

  useEffect(() => {
    let cancelled = false;
    listAccountMonthSummaries(id, sinceMonthKey)
      .then((months) => {
        if (!cancelled) setMonthSummaries(months);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load period summaries");
      });
    return () => {
      cancelled = true;
    };
  }, [id, sinceMonthKey]);

  const loadTransactions = useCallback(
    async (append: boolean, after: PageCursor | null) => {
      setTxLoading(true);
      try {
        const page = await listTransactions({
          accountId: id,
          dateFrom: bounds.start ?? undefined,
          dateTo: bounds.end ?? undefined,
          pageSize: DEFAULT_PAGE_SIZE,
          cursor: after,
        });
        setTransactions((prev) =>
          append ? [...prev, ...page.items] : page.items
        );
        setCursor(page.nextCursor);
        setHasMore(Boolean(page.nextCursor));
      } catch (error) {
        console.error(error);
        toast.error("Failed to load transactions");
      } finally {
        setTxLoading(false);
      }
    },
    [id, bounds.start, bounds.end]
  );

  useEffect(() => {
    if (loading) return;
    setTransactions([]);
    setCursor(null);
    void loadTransactions(false, null);
  }, [loading, loadTransactions]);

  const businessMap = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );

  const holdingsTotalOpening = useMemo(
    () => holdings.reduce((sum, h) => sum + h.openingBalance, 0),
    [holdings]
  );

  const holdingsTotalCurrent = useMemo(
    () => holdings.reduce((sum, h) => sum + h.currentBalance, 0),
    [holdings]
  );

  const unallocatedCurrent = useMemo(() => {
    if (!account) return 0;
    return account.currentBalance - holdingsTotalCurrent;
  }, [account, holdingsTotalCurrent]);

  const unallocatedOpening = useMemo(() => {
    if (!account) return 0;
    return account.openingBalance - holdingsTotalOpening;
  }, [account, holdingsTotalOpening]);

  const shareBase = useMemo(() => {
    if (!account) return 0;
    return Math.abs(account.currentBalance) > 0
      ? account.currentBalance
      : holdingsTotalCurrent;
  }, [account, holdingsTotalCurrent]);

  const opening = useMemo(() => {
    if (!account) return 0;
    if (!bounds.start) {
      return periodOpeningFromMonths(account, monthSummaries, null);
    }
    return periodOpeningFromLifetime(
      account.openingBalance,
      lifetimeFlowNet,
      monthSummaries,
      bounds.start
    );
  }, [account, monthSummaries, bounds.start, lifetimeFlowNet]);

  const summary = useMemo(
    () => summarizeMonthsInPeriod(monthSummaries, period, year, month),
    [monthSummaries, period, year, month]
  );

  const closing = useMemo(
    () =>
      account
        ? periodClosing(opening, account, summary.flowNet, period)
        : 0,
    [account, opening, summary.flowNet, period]
  );

  const runningById = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    let bal = opening;
    const map = new Map<string, number | null>();
    for (const tx of sorted) {
      if (tx.status === "approved") {
        bal += tx.direction === "income" ? tx.amount : -tx.amount;
        map.set(tx.id, bal);
      } else {
        map.set(tx.id, null);
      }
    }
    return map;
  }, [transactions, opening]);

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }

  const canGoNextMonth =
    year < currentYear || (year === currentYear && month < currentMonth);
  const canGoNextYear = year < currentYear;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isCurrentYear = year === currentYear;

  function goToCurrentPeriod() {
    setYear(currentYear);
    setMonth(currentMonth);
  }

  if (loading) {
    return <LoadingState variant="inline" />;
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <PageBackButton fallbackHref="/accounts" />
        <Card>
          <CardHeader>
            <CardTitle>Account not found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const details =
    account.type === "bank"
      ? [account.name, account.accountNumber, account.bankBranch, account.bankAddress]
          .map((v) => v?.trim())
          .filter(Boolean)
          .join(" · ") || "—"
      : "Cash in hand";

  const netTone =
    summary.net > 0 ? "income" : summary.net < 0 ? "expense" : "neutral";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageBackButton fallbackHref="/accounts" />

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {formatAccountLabel(account)}
          </h1>
          <Badge variant="secondary" className="capitalize">
            {account.type}
          </Badge>
          <Badge
            variant={account.status === "active" ? "success" : "secondary"}
          >
            {account.status}
          </Badge>
        </div>
        {details ? <p className="text-sm text-zinc-500">{details}</p> : null}
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-zinc-950">
          {formatMMK(account.currentBalance)}
        </p>
        <p className="text-xs text-zinc-500">
          Opening {formatMMK(account.openingBalance)} · Pending{" "}
          {account.pendingCount} · Approved {account.approvedCount}
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-1 py-3">
          <CardTitle className="text-base">Business holdings</CardTitle>
          <CardDescription className="text-xs">
            Attributed opening {formatMMK(holdingsTotalOpening)}
            {" · "}
            Attributed current {formatMMK(holdingsTotalCurrent)}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {holdings.length === 0 && unallocatedCurrent === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              No business capital attributed to this account yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Opening</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holdings.map((holding, index) => {
                  const share =
                    shareBase !== 0
                      ? (holding.currentBalance / shareBase) * 100
                      : 0;
                  const name =
                    businessMap[holding.businessId] ?? holding.businessId;
                  return (
                    <TableRow key={holding.id}>
                      <TableCell className="tabular-nums text-zinc-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/businesses/${holding.businessId}`}
                          className="text-zinc-900 underline-offset-4 hover:underline"
                        >
                          {name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMMK(holding.openingBalance)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatMMK(holding.currentBalance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-500">
                        {share.toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  );
                })}
                {unallocatedCurrent !== 0 && (
                  <TableRow>
                    <TableCell />
                    <TableCell className="font-medium text-zinc-500">
                      Unallocated
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-500">
                      {formatMMK(unallocatedOpening)}
                    </TableCell>
                    <TableCell className="tabular-nums text-zinc-500">
                      {formatMMK(unallocatedCurrent)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-zinc-500">
                      {shareBase !== 0
                        ? ((unallocatedCurrent / shareBase) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex rounded-lg bg-zinc-100 p-0.5">
          <PeriodSegment value="month" period={period} onChange={setPeriod} />
          <PeriodSegment value="year" period={period} onChange={setPeriod} />
          <PeriodSegment value="all" period={period} onChange={setPeriod} />
        </div>

        {period === "month" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft />
            </Button>
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
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
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
              className="h-9"
              disabled={isCurrentMonth}
              onClick={goToCurrentPeriod}
            >
              Current
            </Button>
          </div>
        )}

        {period === "year" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
              aria-label="Previous year"
              onClick={() => setYear((y) => y - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-14 text-center text-sm font-medium tabular-nums">
              {year}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9"
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
              className="h-9"
              disabled={isCurrentYear}
              onClick={goToCurrentPeriod}
            >
              Current
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="divide-y divide-zinc-100 border-b border-zinc-100">
          <MetricRow label="Opening" amount={opening} />
          <MetricRow
            label={period === "all" ? "Current" : "Closing"}
            amount={closing}
          />
        </div>
        <div className="divide-y divide-zinc-100 border-b border-zinc-100">
          <MetricRow
            label="Net"
            amount={summary.net}
            tone={netTone}
            hero
          />
          <MetricRow label="Income" amount={summary.income} tone="income" />
          <MetricRow
            label="Expenses"
            amount={summary.expense}
            tone="expense"
          />
        </div>
        <div className="divide-y divide-zinc-100">
          <MetricRow
            label="Transfer in"
            amount={summary.transferIn}
            tone="income"
          />
          <MetricRow
            label="Transfer out"
            amount={summary.transferOut}
            tone="expense"
          />
        </div>
      </div>

      <AccountTrendsChart
        account={account}
        transactions={transactions}
        monthSummaries={monthSummaries}
        period={period}
        year={year}
        month={month}
        periodLabel={bounds.label}
      />

      <Card>
        <CardHeader className="space-y-1 py-3">
          <CardTitle className="text-base">Transaction history</CardTitle>
          <CardDescription className="text-xs">
            Transactions for {bounds.label} on this account.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {txLoading && transactions.length === 0 ? (
            <LoadingState variant="inline" />
          ) : transactions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              No transactions for {bounds.label}.
            </p>
          ) : (
            <>
              <ResponsiveSwitch
                mobile={
                  <div className="divide-y divide-zinc-100">
                {transactions.map((tx) => (
                  <Link
                    key={tx.id}
                    href={`/transactions/${tx.id}`}
                    className="block space-y-2 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950">
                          {businessMap[tx.businessId] || "—"}
                        </p>
                        <p className="truncate text-xs text-zinc-500">
                          {formatDate(tx.date)} ·{" "}
                          {CATEGORY_LABELS[tx.category] || tx.category}
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
                      <span className="text-xs text-zinc-500">
                        {tx.direction === "income" ? "In" : "Out"}
                        {tx.displayId ? ` · ${tx.displayId}` : ""}
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
                    <p className="text-xs text-zinc-500">
                      Balance:{" "}
                      {runningById.get(tx.id) == null
                        ? "—"
                        : formatMMK(runningById.get(tx.id)!)}
                    </p>
                  </Link>
                ))}
                  </div>
                }
                desktop={
                  <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx, index) => (
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
                        <TableCell>
                          {CATEGORY_LABELS[tx.category] || tx.category}
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
                        <TableCell className="tabular-nums">
                          {runningById.get(tx.id) == null
                            ? "—"
                            : formatMMK(runningById.get(tx.id)!)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={tx.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="xs">
                            <Link href={`/transactions/${tx.id}`}>View</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                  </div>
                }
              />
              {hasMore && (
                <div className="flex justify-center border-t border-zinc-100 p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={txLoading}
                    onClick={() => void loadTransactions(true, cursor)}
                  >
                    {txLoading ? "Loading…" : "Load more"}
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
