"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { DatePicker } from "@/components/date-picker";
import { LoadingState } from "@/components/loading-state";
import { StatusIcon } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TransferAmount } from "@/components/transfer-route";
import {
  approveTransaction,
  listAccounts,
  listBusinesses,
  listTransactions,
  rejectTransaction,
} from "@/lib/firebase/firestore";
import {
  getPeriodBounds,
  type PeriodKind,
} from "@/lib/account-period";
import {
  canApproveOrReject,
  canViewApprovals,
  isAdmin,
  isApprover,
  userDisplayName,
} from "@/lib/permissions";
import type {
  Account,
  Business,
  Transaction,
  TransactionDirection,
} from "@/lib/types";
import {
  cn,
  formatDate,
  formatDateDots,
  formatMMK,
  formatAccountLabel,
  formatTime,
  formatTimeCompact,
} from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { useMinWidth } from "@/lib/use-min-width";

/** One row per pending item; transfer pairs collapse to the out (expense) leg. */
function collapsePendingQueue(items: Transaction[]): Transaction[] {
  const seenGroups = new Set<string>();
  const out: Transaction[] = [];
  for (const tx of items) {
    if (tx.transferGroupId) {
      if (seenGroups.has(tx.transferGroupId)) continue;
      seenGroups.add(tx.transferGroupId);
      const pair = items.filter(
        (t) => t.transferGroupId === tx.transferGroupId
      );
      const primary =
        pair.find((t) => t.direction === "expense") || pair[0] || tx;
      out.push(primary);
    } else {
      out.push(tx);
    }
  }
  return out;
}

function transferPair(
  tx: Transaction,
  all: Transaction[]
): { out?: Transaction; inLeg?: Transaction; legs: Transaction[] } {
  if (!tx.transferGroupId) {
    return { legs: [tx] };
  }
  const pair = all.filter((t) => t.transferGroupId === tx.transferGroupId);
  const out = pair.find((t) => t.direction === "expense");
  const inLeg = pair.find((t) => t.direction === "income");
  const ordered = [out, inLeg].filter((t): t is Transaction => Boolean(t));
  return {
    out,
    inLeg,
    legs: ordered.length > 0 ? ordered : pair,
  };
}

