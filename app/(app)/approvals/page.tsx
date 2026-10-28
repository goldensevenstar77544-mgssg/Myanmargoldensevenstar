"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { ResponsiveSwitch } from "@/components/responsive-switch";
import { StatusBadge } from "@/components/status-badge";
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
import {
  TransferAmount,
  TransferRoute,
} from "@/components/transfer-route";
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
  formatMMK,
  formatAccountLabel,
  formatTime,
} from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";

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
): { out?: Transaction; inLeg?: Transaction } | null {
  if (!tx.transferGroupId) return null;
  const pair = all.filter((t) => t.transferGroupId === tx.transferGroupId);
  return {
    out: pair.find((t) => t.direction === "expense"),
    inLeg: pair.find((t) => t.direction === "income"),
  };
}

type AppliedFilters = {
  direction: string;
  businessId: string;
  accountId: string;
  dateFrom: string;
  dateTo: string;
};

/** Sentinel in business/account filters: show only internal transfers (not a real id). */
const FILTER_TRANSFERS = "__transfers__";

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

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [items, setItems] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<Transaction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [period, setPeriod] = useState<PeriodKind>("all");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [direction, setDirection] = useState("all");
  const [businessId, setBusinessId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [applied, setApplied] = useState<AppliedFilters>(() => ({
    direction: "all",
    businessId: "all",
    accountId: "all",
    ...datesFromPeriod("all", currentYear, currentMonth),
  }));

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
  const shortAccountMap = useMemo(
    () =>
      Object.fromEntries(
        accounts.map((a) => [
          a.id,
          a.type === "cash"
            ? a.name
            : a.bankName?.trim() || a.name,
        ])
      ),
    [accounts]
  );

  const queue = useMemo(() => collapsePendingQueue(items), [items]);

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
      const businessIsTransfers = applied.businessId === FILTER_TRANSFERS;
      const accountIsTransfers = applied.accountId === FILTER_TRANSFERS;
      const typeIsTransfers = applied.direction === "transfer";
      const businessIsSpecific =
        applied.businessId !== "all" && !businessIsTransfers;
      const accountIsSpecific =
        applied.accountId !== "all" && !accountIsTransfers;
      const transferOnly =
        businessIsTransfers || accountIsTransfers || typeIsTransfers;
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
      // In/Out and a selected business/account are for non-transfer activity only.
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

  // Period controls apply immediately (like transactions page).
  useEffect(() => {
    const dates = datesFromPeriod(period, year, month);
    setApplied((prev) => {
      if (prev.dateFrom === dates.dateFrom && prev.dateTo === dates.dateTo) {
        return prev;
      }
      return { ...prev, ...dates };
    });
  }, [period, year, month]);

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

  const hasActiveFilters =
    direction !== "all" ||
    businessId !== "all" ||
    accountId !== "all" ||
    period !== "all";

  function clearFilters() {
    setDirection("all");
    setBusinessId("all");
    setAccountId("all");
    setPeriod("all");
    setYear(currentYear);
    setMonth(currentMonth);
    setApplied({
      direction: "all",
      businessId: "all",
      accountId: "all",
      ...datesFromPeriod("all", currentYear, currentMonth),
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
      ...datesFromPeriod(period, year, month),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approval center</h1>
        <p className="text-sm text-zinc-500">
          {canActOnQueue
            ? "Review pending financial records. Transfers appear as a single item."
            : "View the pending queue. Only Approvers and Admins can approve or reject records."}
        </p>
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
                : businessId === FILTER_TRANSFERS
                  ? "Internal transfers"
                  : businesses.find((b) => b.id === businessId)?.name ||
                    "Business"
            }
            className="h-9 min-w-0 w-full px-2.5 text-xs sm:w-[11rem] sm:text-sm"
          >
            <SelectValue placeholder="Business" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All businesses</SelectItem>
            <SelectItem value={FILTER_TRANSFERS}>Internal transfers</SelectItem>
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
                : accountId === FILTER_TRANSFERS
                  ? "Internal transfers"
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
            <SelectItem value={FILTER_TRANSFERS}>Internal transfers</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {formatAccountLabel(a)}
              </SelectItem>
            ))}
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
        <CardHeader>
          <CardTitle>Pending review</CardTitle>
          <CardDescription>
            {queue.length} pending
            {canActOnQueue ? ` · ${actionable.length} you can act on` : ""}
            {" · "}
            {ownPending.length} created by you
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : queue.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              {hasActiveFilters
                ? "No pending transactions match filters."
                : "No pending transactions."}
            </p>
          ) : (
            <>
              <ResponsiveSwitch
                mobile={
                  <div className="divide-y divide-zinc-100">
                    {queue.map((tx) => {
                      const canAct = canApproveOrReject(profile, tx);
                      const isOwn = tx.makerId === profile?.id;
                      const typeLabel = tx.transferGroupId
                        ? "Transfer"
                        : tx.direction === "income"
                          ? "In"
                          : "Out";
                      const pair = transferPair(tx, items);
                      return (
                        <div key={tx.id} className="space-y-2">
                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/transactions/${tx.id}`)
                            }
                            className="block w-full space-y-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 active:bg-zinc-100"
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
                                        pair?.out?.businessId
                                          ? businessMap[pair.out.businessId]
                                          : undefined
                                      }
                                      fromAccount={
                                        pair?.out?.accountId
                                          ? accountMap[pair.out.accountId]
                                          : undefined
                                      }
                                      toBusiness={
                                        pair?.inLeg?.businessId
                                          ? businessMap[pair.inLeg.businessId]
                                          : undefined
                                      }
                                      toAccount={
                                        pair?.inLeg?.accountId
                                          ? accountMap[pair.inLeg.accountId]
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
                              <StatusBadge status={tx.status} />
                            </div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="truncate text-xs text-zinc-500">
                                {tx.makerName || "—"}
                              </span>
                              {tx.transferGroupId ? (
                                <TransferAmount
                                  compact
                                  className="text-right"
                                  amount={tx.amount}
                                  fromBusiness={
                                    pair?.out?.businessId
                                      ? businessMap[pair.out.businessId]
                                      : undefined
                                  }
                                  fromAccount={
                                    pair?.out?.accountId
                                      ? shortAccountMap[pair.out.accountId]
                                      : undefined
                                  }
                                  toBusiness={
                                    pair?.inLeg?.businessId
                                      ? businessMap[pair.inLeg.businessId]
                                      : undefined
                                  }
                                  toAccount={
                                    pair?.inLeg?.accountId
                                      ? shortAccountMap[pair.inLeg.accountId]
                                      : undefined
                                  }
                                />
                              ) : (
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
                              )}
                            </div>
                          </button>
                          {canAct ? (
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
                          ) : (
                            <p className="px-4 pb-3 text-center text-xs text-zinc-400">
                              View only
                            </p>
                          )}
                        </div>
                      );
                    })}
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
                          <TableHead>From / To</TableHead>
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
                          const canAct = canApproveOrReject(profile, tx);
                          const isOwn = tx.makerId === profile?.id;
                          const pair = transferPair(tx, items);
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
                                      pair?.out?.businessId
                                        ? businessMap[pair.out.businessId]
                                        : undefined
                                    }
                                    fromAccount={
                                      pair?.out?.accountId
                                        ? accountMap[pair.out.accountId]
                                        : undefined
                                    }
                                    toBusiness={
                                      pair?.inLeg?.businessId
                                        ? businessMap[pair.inLeg.businessId]
                                        : undefined
                                    }
                                    toAccount={
                                      pair?.inLeg?.accountId
                                        ? accountMap[pair.inLeg.accountId]
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
                              <TableCell>
                                {tx.transferGroupId ? (
                                  <TransferAmount
                                    amount={tx.amount}
                                    fromBusiness={
                                      pair?.out?.businessId
                                        ? businessMap[pair.out.businessId]
                                        : undefined
                                    }
                                    fromAccount={
                                      pair?.out?.accountId
                                        ? shortAccountMap[pair.out.accountId]
                                        : undefined
                                    }
                                    toBusiness={
                                      pair?.inLeg?.businessId
                                        ? businessMap[pair.inLeg.businessId]
                                        : undefined
                                    }
                                    toAccount={
                                      pair?.inLeg?.accountId
                                        ? shortAccountMap[pair.inLeg.accountId]
                                        : undefined
                                    }
                                  />
                                ) : (
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
                                )}
                              </TableCell>
                              <TableCell>
                                <StatusBadge status={tx.status} />
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
                                {canAct ? (
                                  <div
                                    className="flex flex-wrap items-center justify-end gap-2"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button
                                      size="xs"
                                      disabled={busy}
                                      onClick={() => onApprove(tx)}
                                    >
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
                                ) : (
                                  <span className="text-xs text-zinc-400">
                                    View only
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                }
              />
            </>
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
