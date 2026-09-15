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
  listFixedAssets,
  listTransactions,
  updateFixedAsset,
  type PageCursor,
} from "@/lib/firebase/firestore";
import { listBusinessMonthSummaries } from "@/lib/firebase/summaries";
import {
  businessPeriodClosing,
  businessPeriodOpeningFromMonths,
  getPeriodBounds,
  summarizeMonthsInPeriod,
  type PeriodKind,
} from "@/lib/account-period";
import { canManageMasterData } from "@/lib/permissions";
import type {
  Account,
  Business,
  EntityMonthSummary,
  FixedAsset,
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

function MetricCell({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone?: "income" | "expense" | "neutral";
}) {
  const valueTone =
    tone === "income"
      ? "text-emerald-700"
      : tone === "expense"
        ? "text-rose-700"
        : "text-zinc-950";

  return (
    <div className="min-w-0 px-2.5 py-1.5 sm:px-3">
      <div className="truncate text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        title={formatMMK(amount)}
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tracking-tight tabular-nums leading-tight",
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthSummaries, setMonthSummaries] = useState<EntityMonthSummary[]>(
    []
  );
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const [assetOpen, setAssetOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [assetName, setAssetName] = useState("");
  const [assetAmount, setAssetAmount] = useState("");
  const [assetDate, setAssetDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [assetNotes, setAssetNotes] = useState("");
  const [assetSaving, setAssetSaving] = useState(false);

  const bounds = useMemo(
    () => getPeriodBounds(period, year, month),
    [period, year, month]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [biz, acc, months, assets] = await Promise.all([
        getBusiness(id),
        listAccounts(),
        listBusinessMonthSummaries(id),
        listFixedAssets(id),
      ]);
      setBusiness(biz);
      setAccounts(acc);
      setMonthSummaries(months);
      setFixedAssets(assets);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load business");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLoadOnMount(load);

  function openCreateAsset() {
    setEditingAsset(null);
    setAssetName("");
    setAssetAmount("");
    setAssetDate(new Date().toISOString().slice(0, 10));
    setAssetNotes("");
    setAssetOpen(true);
  }

  function openEditAsset(asset: FixedAsset) {
    setEditingAsset(asset);
    setAssetName(asset.name);
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
          amount,
          date: assetDate,
          notes: assetNotes,
        });
        toast.success("Fixed asset updated");
      } else {
        await createFixedAsset(id, {
          name: assetName,
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

  const loadTransactions = useCallback(
    async (append: boolean, after: PageCursor | null) => {
      setTxLoading(true);
      try {
        const page = await listTransactions({
          businessId: id,
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

  const accountMap = useMemo(
    () =>
      Object.fromEntries(
        accounts.map((a) => [a.id, formatAccountLabel(a)])
      ),
    [accounts]
  );

  const opening = useMemo(
    () => businessPeriodOpeningFromMonths(monthSummaries, bounds.start),
    [monthSummaries, bounds.start]
  );

  const summary = useMemo(
    () => summarizeMonthsInPeriod(monthSummaries, period, year, month),
    [monthSummaries, period, year, month]
  );

  const closing = useMemo(
    () => businessPeriodClosing(opening, summary.flowNet),
    [opening, summary.flowNet]
  );

  function shiftMonth(delta: number) {
    const date = new Date(year, month - 1 + delta, 1);
    setYear(date.getFullYear());
    setMonth(date.getMonth() + 1);
  }

  const canGoNextMonth =
    year < currentYear || (year === currentYear && month < currentMonth);
  const canGoNextYear = year < currentYear;

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
      </div>

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
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {fixedAssets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.name}</TableCell>
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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex rounded-lg bg-zinc-100 p-0.5">
          <PeriodSegment value="month" period={period} onChange={setPeriod} />
          <PeriodSegment value="year" period={period} onChange={setPeriod} />
          <PeriodSegment value="all" period={period} onChange={setPeriod} />
        </div>

        {period === "month" && (
          <div className="flex items-center gap-1.5">
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
          </div>
        )}

        {period === "year" && (
          <div className="flex items-center gap-1">
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
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="grid grid-cols-2 divide-x divide-zinc-100 border-b border-zinc-100">
          <MetricCell label="Opening" amount={opening} />
          <MetricCell label="Closing" amount={closing} />
        </div>
        <div className="grid grid-cols-3 divide-x divide-zinc-100 border-b border-zinc-100">
          <MetricCell label="Income" amount={summary.income} tone="income" />
          <MetricCell
            label="Expenses"
            amount={summary.expense}
            tone="expense"
          />
          <MetricCell label="Net" amount={summary.net} tone={netTone} />
        </div>
        <div className="grid grid-cols-2 divide-x divide-zinc-100">
          <MetricCell
            label="Transfer in"
            amount={summary.transferIn}
            tone="income"
          />
          <MetricCell
            label="Transfer out"
            amount={summary.transferOut}
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
              No transactions for {bounds.label}.
            </p>
          ) : (
            <>
              <div className="divide-y divide-zinc-100 md:hidden">
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

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>{formatDate(tx.date)}</TableCell>
                        <TableCell>
                          {accountMap[tx.accountId] || "—"}
                        </TableCell>
                        <TableCell>
                          {CATEGORY_LABELS[tx.category] || tx.category}
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
