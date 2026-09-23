"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { TransferRoute } from "@/components/transfer-route";
import {
  approveTransaction,
  listAccounts,
  listBusinesses,
  listTransactions,
  rejectTransaction,
} from "@/lib/firebase/firestore";
import {
  canApproveOrReject,
  isApprover,
  isFinanceAdmin,
  userDisplayName,
} from "@/lib/permissions";
import type { Account, Business, Transaction } from "@/lib/types";
import { formatDate, formatMMK, formatAccountLabel, formatTime } from "@/lib/utils";
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

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState<Transaction | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

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

  const queue = useMemo(() => collapsePendingQueue(items), [items]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txsPage, biz, acc] = await Promise.all([
        listTransactions({ status: "pending", pageSize: 100 }),
        listBusinesses(),
        listAccounts(),
      ]);
      setItems(txsPage.items);
      setBusinesses(biz);
      setAccounts(acc);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useLoadOnMount(load);

  if (!isFinanceAdmin(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff access required</CardTitle>
          <CardDescription>
            Only Checkers and Approvers can view the pending approvals queue.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const canActOnQueue = isApprover(profile);

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
            : "View the pending queue. Only Approvers can approve or reject records."}
        </p>
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
            <p className="px-4 py-6 text-sm text-zinc-500">No pending transactions.</p>
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