type AppliedFilters = {
  direction: string;
  businessId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
};

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
          <span className={cn("min-w-0 truncate", !muted && "font-medium")}>
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
      <AccountWithDetails name={fromName} details={fromDetails} compact />
    );
  }
  const fromActive = !highlight || highlight === "from";
  const toActive = !highlight || highlight === "to";
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

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();

  const [items, setItems] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<Transaction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedTransfers, setExpandedTransfers] = useState<Set<string>>(
    () => new Set()
  );

  const [period, setPeriod] = useState<PeriodKind>("day");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [day, setDay] = useState(currentDay);
  const [direction, setDirection] = useState("all");
  const [businessId, setBusinessId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    direction: "all",
    businessId: "all",
    accountId: "all",
    ...datesFromPeriod("day", currentYear, currentMonth, currentDay),
  }));

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

  const queue = useMemo(() => collapsePendingQueue(items), [items]);
  const { matches: isDesktop, ready: layoutReady } = useMinWidth(768);

  function toggleTransferExpanded(groupId: string) {
    setExpandedTransfers((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const loadMaster = useCallback(async () => {
    try {
      const [biz, acc] = await Promise.all([
        listBusinesses(),
        listAccounts(),
      ]);
      setBusinesses(biz);
      setAccounts(acc);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load approvals");
    }
  }, []);

  useLoadOnMount(loadMaster);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const typeIsTransfers = applied.direction === "transfer";
      const businessIsSpecific = applied.businessId !== "all";
      const accountIsSpecific = applied.accountId !== "all";
      const transferOnly = typeIsTransfers;
      const txsPage = await listTransactions({
        status: "pending",
        direction:
          applied.direction === "all" || typeIsTransfers
            ? undefined
            : (applied.direction as TransactionDirection),
        transferOnly: transferOnly || undefined,
        businessId: businessIsSpecific ? applied.businessId : undefined,
        accountId: accountIsSpecific ? applied.accountId : undefined,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
        pageSize: 100,
      });
      const excludeTransfers =
        businessIsSpecific ||
        accountIsSpecific ||
        applied.direction === "income" ||
        applied.direction === "expense";
      const nextItems = excludeTransfers
        ? txsPage.items.filter((tx) => !tx.transferGroupId)
        : txsPage.items;
      setItems(nextItems);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const maxDay = new Date(year, month, 0).getDate();
    if (day > maxDay) setDay(maxDay);
  }, [year, month, day]);

  useEffect(() => {
    const dates = datesFromPeriod(period, year, month, day);
    setApplied((prev) => {
      if (prev.dateFrom === dates.dateFrom && prev.dateTo === dates.dateTo) {
        return prev;
      }
      return { ...prev, ...dates };
    });
  }, [period, year, month, day]);

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

  const hasActiveFilters =
    direction !== "all" ||
    businessId !== "all" ||
    accountId !== "all" ||
    period !== "day" ||
    !isCurrentDay;

  function clearFilters() {
    setDirection("all");
    setBusinessId("all");
    setAccountId("all");
    setPeriod("day");
    setYear(currentYear);
    setMonth(currentMonth);
    setDay(currentDay);
    setApplied({
      direction: "all",
      businessId: "all",
      accountId: "all",
      ...datesFromPeriod("day", currentYear, currentMonth, currentDay),
    });
  }

  function setFilterField(
    field: "direction" | "businessId" | "accountId",
    value: string
  ) {
    if (field === "direction") setDirection(value);
    if (field === "businessId") setBusinessId(value);
    if (field === "accountId") setAccountId(value);
    setApplied((prev) => ({
      ...prev,
      [field]: value,
      ...datesFromPeriod(period, year, month, day),
    }));
  }

  if (!canViewApprovals(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff access required</CardTitle>
          <CardDescription>
            Only Admins, Checkers, and Approvers can view the pending approvals
            queue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canActOnQueue = isApprover(profile) || isAdmin(profile);

  async function onApprove(tx: Transaction) {
    if (!profile || !canApproveOrReject(profile, tx)) {
      toast.error("You cannot approve this record");
      return;
    }
    const isTransfer = Boolean(tx.transferGroupId);
    const ok = await confirm({
      title: isTransfer ? "Approve this transfer?" : "Approve this transaction?",
      description: isTransfer
        ? "Both linked legs will be approved and both account balances updated."
        : "This will mark the record as approved and update the account balance.",
      confirmLabel: "Approve",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await approveTransaction(tx.id, profile.id, userDisplayName(profile));
      toast.success(isTransfer ? "Transfer approved" : "Approved");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not approve"
      );
    } finally {
      setBusy(false);
    }
  }

  async function onReject(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !rejecting) return;
    if (!canApproveOrReject(profile, rejecting)) {
      toast.error("You cannot reject this record");
      return;
    }
    if (!reason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setBusy(true);
    try {
      await rejectTransaction(
        rejecting.id,
        profile.id,
        userDisplayName(profile),
        reason
      );
      toast.success(
        rejecting.transferGroupId ? "Transfer rejected" : "Rejected"
      );
      setRejecting(null);
      setReason("");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Could not reject");
    } finally {
      setBusy(false);
    }
  }

  const actionable = queue.filter((tx) => canApproveOrReject(profile, tx));
  const ownPending = queue.filter((tx) => tx.makerId === profile?.id);

  function renderActions(tx: Transaction) {
    const canAct = canApproveOrReject(profile, tx);
    if (!canAct) {
      return <span className="text-xs text-zinc-400">View only</span>;
    }
    return (
      <div
        className="flex flex-wrap items-center justify-end gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Button size="xs" disabled={busy} onClick={() => onApprove(tx)}>
          Approve
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          disabled={busy}
          onClick={() => {
            setRejecting(tx);
            setReason("");
          }}
        >
          Reject
        </Button>
      </div>
    );
  }

  function renderMobileActions(tx: Transaction) {
    const canAct = canApproveOrReject(profile, tx);
    if (!canAct) {
      return (
        <p className="px-4 pb-3 text-center text-xs text-zinc-400">View only</p>
      );
    }
    return (
      <div className="space-y-2 px-4 pb-3">
        <Button
          size="sm"
          className="w-full"
          disabled={busy}
          onClick={() => onApprove(tx)}
        >
          Approve
        </Button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setRejecting(tx);
            setReason("");
          }}
          className="w-full py-1 text-center text-xs text-rose-600 underline-offset-2 hover:text-rose-700 hover:underline disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Approval center
        </h1>
        <p className="text-sm text-zinc-500">
          {canActOnQueue
            ? "Review pending financial records. Transfers appear as a single item."
            : "View the pending queue. Only Approvers and Admins can approve or reject records."}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white px-3 py-2.5 sm:px-4">
        <p className="text-sm text-zinc-700">
          <span className="font-semibold tabular-nums">{queue.length}</span>{" "}
          pending
          {canActOnQueue ? (
            <>
              {" · "}
              <span className="font-semibold tabular-nums">
                {actionable.length}
              </span>{" "}
              you can act on
            </>
          ) : null}
          {" · "}
          <span className="font-semibold tabular-nums">
            {ownPending.length}
          </span>{" "}
          created by you
        </p>
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
                : businesses.find((b) => b.id === businessId)?.name ||
                  "Business"
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
          value={direction}
          onValueChange={(v) => setFilterField("direction", v)}
        >
          <SelectTrigger
            aria-label="Type"
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:ml-auto sm:w-[11rem] sm:text-sm [&>span]:truncate"
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
          ) : queue.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              {hasActiveFilters
                ? "No pending transactions match filters."
                : "No pending transactions."}
            </p>
          ) : !layoutReady ? (
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((tx, index) => {
                  const isTransfer = Boolean(tx.transferGroupId);
                  const { out, inLeg, legs } = transferPair(tx, items);
                  const isOwn = tx.makerId === profile?.id;
                  const groupId = tx.transferGroupId;
                  const expanded = Boolean(
                    groupId && expandedTransfers.has(groupId)
                  );
                  const canExpand = isTransfer && legs.length > 1;

                  if (!isTransfer) {
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
                          {isOwn ? (
                            <span className="mt-0.5 block text-xs text-zinc-400">
                              Own record
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {renderActions(tx)}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <Fragment key={tx.id}>
                      <TableRow
                        className={cn(
                          "cursor-pointer",
                          expanded
                            ? "border-l-2 border-l-sky-500 bg-sky-50 hover:bg-sky-50/90"
                            : "hover:bg-zinc-50"
                        )}
                        onClick={() =>
                          router.push(`/transactions/${tx.id}`)
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
                                  if (groupId) toggleTransferExpanded(groupId);
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
                            date={tx.date}
                            time={tx.createdAt}
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
                          {tx.description?.trim() || "—"}
                        </TableCell>
                        <TableCell>
                          <TransferAmount
                            amount={tx.amount}
                            showPlaces={false}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusIcon status={tx.status} />
                        </TableCell>
                        <TableCell className="max-w-[9rem] truncate">
                          {tx.makerName || "—"}
                          {isOwn ? (
                            <span className="mt-0.5 block text-xs text-zinc-400">
                              Own record
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right">
                          {renderActions(tx)}
                        </TableCell>
                      </TableRow>
                      {expanded
                        ? legs.map((leg) => {
                            const highlight =
                              leg.direction === "income" ? "to" : "from";
                            return (
                              <TableRow
                                key={`${groupId}:${leg.id}`}
                                className="cursor-pointer border-l-2 border-l-sky-300 bg-sky-100/70 hover:bg-sky-100"
                                onClick={() =>
                                  router.push(`/transactions/${leg.id}`)
                                }
                              >
                                <TableCell className="text-zinc-400">
                                  <div className="flex items-center gap-1 pl-1">
                                    <span className="inline-block w-6" />
                                    <span className="text-xs">↳</span>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-xs">
                                  {leg.displayId}
                                </TableCell>
                                <TableCell>
                                  <DateTimeCell
                                    date={leg.date}
                                    time={leg.createdAt}
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
                                  {leg.direction === "income" ? "In" : "Out"}
                                </TableCell>
                                <TableCell className="max-w-[14rem] truncate text-zinc-500">
                                  {leg.description?.trim() || "—"}
                                </TableCell>
                                <TableCell>
                                  <TransferAmount
                                    amount={leg.amount}
                                    showPlaces={false}
                                    leg={
                                      leg.direction === "income"
                                        ? "in"
                                        : "out"
                                    }
                                  />
                                </TableCell>
                                <TableCell>
                                  <StatusIcon status={leg.status} />
                                </TableCell>
                                <TableCell className="max-w-[9rem] truncate">
                                  {leg.makerName || "—"}
                                </TableCell>
                                <TableCell className="text-right">
                                  <span className="text-xs text-zinc-400">
                                    —
                                  </span>
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
              {queue.map((tx) => {
                const isTransfer = Boolean(tx.transferGroupId);
                const { out, inLeg, legs } = transferPair(tx, items);
                const isOwn = tx.makerId === profile?.id;
                const groupId = tx.transferGroupId;
                const expanded = Boolean(
                  groupId && expandedTransfers.has(groupId)
                );
                const canExpand = isTransfer && legs.length > 1;
                const typeLabel = isTransfer
                  ? "Transfer"
                  : tx.direction === "income"
                    ? "In"
                    : "Out";

                if (!isTransfer) {
                  return (
                    <div key={tx.id} className="space-y-0">
                      <div
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
                              {formatDate(tx.date)} · {typeLabel}
                              {isOwn ? " · Own record" : ""}
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
                      {renderMobileActions(tx)}
                    </div>
                  );
                }

                return (
                  <div
                    key={tx.id}
                    className={cn(
                      expanded && "border-l-2 border-l-sky-500 bg-sky-50"
                    )}
                  >
                    <div
                      role="link"
                      tabIndex={0}
                      className="cursor-pointer space-y-2 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
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
                                if (groupId) toggleTransferExpanded(groupId);
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
                              {formatDate(tx.date)} · Transfer
                              {isOwn ? " · Own record" : ""}
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
                        />
                      </div>
                    </div>
                    {renderMobileActions(tx)}
                    {expanded
                      ? legs.map((leg) => (
                          <div
                            key={`${groupId}:${leg.id}`}
                            role="link"
                            tabIndex={0}
                            className="block cursor-pointer space-y-2 border-t border-sky-100 bg-sky-100/70 px-4 py-3 pl-10 transition-colors hover:bg-sky-100 active:bg-sky-100"
                            onClick={() =>
                              router.push(`/transactions/${leg.id}`)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                router.push(`/transactions/${leg.id}`);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-mono text-xs text-zinc-500">
                                  {leg.displayId} ·{" "}
                                  {leg.direction === "income" ? "In" : "Out"}
                                </p>
                                <div className="mt-0.5">
                                  <AccountWithDetails
                                    name={accountNameMap[leg.accountId]}
                                    details={accountDetailMap[leg.accountId]}
                                  />
                                </div>
                                <p className="truncate text-xs text-zinc-500">
                                  {businessMap[leg.businessId] || "—"}
                                </p>
                              </div>
                              <StatusIcon status={leg.status} />
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate text-xs text-zinc-500">
                                {leg.makerName || "—"}
                              </span>
                              <TransferAmount
                                compact
                                className="text-right"
                                amount={leg.amount}
                                showPlaces={false}
                                leg={
                                  leg.direction === "income" ? "in" : "out"
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
        </CardContent>
      </Card>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <form onSubmit={onReject}>
            <DialogHeader>
              <DialogTitle>
                {rejecting?.transferGroupId
                  ? "Reject transfer"
                  : "Reject transaction"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejecting(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                Confirm reject
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
