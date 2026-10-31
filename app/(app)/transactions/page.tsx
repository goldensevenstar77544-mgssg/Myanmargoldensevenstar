"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Landmark,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { LoadingState } from "@/components/loading-state";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  formatDateDots,
  formatMMK,
  formatAccountLabel,
  formatTime,
  formatTimeCompact,
} from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { useMinWidth } from "@/lib/use-min-width";
import { DatePicker } from "@/components/date-picker";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";
import { TransferAmount } from "@/components/transfer-route";

type AppliedFilters = {
  status: string;
  direction: string;
  businessId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
};

type ListRow =
  | { kind: "single"; tx: Transaction }
  | {
      kind: "transfer";
      groupId: string;
      primary: Transaction;
      out?: Transaction;
      inLeg?: Transaction;
      legs: Transaction[];
    };

function buildListRows(items: Transaction[]): ListRow[] {
  const seenGroups = new Set<string>();
  const rows: ListRow[] = [];
  for (const tx of items) {
    if (!tx.transferGroupId) {
      rows.push({ kind: "single", tx });
      continue;
    }
    if (seenGroups.has(tx.transferGroupId)) continue;
    seenGroups.add(tx.transferGroupId);
    const legs = items.filter((t) => t.transferGroupId === tx.transferGroupId);
    const out = legs.find((t) => t.direction === "expense");
    const inLeg = legs.find((t) => t.direction === "income");
    const ordered = [out, inLeg].filter((t): t is Transaction => Boolean(t));
    rows.push({
      kind: "transfer",
      groupId: tx.transferGroupId,
      primary: out || inLeg || tx,
      out,
      inLeg,
      legs: ordered.length > 0 ? ordered : legs,
    });
  }
  return rows;
}

function accountNameLabel(account: Account): string {
  if (account.type === "cash") return account.name;
  return account.bankName?.trim() || account.name;
}

function accountDetailLines(account: Account): string[] {
  if (account.type === "cash") return ["Cash in hand"];
  return [account.accountNumber, account.bankBranch]
    .map((v) => v?.trim())
    .filter((v): v is string => Boolean(v));
}

function DateTimeCell({
  date,
  time,
}: {
  date: Date | string | { toDate: () => Date };
  time: Date | string | { toDate: () => Date };
}) {
  return (
    <div className="space-y-0.5 leading-snug">
      <p className="text-sm font-semibold tabular-nums text-zinc-950">
        {formatTimeCompact(time)}
      </p>
      <p className="text-xs tabular-nums text-zinc-500">
        {formatDateDots(date)}
      </p>
    </div>
  );
}

