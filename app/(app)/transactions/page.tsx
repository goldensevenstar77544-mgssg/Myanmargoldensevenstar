"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
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
  type PageCursor,
} from "@/lib/firebase/firestore";
import { canCreateTransaction, isMaker, transactionApproverName } from "@/lib/permissions";
import type {
  Account,
  Business,
  Transaction,
  TransactionDirection,
  TransactionStatus,
} from "@/lib/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/types";
import { formatDate, formatMMK, formatAccountLabel } from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { Plus } from "lucide-react";
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

const EMPTY_FILTERS: AppliedFilters = {
  status: "all",
  direction: "all",
  businessId: "all",
  accountId: "all",
  dateFrom: "",
  dateTo: "",
};

export default function TransactionsPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [businessId, setBusinessId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState<AppliedFilters>(EMPTY_FILTERS);

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

  const fetchPage = useCallback(
    async (filters: AppliedFilters, after: PageCursor | null, append: boolean) => {
      if (!profile) return;
      const page = await listTransactions({
        status:
          filters.status === "all"
            ? undefined
            : (filters.status as TransactionStatus),
        direction:
          filters.direction === "all"
            ? undefined
            : (filters.direction as TransactionDirection),
        businessId:
          filters.businessId === "all" ? undefined : filters.businessId,
        accountId: filters.accountId === "all" ? undefined : filters.accountId,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        makerId: isMaker(profile) ? profile.id : undefined,
        pageSize: DEFAULT_PAGE_SIZE,
        cursor: after,
      });
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    },
    [profile]
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
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchPage(applied, null, false)
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load transactions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, applied, fetchPage]);

  const hasActiveFilters =
    status !== "all" ||
    direction !== "all" ||
    businessId !== "all" ||
    accountId !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  function clearFilters() {
    setStatus("all");
    setDirection("all");
    setBusinessId("all");
    setAccountId("all");
    setDateFrom("");
    setDateTo("");
    setApplied(EMPTY_FILTERS);
  }

  function applyFilters() {
    setApplied({
      status,
      direction,
      businessId,
      accountId,
      dateFrom,
      dateTo,
    });
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
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="text-sm text-zinc-500">
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 py-2 sm:space-y-0 sm:p-6 sm:pb-3">
          <div className="min-w-0">
            <CardTitle className="text-sm sm:text-base">Filters</CardTitle>
            <CardDescription className="mt-1 hidden sm:block">
              Filter by date, business, account, type, and status.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={clearFilters}
              >
                Clear
              </Button>
            )}
            <Button type="button" size="xs" onClick={() => void applyFilters()}>
              Apply
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3 pt-0 sm:gap-3 sm:p-6 sm:pt-0 md:grid-cols-3 lg:grid-cols-6">
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              From
            </Label>
            <DatePicker
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="From"
              allowClear
              className="h-9 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              To
            </Label>
            <DatePicker
              value={dateTo}
              onChange={setDateTo}
              placeholder="To"
              allowClear
              className="h-9 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm"
            />
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              Business
            </Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger className="h-9 min-w-0 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm [&>span]:truncate">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              <span className="sm:hidden">Account</span>
              <span className="hidden sm:inline">Bank / cash</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-9 min-w-0 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm [&>span]:truncate">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {formatAccountLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              Type
            </Label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="h-9 min-w-0 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="income">In</SelectItem>
                <SelectItem value="expense">Out</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              Status
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 min-w-0 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm [&>span]:truncate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No transactions match filters.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>From / To</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Maker</TableHead>
                    <TableHead>Approver</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((tx) => {
                    const linked = tx.linkedTransactionId
                      ? items.find((t) => t.id === tx.linkedTransactionId)
                      : undefined;
                    const out =
                      tx.direction === "expense"
                        ? tx
                        : linked?.direction === "expense"
                          ? linked
                          : items.find(
                              (t) =>
                                t.transferGroupId === tx.transferGroupId &&
                                t.direction === "expense"
                            );
                    const inLeg =
                      tx.direction === "income"
                        ? tx
                        : linked?.direction === "income"
                          ? linked
                          : items.find(
                              (t) =>
                                t.transferGroupId === tx.transferGroupId &&
                                t.direction === "income"
                            );
                    return (
                    <TableRow key={tx.id}>
                      <TableCell className="font-mono text-xs">
                        {tx.displayId}
                      </TableCell>
                      <TableCell>{formatDate(tx.date)}</TableCell>
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
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="xs">
                          <Link href={`/transactions/${tx.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
