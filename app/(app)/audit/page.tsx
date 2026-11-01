"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { LoadingState } from "@/components/loading-state";
import { ResponsiveSwitch } from "@/components/responsive-switch";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/date-picker";
import { Badge } from "@/components/ui/badge";
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
import { TransferRoute } from "@/components/transfer-route";
import {
  listAccounts,
  listAuditLogs,
  listBusinesses,
  type PageCursor,
} from "@/lib/firebase/firestore";
import { canViewAudit } from "@/lib/permissions";
import type {
  Account,
  AuditAction,
  AuditChange,
  AuditEntityType,
  AuditLog,
  Business,
  TransactionStatus,
} from "@/lib/types";
import { DEFAULT_PAGE_SIZE } from "@/lib/types";
import {
  formatAccountLabel,
  formatDateTime,
  formatMMK,
} from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";

const ACTION_LABELS: Record<AuditAction, string> = {
  created: "Created",
  updated: "Updated",
  approved: "Approved",
  rejected: "Rejected",
  deleted: "Deleted",
};

const ACTION_BADGE: Record<
  AuditAction,
  "default" | "secondary" | "success" | "danger" | "warning"
> = {
  created: "secondary",
  updated: "default",
  approved: "success",
  rejected: "danger",
  deleted: "danger",
};

function formatChangeSummary(changes?: AuditChange[]): string {
  if (!changes?.length) return "—";
  return changes
    .map((c) => {
      if (c.field === "attachments") {
        return `attachments: ${c.from} → ${c.to}`;
      }
      return `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`;
    })
    .join("; ");
}

function isTransferAudit(log: AuditLog): boolean {
  if (log.transferGroupId) return true;
  return Boolean(log.description?.toLowerCase().includes("internal transfer"));
}

function transferGroupKey(log: AuditLog): string | null {
  if (!isTransferAudit(log) || log.entityType !== "transaction") return null;
  if (log.transferGroupId) {
    return `${log.transferGroupId}:${log.action}:${log.actorId}`;
  }
  // Legacy transfer legs without transferGroupId: pair by description + action + actor.
  const desc = log.description?.trim() || "";
  if (!desc) return null;
  return `legacy:${desc}:${log.action}:${log.actorId}`;
}

type AuditDisplayItem =
  | { kind: "single"; log: AuditLog }
  | {
      kind: "transfer";
      key: string;
      action: AuditAction;
      out?: AuditLog;
      inLeg?: AuditLog;
      logs: AuditLog[];
    };

function groupAuditLogs(items: AuditLog[]): AuditDisplayItem[] {
  const used = new Set<string>();
  const result: AuditDisplayItem[] = [];
  const byGroupActionActor = new Map<string, AuditLog[]>();
  const byEntityId = new Map<string, AuditLog[]>();
  const byLinkedTarget = new Map<string, AuditLog[]>();

  for (const log of items) {
    const key = transferGroupKey(log);
    if (key) {
      const mapKey = `${key}|${log.action}|${log.actorId}`;
      const list = byGroupActionActor.get(mapKey);
      if (list) list.push(log);
      else byGroupActionActor.set(mapKey, [log]);
    }
    const entityList = byEntityId.get(log.entityId);
    if (entityList) entityList.push(log);
    else byEntityId.set(log.entityId, [log]);
    if (log.linkedTransactionId) {
      const linkedList = byLinkedTarget.get(log.linkedTransactionId);
      if (linkedList) linkedList.push(log);
      else byLinkedTarget.set(log.linkedTransactionId, [log]);
    }
  }

  for (const log of items) {
    if (used.has(log.id)) continue;
    const key = transferGroupKey(log);
    if (!key) {
      used.add(log.id);
      result.push({ kind: "single", log });
      continue;
    }

    const mapKey = `${key}|${log.action}|${log.actorId}`;
    const siblings = new Map<string, AuditLog>();
    for (const s of byGroupActionActor.get(mapKey) ?? []) {
      if (!used.has(s.id)) siblings.set(s.id, s);
    }

    // Pair legs that point at each other when only one side has group metadata.
    if (log.linkedTransactionId) {
      for (const other of byEntityId.get(log.linkedTransactionId) ?? []) {
        if (used.has(other.id) || siblings.has(other.id)) continue;
        if (other.action === log.action && other.actorId === log.actorId) {
          siblings.set(other.id, other);
        }
      }
    }
    for (const other of byLinkedTarget.get(log.entityId) ?? []) {
      if (used.has(other.id) || siblings.has(other.id)) continue;
      if (other.action === log.action && other.actorId === log.actorId) {
        siblings.set(other.id, other);
      }
    }

    const siblingList = [...siblings.values()];
    siblingList.forEach((s) => used.add(s.id));

    if (siblingList.length === 1) {
      result.push({ kind: "single", log: siblingList[0]! });
      continue;
    }

    const out =
      siblingList.find((s) => s.direction === "expense") ?? siblingList[0];
    const inLeg =
      siblingList.find((s) => s.direction === "income") ??
      siblingList.find((s) => s.id !== out?.id);

    result.push({
      kind: "transfer",
      key,
      action: log.action,
      out,
      inLeg,
      logs: siblingList,
    });
  }

  return result;
}

