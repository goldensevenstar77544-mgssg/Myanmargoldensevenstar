"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { PeriodTrendsChart } from "@/components/account-trends-chart";
import { DatePicker } from "@/components/date-picker";
import { LoadingState } from "@/components/loading-state";
import { PageBackButton } from "@/components/page-back-button";
import { ResponsiveSwitch } from "@/components/responsive-switch";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  createFixedAsset,
  deleteFixedAsset,
  getBusiness,
  listAccounts,
  listBusinessAccountBalances,
  listFixedAssets,
  listTransactions,
  setBusinessOpeningBalances,
  updateFixedAsset,
  type PageCursor,
} from "@/lib/firebase/firestore";
import {
  listBusinessMonthSummaries,
  getBusinessSummary,
} from "@/lib/firebase/summaries";
import {
  businessPeriodClosing,
  businessPeriodOpeningFromLifetime,
  businessPeriodOpeningFromMonths,
  getPeriodBounds,
  monthSummariesSinceKey,
  summarizeMonthsInPeriod,
  type PeriodKind,
} from "@/lib/account-period";
import { bucketFlowNet } from "@/lib/summaries";
import { canManageMasterData } from "@/lib/permissions";
import type {
  Account,
  Business,
  BusinessAccountBalance,
  EntityMonthSummary,
  FixedAsset,
  Transaction,
  TransactionDirection,
  TransactionStatus,
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

export default function BusinessDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { profile } = useAuth();
  const confirm = useConfirm();
  const canManage = canManageMasterData(profile);
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [business, setBusiness] = useState<Business | null>(null);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  const [holdings, setHoldings] = useState<BusinessAccountBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<EntityMonthSummary[]>(
    []
  );
  const [lifetimeFlowNet, setLifetimeFlowNet] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [filterAccountId, setFilterAccountId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");

  const [activeTab, setActiveTab] = useState("activity");
  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [assetName, setAssetName] = useState("");
  const [assetDepartment, setAssetDepartment] = useState("");
  const [assetAmount, setAssetAmount] = useState("");
  const [assetDate, setAssetDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [assetNotes, setAssetNotes] = useState("");
  const [assetSaving, setAssetSaving] = useState(false);

  const [holdingsOpen, setHoldingsOpen] = useState(false);
  const [openingEdits, setOpeningEdits] = useState<Record<string, string>>({});
  const [holdingsSaving, setHoldingsSaving] = useState(false);

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
      const [biz, acc, assets, balances, entitySummary] = await Promise.all([
        getBusiness(id),
        listAccounts(),
        listFixedAssets(id),
        listBusinessAccountBalances(id),
        getBusinessSummary(id),
      ]);
      setBusiness(biz);
      setAccounts(acc);
      setFixedAssets(assets);
      setHoldings(balances);
      setLifetimeFlowNet(bucketFlowNet(entitySummary));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load business");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLoadOnMount(load);

  useEffect(() => {
    let cancelled = false;
    listBusinessMonthSummaries(id, sinceMonthKey)
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

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.status === "active"),
    [accounts]
  );

  const holdingsByAccount = useMemo(() => {
    return Object.fromEntries(holdings.map((h) => [h.accountId, h]));
  }, [holdings]);

  const holdingsTotalOpening = useMemo(
    () => holdings.reduce((sum, h) => sum + h.openingBalance, 0),
    [holdings]
  );

  const holdingsTotalCurrent = useMemo(
    () => holdings.reduce((sum, h) => sum + h.currentBalance, 0),
    [holdings]
  );

  const editOpeningTotal = useMemo(() => {
    return activeAccounts.reduce((sum, account) => {
      return sum + (Number(openingEdits[account.id]) || 0);
    }, 0);
  }, [activeAccounts, openingEdits]);

  function openEditHoldings() {
    const next: Record<string, string> = {};
    for (const account of activeAccounts) {
      const existing = holdingsByAccount[account.id];
      next[account.id] = existing ? String(existing.openingBalance) : "";
    }
    setOpeningEdits(next);
    setHoldingsOpen(true);
  }

  async function onSaveHoldings(e: React.FormEvent) {
    e.preventDefault();
    const ok = await confirm({
      title: "Update opening capital?",
      description:
        "Changes are applied to this business’s holdings and the shared bank or cash balances.",
      confirmLabel: "Save openings",
    });
    if (!ok) return;
    setHoldingsSaving(true);
    try {
      const allocations = activeAccounts.map((account) => ({
        accountId: account.id,
        amount: Number(openingEdits[account.id]) || 0,
      }));
      await setBusinessOpeningBalances(id, allocations);
      toast.success("Opening capital updated");
      setHoldingsOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update opening capital"
      );
    } finally {
      setHoldingsSaving(false);
    }
  }

  function openCreateAsset() {
    setEditingAsset(null);
    setAssetName("");
    setAssetDepartment("");
    setAssetAmount("");
    setAssetDate(new Date().toISOString().slice(0, 10));
    setAssetNotes("");
    setAssetOpen(true);
  }

  function openEditAsset(asset: FixedAsset) {
    setEditingAsset(asset);
    setAssetName(asset.name);
    setAssetDepartment(asset.department || "");
    setAssetAmount(String(asset.amount));
    setAssetDate(asset.date);
    setAssetNotes(asset.notes || "");
    setAssetOpen(true);
  }

  async function onSaveAsset(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(assetAmount);
    if (!assetName.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!(amount > 0)) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setAssetSaving(true);
    try {
      if (editingAsset) {
        await updateFixedAsset(id, editingAsset.id, {
          name: assetName,
          department: assetDepartment,
          amount,
          date: assetDate,
          notes: assetNotes,
        });
        toast.success("Fixed asset updated");
      } else {
        await createFixedAsset(id, {
          name: assetName,
          department: assetDepartment,
          amount,
          date: assetDate,
          notes: assetNotes,
        });
        toast.success("Fixed asset added");
      }
      setAssetOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not save fixed asset"
      );
    } finally {
      setAssetSaving(false);
    }
  }

  async function onDeleteAsset(asset: FixedAsset) {
    const ok = await confirm({
      title: "Delete this fixed asset?",
      description: `Remove “${asset.name}” (${formatMMK(asset.amount)}). The business fixed-assets total will update.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteFixedAsset(id, asset.id);
      toast.success("Fixed asset deleted");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not delete fixed asset"
      );
    }
  }

  const transferOnly = filterDirection === "transfer";
  const hasHistoryFilters =
    filterAccountId !== "all" ||
    filterStatus !== "all" ||
    filterDirection !== "all";

  const loadTransactions = useCallback(
    async (append: boolean, after: PageCursor | null) => {
      setTxLoading(true);
      try {
        const page = await listTransactions({
          businessId: id,
          accountId:
            filterAccountId === "all" ? undefined : filterAccountId,
          status:
            filterStatus === "all"
              ? undefined
              : (filterStatus as TransactionStatus),
          direction:
            filterDirection === "all" || transferOnly
              ? undefined
              : (filterDirection as TransactionDirection),
          transferOnly: transferOnly || undefined,
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
    [
      id,
      bounds.start,
      bounds.end,
      filterAccountId,
      filterStatus,
      filterDirection,
      transferOnly,
    ]
  );

  function clearHistoryFilters() {
    setFilterAccountId("all");
    setFilterStatus("all");
    setFilterDirection("all");
  }

  useEffect(() => {
    if (loading) return;
    setTransactions([]);
    setCursor(null);
    void loadTransactions(false, null);
  }, [loading, loadTransactions]);

  const accountMap = useMemo(
    () =>
      Object.fromEntries(
        accounts.map((a) => [a.id, formatAccountLabel(a)])
      ),
    [accounts]
  );

  const opening = useMemo(() => {
    if (!bounds.start) {
      return businessPeriodOpeningFromMonths(
        holdingsTotalOpening,
        monthSummaries,
        null
      );
    }
    return businessPeriodOpeningFromLifetime(
      holdingsTotalOpening,
      lifetimeFlowNet,
      monthSummaries,
      bounds.start
    );
  }, [holdingsTotalOpening, monthSummaries, bounds.start, lifetimeFlowNet]);

  const summary = useMemo(
    () => summarizeMonthsInPeriod(monthSummaries, period, year, month),
    [monthSummaries, period, year, month]
  );

  const closing = useMemo(
    () =>
      businessPeriodClosing(
        opening,
        summary.flowNet,
        period,
        holdingsTotalCurrent
      ),
    [opening, summary.flowNet, period, holdingsTotalCurrent]
  );

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

  if (!business) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <PageBackButton fallbackHref="/businesses" />
        <Card>
          <CardHeader>
            <CardTitle>Business not found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const netTone =
    summary.net > 0 ? "income" : summary.net < 0 ? "expense" : "neutral";

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageBackButton fallbackHref="/businesses" />

      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {business.name}
          </h1>
          <Badge variant="secondary">{business.code}</Badge>
          <Badge
            variant={business.status === "active" ? "success" : "secondary"}
          >
            {business.status}
          </Badge>
        </div>
        <p className="text-sm text-zinc-500">
          {business.notes?.trim() || "No notes"}
        </p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums text-zinc-950">
          {formatMMK(holdingsTotalCurrent)}
        </p>
        <p className="text-xs text-zinc-500">
          Opening{" "}
          {formatMMK(business.totalCapital ?? holdingsTotalOpening)} · Fixed
          assets {formatMMK(business.fixedAssetExpense ?? 0)}
        </p>
      </div>

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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="assets">Fixed assets</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 py-3">
            <div>
              <CardTitle className="text-base">Bank and cash holdings</CardTitle>
              <CardDescription className="text-xs">
                Opening {formatMMK(business.totalCapital ?? holdingsTotalOpening)}
                {" · "}
                Current {formatMMK(holdingsTotalCurrent)}
              </CardDescription>
            </div>
            {canManage && (
              <Button size="sm" variant="outline" onClick={openEditHoldings}>
                Edit openings
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {holdings.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">
                No capital allocated yet.
                {canManage
                  ? " Set opening amounts across shared bank and cash accounts."
                  : ""}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Opening</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holdings.map((holding, index) => {
                    const share =
                      holdingsTotalCurrent > 0
                        ? (holding.currentBalance / holdingsTotalCurrent) * 100
                        : 0;
                    return (
                      <TableRow key={holding.id}>
                        <TableCell className="tabular-nums text-zinc-500">
                          {index + 1}
                        </TableCell>
                        <TableCell className="font-medium">
                          {accountMap[holding.accountId] ?? holding.accountId}
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
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="assets">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 py-3">
            <div>
              <CardTitle className="text-base">Fixed assets</CardTitle>
              <CardDescription className="text-xs">
                Total {formatMMK(business.fixedAssetExpense ?? 0)}
                {fixedAssets.length > 0
                  ? ` · ${fixedAssets.length} item${fixedAssets.length === 1 ? "" : "s"}`
                  : ""}
              </CardDescription>
            </div>
            {canManage && (
              <Button size="sm" onClick={openCreateAsset}>
                <Plus className="h-4 w-4" />
                Add asset
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {fixedAssets.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">
                No fixed assets yet.
                {canManage ? " Add the first asset for this business." : ""}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Notes</TableHead>
                    {canManage && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fixedAssets.map((asset, index) => (
                    <TableRow key={asset.id}>
                      <TableCell className="tabular-nums text-zinc-500">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-medium">{asset.name}</TableCell>
                      <TableCell className="text-zinc-600">
                        {asset.department?.trim() || "—"}
                      </TableCell>
                      <TableCell>{formatDate(asset.date)}</TableCell>
                      <TableCell className="tabular-nums">
                        {formatMMK(asset.amount)}
                      </TableCell>
                      <TableCell className="max-w-[12rem] truncate text-zinc-500">
                        {asset.notes?.trim() || "—"}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => openEditAsset(asset)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                              onClick={() => void onDeleteAsset(asset)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="activity">

        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="divide-y divide-zinc-100 border-b border-zinc-100">
            <MetricRow label="Opening" amount={opening} />
            <MetricRow label="Closing" amount={closing} />
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
          <div className="divide-y divide-zinc-100 border-b border-zinc-100">
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
          <div className="divide-y divide-zinc-100">
            <MetricRow
              label="Total credit"
              amount={summary.income + summary.transferIn}
              tone="income"
            />
            <MetricRow
              label="Total debit"
              amount={summary.expense + summary.transferOut}
              tone="expense"
            />
          </div>
        </div>

        <PeriodTrendsChart
          entityId={business.id}
          matchField="businessId"
          transactions={transactions}
          monthSummaries={monthSummaries}
          period={period}
          year={year}
          month={month}
          periodLabel={bounds.label}
          title="Business trends"
        />
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Select
            value={filterAccountId}
            onValueChange={setFilterAccountId}
          >
            <SelectTrigger
              aria-label="Bank or cash"
              title={
                filterAccountId === "all"
                  ? "All accounts"
                  : accountMap[filterAccountId] || "Account"
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
          <Select value={filterStatus} onValueChange={setFilterStatus}>
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
            value={filterDirection}
            onValueChange={setFilterDirection}
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
          {hasHistoryFilters && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="col-span-2 h-9 sm:col-span-1"
              onClick={clearHistoryFilters}
            >
              Clear
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="space-y-1 py-3">
            <CardTitle className="text-base">Transaction history</CardTitle>
            <CardDescription className="text-xs">
              Transactions for {bounds.label} on this business.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {txLoading && transactions.length === 0 ? (
              <LoadingState variant="inline" />
            ) : transactions.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">
                {hasHistoryFilters
                  ? "No transactions match filters."
                  : `No transactions for ${bounds.label}.`}
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
                            {accountMap[tx.accountId] || "—"}
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
                  ))}
                    </div>
                  }
                  desktop={
                    <div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
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
                          <TableCell>{formatDate(tx.date)}</TableCell>
                          <TableCell>
                            {accountMap[tx.accountId] || "—"}
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
        </TabsContent>
      </Tabs>

      <Dialog open={assetOpen} onOpenChange={setAssetOpen}>
        <DialogContent>
          <form onSubmit={onSaveAsset}>
            <DialogHeader>
              <DialogTitle>
                {editingAsset ? "Edit fixed asset" : "Add fixed asset"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="asset-name">Name</Label>
                <Input
                  id="asset-name"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-department">Department</Label>
                <Input
                  id="asset-department"
                  value={assetDepartment}
                  onChange={(e) => setAssetDepartment(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-amount">Amount (MMK)</Label>
                <Input
                  id="asset-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={assetAmount}
                  onChange={(e) => setAssetAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-date">Date</Label>
                <DatePicker
                  id="asset-date"
                  value={assetDate}
                  onChange={setAssetDate}
                  placeholder="Select date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asset-notes">Notes</Label>
                <Textarea
                  id="asset-notes"
                  value={assetNotes}
                  onChange={(e) => setAssetNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssetOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={assetSaving}>
                {assetSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={holdingsOpen} onOpenChange={setHoldingsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={onSaveHoldings}>
            <DialogHeader>
              <DialogTitle>Edit opening capital</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-3">
              <p className="text-sm text-zinc-500">
                Changes add or remove capital from shared bank and cash
                accounts for this business.
              </p>
              {activeAccounts.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No active accounts available.
                </p>
              ) : (
                activeAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <Label
                      htmlFor={`holding-opening-${account.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-normal"
                    >
                      {formatAccountLabel(account)}
                    </Label>
                    <Input
                      id={`holding-opening-${account.id}`}
                      type="number"
                      min={0}
                      step="1"
                      inputMode="decimal"
                      className="w-32 shrink-0"
                      value={openingEdits[account.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setOpeningEdits((prev) => ({
                          ...prev,
                          [account.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))
              )}
              <p className="text-sm text-zinc-600">
                Total capital{" "}
                <span className="font-medium text-zinc-900">
                  {formatMMK(editOpeningTotal)}
                </span>
              </p>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setHoldingsOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={holdingsSaving}>
                {holdingsSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