function AccountWithDetails({
  name,
  details,
  muted,
  compact,
  className,
}: {
  name?: string;
  details?: string[];
  muted?: boolean;
  compact?: boolean;
  className?: string;
}) {
  const label = name?.trim() || "—";
  const lines = details?.filter(Boolean) ?? [];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account details: ${label}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-zinc-100",
            compact ? "text-xs" : "text-sm",
            muted ? "text-zinc-400 hover:bg-zinc-100/70" : "text-zinc-950",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className={cn(
              "min-w-0 truncate",
              !muted && "font-medium"
            )}
          >
            {label}
          </span>
          <Info
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              muted ? "text-zinc-400" : "text-zinc-500"
            )}
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-56 px-3 py-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Landmark
              className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Account
              </p>
              <p className="truncate text-sm font-semibold text-zinc-950">
                {label}
              </p>
            </div>
          </div>
          {lines.length > 0 ? (
            <div className="space-y-1 border-t border-zinc-100 pt-2">
              {lines.map((line, index) => (
                <p
                  key={`${index}-${line}`}
                  className="truncate text-xs text-zinc-600"
                >
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="border-t border-zinc-100 pt-2 text-xs text-zinc-500">
              No further details
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StackedFromTo({
  from,
  to,
  transfer,
  highlight,
}: {
  from?: string;
  to?: string;
  transfer: boolean;
  /** Emphasize the active transfer leg (from for out, to for in). */
  highlight?: "from" | "to";
}) {
  if (!transfer) {
    return <span className="block max-w-[12rem] truncate">{from || "—"}</span>;
  }
  const fromActive = highlight === "from";
  const toActive = highlight === "to";
  return (
    <div className="space-y-0.5 text-xs leading-snug">
      <p
        className={cn(
          "max-w-[12rem] truncate",
          fromActive ? "font-medium text-zinc-950" : "text-zinc-400"
        )}
      >
        <span
          className={cn(
            "font-medium",
            fromActive ? "text-zinc-600" : "text-zinc-400"
          )}
        >
          From{" "}
        </span>
        {from || "—"}
      </p>
      <p
        className={cn(
          "max-w-[12rem] truncate",
          toActive ? "font-medium text-zinc-950" : "text-zinc-400"
        )}
      >
        <span
          className={cn(
            "font-medium",
            toActive ? "text-zinc-600" : "text-zinc-400"
          )}
        >
          To{" "}
        </span>
        {to || "—"}
      </p>
    </div>
  );
}

function StackedAccounts({
  fromName,
  fromDetails,
  toName,
  toDetails,
  transfer,
  highlight,
}: {
  fromName?: string;
  fromDetails?: string[];
  toName?: string;
  toDetails?: string[];
  transfer: boolean;
  highlight?: "from" | "to";
}) {
  if (!transfer) {
    return (
      <AccountWithDetails
        name={fromName}
        details={fromDetails}
        compact
      />
    );
  }
  const fromActive = !highlight || highlight === "from";
  const toActive = !highlight || highlight === "to";
  // When highlight is set, mute the inactive leg; when unset (group summary), both active.
  const fromMuted = Boolean(highlight) && !fromActive;
  const toMuted = Boolean(highlight) && !toActive;
  return (
    <div className="space-y-1 text-xs leading-snug">
      <div className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "shrink-0 font-medium",
            fromMuted ? "text-zinc-400" : "text-zinc-600"
          )}
        >
          From
        </span>
        <AccountWithDetails
          compact
          muted={fromMuted}
          name={fromName}
          details={fromDetails}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "shrink-0 font-medium",
            toMuted ? "text-zinc-400" : "text-zinc-600"
          )}
        >
          To
        </span>
        <AccountWithDetails
          compact
          muted={toMuted}
          name={toName}
          details={toDetails}
        />
      </div>
    </div>
  );
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
  month: number,
  day = 1
): Pick<AppliedFilters, "dateFrom" | "dateTo"> {
  const bounds = getPeriodBounds(period, year, month, day);
  return {
    dateFrom: bounds.start ?? "",
    dateTo: bounds.end ?? "",
  };
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
  const currentDay = now.getDate();

  const [items, setItems] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [period, setPeriod] = useState<PeriodKind>("day");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [day, setDay] = useState(currentDay);

  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [businessId, setBusinessId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    status: "all",
    direction: "all",
    businessId: "all",
    accountId: "all",
    ...datesFromPeriod("day", currentYear, currentMonth, currentDay),
  }));
  const [summary, setSummary] = useState<TransactionsSummary>(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [expandedTransfers, setExpandedTransfers] = useState<Set<string>>(
    () => new Set()
  );

  const businessMap = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );
  const accountNameMap = useMemo(
    () =>
      Object.fromEntries(accounts.map((a) => [a.id, accountNameLabel(a)])),
    [accounts]
  );
  const accountDetailMap = useMemo(
    () =>
      Object.fromEntries(accounts.map((a) => [a.id, accountDetailLines(a)])),
    [accounts]
  );

  const listRows = useMemo(() => buildListRows(items), [items]);
  const { matches: isDesktop, ready: layoutReady } = useMinWidth(768);

  function toggleTransferExpanded(groupId: string) {
    setExpandedTransfers((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

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

  const canGoNextDay =
    year < currentYear ||
    (year === currentYear && month < currentMonth) ||
    (year === currentYear && month === currentMonth && day < currentDay);
  const canGoNextMonth =
    year < currentYear || (year === currentYear && month < currentMonth);
  const canGoNextYear = year < currentYear;
  const isCurrentDay =
    year === currentYear && month === currentMonth && day === currentDay;
  const isCurrentMonth = year === currentYear && month === currentMonth;
  const isCurrentYear = year === currentYear;

  function shiftDay(delta: number) {
    const date = new Date(year, month - 1, day + delta);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
    setDay(date.getDate());
  }

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
    setDay(1);
  }

  function goToCurrentPeriod() {
    setYear(currentYear);
    setMonth(currentMonth);
    setDay(currentDay);
  }

  function setSelectedDay(dateKey: string) {
    const [y, m, d] = dateKey.split("-").map(Number);
    if (!y || !m || !d) return;
    setYear(y);
    setMonth(m);
    setDay(d);
  }

  // Keep day within the selected month (e.g. 31 → 28 in February).
  useEffect(() => {
    const maxDay = new Date(year, month, 0).getDate();
    if (day > maxDay) setDay(maxDay);
  }, [year, month, day]);

  // Period controls apply immediately (like business detail).
  useEffect(() => {
    const dates = datesFromPeriod(period, year, month, day);
    setApplied((prev) => {
      if (prev.dateFrom === dates.dateFrom && prev.dateTo === dates.dateTo) {
        return prev;
      }
      return { ...prev, ...dates };
    });
  }, [period, year, month, day]);

  const hasActiveFilters =
    status !== "all" ||
    direction !== "all" ||
    businessId !== "all" ||
    accountId !== "all" ||
    period !== "day" ||
    !isCurrentDay;

  function clearFilters() {
    setStatus("all");
    setDirection("all");
    setBusinessId("all");
    setAccountId("all");
    setPeriod("day");
    setYear(currentYear);
    setMonth(currentMonth);
    setDay(currentDay);
    setApplied({
      status: "all",
      direction: "all",
      businessId: "all",
      accountId: "all",
      ...datesFromPeriod("day", currentYear, currentMonth, currentDay),
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
      ...datesFromPeriod(period, year, month, day),
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
          <PeriodSegment value="day" period={period} onChange={setPeriod} />
          <PeriodSegment value="month" period={period} onChange={setPeriod} />
          <PeriodSegment value="year" period={period} onChange={setPeriod} />
          <PeriodSegment value="all" period={period} onChange={setPeriod} />
        </div>

        {period === "day" && (
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Previous day"
              onClick={() => shiftDay(-1)}
            >
              <ChevronLeft />
            </Button>
            <DatePicker
              value={toDateKey(year, month, day)}
              onChange={setSelectedDay}
              toYear={currentYear}
              className="h-9 min-w-0 flex-1 px-2.5 text-xs sm:w-[11rem] sm:flex-none sm:text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              aria-label="Next day"
              disabled={!canGoNextDay}
              onClick={() => shiftDay(1)}
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0"
              disabled={isCurrentDay}
              onClick={goToCurrentPeriod}
            >
              Today
            </Button>
          </div>
        )}

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
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[11rem] sm:text-sm [&>span]:truncate"
          >
            <SelectValue placeholder="Business" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All businesses</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id} title={b.name}>
                <span className="block truncate">{b.name}</span>
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
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[14rem] sm:text-sm [&>span]:truncate"
          >
            <SelectValue placeholder="Account">
              {accountId === "all"
                ? "All accounts"
                : (() => {
                    const account = accounts.find((a) => a.id === accountId);
                    return account ? accountNameLabel(account) : "Account";
                  })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-w-[min(22rem,calc(100vw-1.5rem))]">
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => {
              const fullLabel = formatAccountLabel(a);
              const details = accountDetailLines(a);
              return (
                <SelectItem
                  key={a.id}
                  value={a.id}
                  title={fullLabel}
                  className="items-start py-2"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {accountNameLabel(a)}
                    </span>
                    {details.length > 0 ? (
                      <span className="truncate text-xs text-zinc-500">
                        {details.join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => setFilterField("status", v)}
        >
          <SelectTrigger
            aria-label="Status"
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[9rem] sm:text-sm [&>span]:truncate"
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
                      <TableHead>Business</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Maker</TableHead>
                      <TableHead>Approver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {listRows.map((row, index) => {
                      if (row.kind === "single") {
                        const tx = row.tx;
                        return (
                          <TableRow
                            key={tx.id}
                            className="cursor-pointer"
                            onClick={() =>
                              router.push(`/transactions/${tx.id}`)
                            }
                          >
                            <TableCell className="tabular-nums text-zinc-500">
                              {index + 1}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {tx.displayId}
                            </TableCell>
                            <TableCell>
                              <DateTimeCell
                                date={tx.date}
                                time={tx.createdAt}
                              />
                            </TableCell>
                            <TableCell>
                              <StackedFromTo
                                transfer={false}
                                from={businessMap[tx.businessId]}
                              />
                            </TableCell>
                            <TableCell>
                              <StackedAccounts
                                transfer={false}
                                fromName={accountNameMap[tx.accountId]}
                                fromDetails={accountDetailMap[tx.accountId]}
                              />
                            </TableCell>
                            <TableCell>
                              {tx.direction === "income" ? "In" : "Out"}
                            </TableCell>
                            <TableCell className="max-w-[14rem] truncate text-zinc-500">
                              {tx.description?.trim() || "—"}
                            </TableCell>
                            <TableCell>
                              <span
                                className={
                                  tx.direction === "income"
                                    ? "font-medium text-emerald-700"
                                    : "font-medium text-rose-700"
                                }
                              >
                                {tx.direction === "income" ? "+" : "−"}
                                {formatMMK(tx.amount)}
                              </span>
                            </TableCell>
                            <TableCell>
                              <StatusIcon status={tx.status} />
                            </TableCell>
                            <TableCell className="max-w-[9rem] truncate">
                              {tx.makerName || "—"}
                            </TableCell>
                            <TableCell className="max-w-[9rem] truncate">
                              {transactionApproverName(tx) || "—"}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      const { groupId, primary, out, inLeg, legs } = row;
                      const expanded = expandedTransfers.has(groupId);
                      const canExpand = legs.length > 1;
                      return (
                        <Fragment key={groupId}>
                          <TableRow
                            className={cn(
                              "cursor-pointer",
                              expanded
                                ? "border-l-2 border-l-sky-500 bg-sky-50 hover:bg-sky-50/90"
                                : "hover:bg-zinc-50"
                            )}
                            onClick={() =>
                              router.push(`/transactions/${primary.id}`)
                            }
                          >
                            <TableCell className="tabular-nums text-zinc-500">
                              <div className="flex items-center gap-1">
                                {canExpand ? (
                                  <button
                                    type="button"
                                    aria-expanded={expanded}
                                    aria-label={
                                      expanded
                                        ? "Collapse transfer legs"
                                        : "Expand transfer legs"
                                    }
                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleTransferExpanded(groupId);
                                    }}
                                  >
                                    <ChevronDown
                                      className={cn(
                                        "h-4 w-4 transition-transform",
                                        expanded ? "rotate-0" : "-rotate-90"
                                      )}
                                    />
                                  </button>
                                ) : (
                                  <span className="inline-block w-6" />
                                )}
                                <span>{index + 1}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              <div className="space-y-0.5">
                                {legs.map((leg) => (
                                  <p key={leg.id} className="truncate">
                                    {leg.displayId}
                                  </p>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <DateTimeCell
                                date={primary.date}
                                time={primary.createdAt}
                              />
                            </TableCell>
                            <TableCell>
                              <StackedFromTo
                                transfer
                                from={
                                  out?.businessId
                                    ? businessMap[out.businessId]
                                    : undefined
                                }
                                to={
                                  inLeg?.businessId
                                    ? businessMap[inLeg.businessId]
                                    : undefined
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <StackedAccounts
                                transfer
                                fromName={
                                  out?.accountId
                                    ? accountNameMap[out.accountId]
                                    : undefined
                                }
                                fromDetails={
                                  out?.accountId
                                    ? accountDetailMap[out.accountId]
                                    : undefined
                                }
                                toName={
                                  inLeg?.accountId
                                    ? accountNameMap[inLeg.accountId]
                                    : undefined
                                }
                                toDetails={
                                  inLeg?.accountId
                                    ? accountDetailMap[inLeg.accountId]
                                    : undefined
                                }
                              />
                            </TableCell>
                            <TableCell>Transfer</TableCell>
                            <TableCell className="max-w-[14rem] truncate text-zinc-500">
                              {primary.description?.trim() || "—"}
                            </TableCell>
                            <TableCell>
                              <TransferAmount
                                amount={primary.amount}
                                showPlaces={false}
                              />
                            </TableCell>
                            <TableCell>
                              <StatusIcon status={primary.status} />
                            </TableCell>
                            <TableCell className="max-w-[9rem] truncate">
                              {primary.makerName || "—"}
                            </TableCell>
                            <TableCell className="max-w-[9rem] truncate">
                              {transactionApproverName(primary) || "—"}
                            </TableCell>
                          </TableRow>
                          {expanded
                            ? legs.map((tx) => {
                                const highlight =
                                  tx.direction === "income" ? "to" : "from";
                                return (
                                  <TableRow
                                    key={`${groupId}:${tx.id}`}
                                    className="cursor-pointer border-l-2 border-l-sky-300 bg-sky-100/70 hover:bg-sky-100"
                                    onClick={() =>
                                      router.push(`/transactions/${tx.id}`)
                                    }
                                  >
                                    <TableCell className="text-zinc-400">
                                      <div className="flex items-center gap-1 pl-1">
                                        <span className="inline-block w-6" />
                                        <span className="text-xs">↳</span>
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">
                                      {tx.displayId}
                                    </TableCell>
                                    <TableCell>
                                      <DateTimeCell
                                        date={tx.date}
                                        time={tx.createdAt}
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <StackedFromTo
                                        transfer
                                        highlight={highlight}
                                        from={
                                          out?.businessId
                                            ? businessMap[out.businessId]
                                            : undefined
                                        }
                                        to={
                                          inLeg?.businessId
                                            ? businessMap[inLeg.businessId]
                                            : undefined
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <StackedAccounts
                                        transfer
                                        highlight={highlight}
                                        fromName={
                                          out?.accountId
                                            ? accountNameMap[out.accountId]
                                            : undefined
                                        }
                                        fromDetails={
                                          out?.accountId
                                            ? accountDetailMap[out.accountId]
                                            : undefined
                                        }
                                        toName={
                                          inLeg?.accountId
                                            ? accountNameMap[inLeg.accountId]
                                            : undefined
                                        }
                                        toDetails={
                                          inLeg?.accountId
                                            ? accountDetailMap[inLeg.accountId]
                                            : undefined
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      {tx.direction === "income"
                                        ? "In"
                                        : "Out"}
                                    </TableCell>
                                    <TableCell className="max-w-[14rem] truncate text-zinc-500">
                                      {tx.description?.trim() || "—"}
                                    </TableCell>
                                    <TableCell>
                                      <TransferAmount
                                        amount={tx.amount}
                                        showPlaces={false}
                                        leg={
                                          tx.direction === "income"
                                            ? "in"
                                            : "out"
                                        }
                                      />
                                    </TableCell>
                                    <TableCell>
                                      <StatusIcon status={tx.status} />
                                    </TableCell>
                                    <TableCell className="max-w-[9rem] truncate">
                                      {tx.makerName || "—"}
                                    </TableCell>
                                    <TableCell className="max-w-[9rem] truncate">
                                      {transactionApproverName(tx) || "—"}
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {listRows.map((row) => {
                    if (row.kind === "single") {
                      const tx = row.tx;
                      return (
                        <div
                          key={tx.id}
                          role="link"
                          tabIndex={0}
                          className="block cursor-pointer space-y-2 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                          onClick={() =>
                            router.push(`/transactions/${tx.id}`)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(`/transactions/${tx.id}`);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-xs text-zinc-500">
                                {tx.displayId}
                              </p>
                              <div className="mt-0.5">
                                <AccountWithDetails
                                  name={accountNameMap[tx.accountId]}
                                  details={accountDetailMap[tx.accountId]}
                                />
                              </div>
                              <p className="truncate text-xs text-zinc-500">
                                {businessMap[tx.businessId] || "—"}
                              </p>
                              <p className="truncate text-xs text-zinc-500">
                                {formatDate(tx.date)} ·{" "}
                                {tx.direction === "income" ? "In" : "Out"}
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
                            <StatusIcon status={tx.status} />
                          </div>
                          <div className="flex items-start justify-between gap-2">
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
                        </div>
                      );
                    }

                    const { groupId, primary, out, inLeg, legs } = row;
                    const expanded = expandedTransfers.has(groupId);
                    const canExpand = legs.length > 1;
                    return (
                      <div
                        key={groupId}
                        className={cn(
                          expanded &&
                            "border-l-2 border-l-sky-500 bg-sky-50"
                        )}
                      >
                        <div
                          role="link"
                          tabIndex={0}
                          className="cursor-pointer space-y-2 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                          onClick={() =>
                            router.push(`/transactions/${primary.id}`)
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(`/transactions/${primary.id}`);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-1.5">
                              {canExpand ? (
                                <button
                                  type="button"
                                  aria-expanded={expanded}
                                  aria-label={
                                    expanded
                                      ? "Collapse transfer legs"
                                      : "Expand transfer legs"
                                  }
                                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleTransferExpanded(groupId);
                                  }}
                                >
                                  <ChevronDown
                                    className={cn(
                                      "h-4 w-4 transition-transform",
                                      expanded ? "rotate-0" : "-rotate-90"
                                    )}
                                  />
                                </button>
                              ) : null}
                              <div className="min-w-0 flex-1 text-left">
                                <p className="truncate font-mono text-xs text-zinc-500">
                                  {legs.map((leg) => leg.displayId).join(" · ")}
                                </p>
                                <div className="mt-0.5 space-y-1.5 text-xs leading-snug">
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex min-w-0 items-center gap-1">
                                      <span className="shrink-0 font-medium text-zinc-600">
                                        From
                                      </span>
                                      <AccountWithDetails
                                        compact
                                        name={
                                          out?.accountId
                                            ? accountNameMap[out.accountId]
                                            : undefined
                                        }
                                        details={
                                          out?.accountId
                                            ? accountDetailMap[out.accountId]
                                            : undefined
                                        }
                                      />
                                    </div>
                                    <p className="truncate text-zinc-500">
                                      {(out?.businessId &&
                                        businessMap[out.businessId]) ||
                                        "—"}
                                    </p>
                                  </div>
                                  <div className="min-w-0 space-y-0.5">
                                    <div className="flex min-w-0 items-center gap-1">
                                      <span className="shrink-0 font-medium text-zinc-600">
                                        To
                                      </span>
                                      <AccountWithDetails
                                        compact
                                        name={
                                          inLeg?.accountId
                                            ? accountNameMap[inLeg.accountId]
                                            : undefined
                                        }
                                        details={
                                          inLeg?.accountId
                                            ? accountDetailMap[inLeg.accountId]
                                            : undefined
                                        }
                                      />
                                    </div>
                                    <p className="truncate text-zinc-500">
                                      {(inLeg?.businessId &&
                                        businessMap[inLeg.businessId]) ||
                                        "—"}
                                    </p>
                                  </div>
                                </div>
                                <p className="truncate text-xs text-zinc-500">
                                  {formatDate(primary.date)} · Transfer
                                </p>
                                <p className="truncate text-xs text-zinc-500">
                                  {formatTime(primary.createdAt)}
                                </p>
                                {primary.description?.trim() ? (
                                  <p className="truncate text-xs text-zinc-500">
                                    {primary.description.trim()}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <StatusIcon status={primary.status} />
                          </div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="truncate text-xs text-zinc-500">
                              {primary.makerName || "—"}
                            </span>
                            <TransferAmount
                              compact
                              className="text-right"
                              amount={primary.amount}
                              showPlaces={false}
                            />
                          </div>
                        </div>
                        {expanded
                          ? legs.map((tx) => (
                              <div
                                key={`${groupId}:${tx.id}`}
                                role="link"
                                tabIndex={0}
                                className="block cursor-pointer space-y-2 border-t border-sky-100 bg-sky-100/70 px-4 py-3 pl-10 transition-colors hover:bg-sky-100 active:bg-sky-100"
                                onClick={() =>
                                  router.push(`/transactions/${tx.id}`)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    router.push(`/transactions/${tx.id}`);
                                  }
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate font-mono text-xs text-zinc-500">
                                      {tx.displayId} ·{" "}
                                      {tx.direction === "income"
                                        ? "In"
                                        : "Out"}
                                    </p>
                                    <div className="mt-0.5">
                                      <AccountWithDetails
                                        name={accountNameMap[tx.accountId]}
                                        details={
                                          accountDetailMap[tx.accountId]
                                        }
                                      />
                                    </div>
                                    <p className="truncate text-xs text-zinc-500">
                                      {businessMap[tx.businessId] || "—"}
                                    </p>
                                  </div>
                                  <StatusIcon status={tx.status} />
                                </div>
                                <div className="flex items-start justify-between gap-2">
                                  <span className="truncate text-xs text-zinc-500">
                                    {tx.makerName || "—"}
                                  </span>
                                  <TransferAmount
                                    compact
                                    className="text-right"
                                    amount={tx.amount}
                                    showPlaces={false}
                                    leg={
                                      tx.direction === "income" ? "in" : "out"
                                    }
                                  />
                                </div>
                              </div>
                            ))
                          : null}
                      </div>
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