function StatusTransition({
  previous,
  next,
}: {
  previous?: TransactionStatus;
  next?: TransactionStatus;
}) {
  if (!previous && !next) return <span className="text-zinc-400">—</span>;
  if (previous && next && previous !== next) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <StatusBadge status={previous} />
        <span className="text-xs text-zinc-400">→</span>
        <StatusBadge status={next} />
      </span>
    );
  }
  if (next) return <StatusBadge status={next} />;
  if (previous) return <StatusBadge status={previous} />;
  return <span className="text-zinc-400">—</span>;
}

function summaryFor(log: AuditLog): string {
  if (log.action === "rejected") {
    const reason = log.rejectionReason?.trim();
    const desc = log.description?.trim();
    if (reason && desc && isTransferAudit(log)) return `${reason} · ${desc}`;
    return reason || desc || "—";
  }
  if (log.action === "updated") {
    const changes = formatChangeSummary(log.changes);
    if (log.entityType === "user" && log.description?.trim()) {
      return changes !== "—"
        ? `${log.description.trim()} · ${changes}`
        : log.description.trim();
    }
    return changes;
  }
  if (log.action === "created") {
    if (log.entityType === "user") {
      return log.description?.trim() || "User created";
    }
    return log.description?.trim() || "Submitted for review";
  }
  if (log.action === "deleted") {
    if (log.entityType === "account") {
      return log.description?.trim() || "Account deleted";
    }
    return log.description?.trim() || "User deleted";
  }
  return log.description?.trim() || "—";
}

function EntityTypeBadge({ log }: { log: AuditLog }) {
  if (log.entityType === "user") {
    return <Badge variant="outline">User</Badge>;
  }
  if (log.entityType === "account") {
    return <Badge variant="outline">Account</Badge>;
  }
  if (isTransferAudit(log)) {
    return <Badge variant="outline">Transfer</Badge>;
  }
  return <Badge variant="outline">Transaction</Badge>;
}

function EntityLinks({ logs }: { logs: AuditLog[] }) {
  const unique = logs.filter(
    (log, index, all) =>
      all.findIndex((other) => other.entityId === log.entityId) === index
  );
  if (unique.length === 0) return <span className="text-zinc-400">—</span>;
  if (unique[0]?.entityType === "user") {
    return (
      <Button asChild variant="outline" size="xs">
        <Link href="/users">Users</Link>
      </Button>
    );
  }
  if (unique[0]?.entityType === "account") {
    return (
      <Button asChild variant="outline" size="xs">
        <Link href="/accounts">Accounts</Link>
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {unique.map((log, index) => (
        <Button key={log.entityId} asChild variant="outline" size="xs">
          <Link href={`/transactions/${log.entityId}`}>
            {unique.length === 1
              ? "Open"
              : log.direction === "expense"
                ? "Out"
                : log.direction === "income"
                  ? "In"
                  : `Leg ${index + 1}`}
          </Link>
        </Button>
      ))}
    </span>
  );
}

function transferEndpoints(
  item: AuditDisplayItem,
  businessMap: Record<string, string>,
  accountMap: Record<string, string>
): {
  fromBusiness?: string;
  fromAccount?: string;
  toBusiness?: string;
  toAccount?: string;
} | null {
  if (item.kind === "transfer") {
    return {
      fromBusiness: item.out?.businessId
        ? businessMap[item.out.businessId]
        : undefined,
      fromAccount: item.out?.accountId
        ? accountMap[item.out.accountId]
        : undefined,
      toBusiness: item.inLeg?.businessId
        ? businessMap[item.inLeg.businessId]
        : undefined,
      toAccount: item.inLeg?.accountId
        ? accountMap[item.inLeg.accountId]
        : undefined,
    };
  }

  const log = item.log;
  if (!isTransferAudit(log) || log.entityType !== "transaction") return null;

  if (log.direction === "expense") {
    return {
      fromBusiness: log.businessId ? businessMap[log.businessId] : undefined,
      fromAccount: log.accountId ? accountMap[log.accountId] : undefined,
    };
  }
  if (log.direction === "income") {
    return {
      toBusiness: log.businessId ? businessMap[log.businessId] : undefined,
      toAccount: log.accountId ? accountMap[log.accountId] : undefined,
    };
  }
  return null;
}

function displayPrimary(item: AuditDisplayItem): AuditLog {
  if (item.kind === "single") return item.log;
  return item.out ?? item.inLeg ?? item.logs[0]!;
}

export default function AuditPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState<AuditLog[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [action, setAction] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [applied, setApplied] = useState({
    action: "all",
    entityType: "all",
    dateFrom: "",
    dateTo: "",
  });

  const businessMap = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );
  const accountMap = useMemo(
    () =>
      Object.fromEntries(accounts.map((a) => [a.id, formatAccountLabel(a)])),
    [accounts]
  );
  const displayItems = useMemo(() => groupAuditLogs(items), [items]);

  const hasActiveFilters =
    action !== "all" ||
    entityType !== "all" ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  const clearFilters = () => {
    setAction("all");
    setEntityType("all");
    setDateFrom("");
    setDateTo("");
    setApplied({
      action: "all",
      entityType: "all",
      dateFrom: "",
      dateTo: "",
    });
  };

  const fetchPage = useCallback(
    async (
      filters: typeof applied,
      after: PageCursor | null,
      append: boolean
    ) => {
      const page = await listAuditLogs({
        action:
          filters.action === "all"
            ? undefined
            : (filters.action as AuditAction),
        entityType:
          filters.entityType === "all"
            ? undefined
            : (filters.entityType as AuditEntityType),
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        pageSize: DEFAULT_PAGE_SIZE,
        cursor: after,
      });
      setItems((prev) => (append ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
    },
    []
  );

  const loadMaster = useCallback(async () => {
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
      toast.error("Failed to load audit logs");
      setLoading(false);
    }
  }, []);

  useLoadOnMount(loadMaster);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPage(applied, null, false)
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load audit logs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied, fetchPage]);

  function applyFilters() {
    setApplied({ action, entityType, dateFrom, dateTo });
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

  if (!canViewAudit(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff access required</CardTitle>
          <CardDescription>
            Only Admins, Checkers, and Approvers can view the activity audit
            trail.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit logs</h1>
        <p className="text-sm text-zinc-500">
          History of transaction workflow, internal transfers, and user
          management actions.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 py-2 sm:space-y-0 sm:p-6 sm:pb-3">
          <div className="min-w-0">
            <CardTitle className="text-sm sm:text-base">Filters</CardTitle>
            <CardDescription className="mt-1 hidden sm:block">
              Filter by entity, action, and date range.
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
        <CardContent className="grid grid-cols-2 gap-2 px-3 pb-3 pt-0 sm:gap-3 sm:p-6 sm:pt-0 md:grid-cols-4">
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              Entity
            </Label>
            <Select value={entityType} onValueChange={setEntityType}>
              <SelectTrigger
                title={
                  entityType === "all"
                    ? "All"
                    : entityType === "transaction"
                      ? "Transaction"
                      : entityType === "account"
                        ? "Account"
                        : "User"
                }
                className="h-9 min-w-0 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm [&>span]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="transaction">Transaction</SelectItem>
                <SelectItem value="account">Account</SelectItem>
                <SelectItem value="user">User</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs text-zinc-500 sm:text-sm sm:text-zinc-950">
              Action
            </Label>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger
                title={
                  action === "all"
                    ? "All"
                    : action.charAt(0).toUpperCase() + action.slice(1)
                }
                className="h-9 min-w-0 px-2.5 text-xs sm:h-10 sm:px-3 sm:text-sm [&>span]:truncate"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="created">Created</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="deleted">Deleted</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity history</CardTitle>
          <CardDescription>
            {displayItems.length} event{displayItems.length === 1 ? "" : "s"}
            {displayItems.length !== items.length
              ? ` · ${items.length} log entries`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              No audit events match filters.
            </p>
          ) : (
            <>
              <ResponsiveSwitch
                mobile={
                  <div className="divide-y divide-zinc-100">
                {displayItems.map((item) => {
                  const primary = displayPrimary(item);
                  const logs =
                    item.kind === "transfer" ? item.logs : [item.log];
                  const isTransfer = item.kind === "transfer" || isTransferAudit(primary);
                  return (
                    <div
                      key={item.kind === "transfer" ? item.key : item.log.id}
                      className="space-y-2 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-zinc-500">
                            {formatDateTime(primary.createdAt)}
                          </p>
                          <p className="truncate text-sm font-medium text-zinc-950">
                            {primary.actorName || "—"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <EntityTypeBadge log={primary} />
                          <Badge variant={ACTION_BADGE[primary.action]}>
                            {ACTION_LABELS[primary.action]}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <EntityLinks logs={logs} />
                        {primary.entityType === "transaction" &&
                        primary.amount !== undefined ? (
                          <span
                            className={
                              isTransfer
                                ? "text-sm font-semibold tabular-nums text-zinc-950"
                                : primary.direction === "income"
                                  ? "text-sm font-semibold tabular-nums text-emerald-700"
                                  : "text-sm font-semibold tabular-nums text-rose-700"
                            }
                          >
                            {isTransfer
                              ? formatMMK(primary.amount)
                              : `${primary.direction === "income" ? "+" : "−"}${formatMMK(primary.amount)}`}
                          </span>
                        ) : null}
                      </div>
                      {primary.entityType === "transaction" ? (
                        <>
                          {(() => {
                            const route = transferEndpoints(
                              item,
                              businessMap,
                              accountMap
                            );
                            if (route) {
                              return (
                                <TransferRoute
                                  compact
                                  fromBusiness={route.fromBusiness}
                                  fromAccount={route.fromAccount}
                                  toBusiness={route.toBusiness}
                                  toAccount={route.toAccount}
                                />
                              );
                            }
                            return (
                              <p className="text-xs text-zinc-500">
                                {primary.businessId
                                  ? businessMap[primary.businessId] || "—"
                                  : "—"}
                                {primary.accountId
                                  ? ` · ${accountMap[primary.accountId] || "—"}`
                                  : ""}
                              </p>
                            );
                          })()}
                          <div className="text-xs">
                            <StatusTransition
                              previous={primary.previousStatus}
                              next={primary.newStatus}
                            />
                          </div>
                        </>
                      ) : null}
                      <p className="line-clamp-3 text-xs text-zinc-600">
                        {summaryFor(primary)}
                      </p>
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
                      <TableHead>When</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>From / To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayItems.map((item, index) => {
                      const primary = displayPrimary(item);
                      const logs =
                        item.kind === "transfer" ? item.logs : [item.log];
                      const isTransfer =
                        item.kind === "transfer" || isTransferAudit(primary);
                      return (
                        <TableRow
                          key={
                            item.kind === "transfer" ? item.key : item.log.id
                          }
                        >
                          <TableCell className="tabular-nums text-zinc-500">
                            {index + 1}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDateTime(primary.createdAt)}
                          </TableCell>
                          <TableCell>
                            <EntityTypeBadge log={primary} />
                          </TableCell>
                          <TableCell>
                            <Badge variant={ACTION_BADGE[primary.action]}>
                              {ACTION_LABELS[primary.action]}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[10rem] truncate">
                            {primary.actorName || "—"}
                          </TableCell>
                          <TableCell>
                            <EntityLinks logs={logs} />
                          </TableCell>
                          <TableCell
                            className={
                              primary.entityType === "transaction" && isTransfer
                                ? "font-medium text-zinc-950"
                                : primary.entityType === "transaction" &&
                                    primary.direction === "income"
                                  ? "font-medium text-emerald-700"
                                  : primary.entityType === "transaction" &&
                                      primary.direction === "expense"
                                    ? "font-medium text-rose-700"
                                    : undefined
                            }
                          >
                            {primary.entityType === "transaction" &&
                            primary.amount !== undefined
                              ? isTransfer
                                ? formatMMK(primary.amount)
                                : primary.direction
                                  ? `${primary.direction === "income" ? "+" : "−"}${formatMMK(primary.amount)}`
                                  : formatMMK(primary.amount)
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-[16rem]">
                            {primary.entityType !== "transaction" ? (
                              <span className="text-zinc-400">—</span>
                            ) : (
                              (() => {
                                const route = transferEndpoints(
                                  item,
                                  businessMap,
                                  accountMap
                                );
                                if (route) {
                                  return (
                                    <TransferRoute
                                      compact
                                      fromBusiness={route.fromBusiness}
                                      fromAccount={route.fromAccount}
                                      toBusiness={route.toBusiness}
                                      toAccount={route.toAccount}
                                    />
                                  );
                                }
                                return primary.businessId
                                  ? businessMap[primary.businessId] || "—"
                                  : "—";
                              })()
                            )}
                          </TableCell>
                          <TableCell>
                            {primary.entityType === "transaction" ? (
                              <StatusTransition
                                previous={primary.previousStatus}
                                next={primary.newStatus}
                              />
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[16rem] truncate text-sm text-zinc-600">
                            {summaryFor(primary)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
