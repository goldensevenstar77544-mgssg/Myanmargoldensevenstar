"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/date-picker";
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
  approveTransaction,
  getTransaction,
  listAccounts,
  listBusinesses,
  rejectTransaction,
  updateTransaction,
} from "@/lib/firebase/firestore";
import {
  canApproveOrReject,
  canEditTransaction,
  isMaker,
  transactionApproverName,
  userDisplayName,
} from "@/lib/permissions";
import type {
  Account,
  Business,
  Transaction,
  TransactionAttachment,
  TransactionDirection,
} from "@/lib/types";
import { CATEGORY_LABELS, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  formatMMK,
  formatAccountLabel,
} from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { TransactionAttachments } from "@/components/transaction-attachments";
import { TransferRoute } from "@/components/transfer-route";
import { PageBackButton } from "@/components/page-back-button";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { profile } = useAuth();
  const confirm = useConfirm();
  const [tx, setTx] = useState<Transaction | null>(null);
  const [linkedTx, setLinkedTx] = useState<Transaction | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const [businessId, setBusinessId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [direction, setDirection] = useState<TransactionDirection>("income");
  const [category, setCategory] = useState("sales_revenue");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [item, biz, acc] = await Promise.all([
        getTransaction(id),
        listBusinesses(),
        listAccounts(),
      ]);
      setTx(item);
      setBusinesses(biz);
      setAccounts(acc);
      if (item?.linkedTransactionId) {
        const linked = await getTransaction(item.linkedTransactionId);
        setLinkedTx(linked);
      } else {
        setLinkedTx(null);
      }
      if (item) {
        setBusinessId(item.businessId);
        setAccountId(item.accountId);
        setDirection(item.direction);
        setCategory(item.category);
        setAmount(String(item.amount));
        setDate(item.date);
        setDescription(item.description);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load transaction");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useLoadOnMount(load);

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

  const categories =
    direction === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const activeAccounts = accounts.filter(
    (a) => a.status === "active" || a.id === accountId
  );

  if (loading) {
    return <LoadingState variant="inline" />;
  }

  if (
    !tx ||
    (isMaker(profile) && profile && tx.makerId !== profile.id)
  ) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageBackButton fallbackHref="/transactions" />
        <Card>
          <CardHeader>
            <CardTitle>Transaction not found</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const editable =
    canEditTransaction(profile, tx) && !tx.transferGroupId;
  const reviewable = canApproveOrReject(profile, tx);

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const ok = await confirm({
      title: "Save changes to this transaction?",
      description: "Your edits will replace the current pending record details.",
      confirmLabel: "Save changes",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await updateTransaction(tx!.id, {
        businessId,
        accountId,
        direction,
        category,
        amount: Number(amount),
        date,
        description,
      }, {
        actorId: profile.id,
        actorName: userDisplayName(profile),
      });
      toast.success("Transaction updated");
      setEditing(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Could not update transaction");
    } finally {
      setBusy(false);
    }
  }

  async function onApprove() {
    if (!profile) return;
    const ok = await confirm({
      title: "Approve this transaction?",
      description:
        "This will mark the record as approved and update the account balance.",
      confirmLabel: "Approve",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await approveTransaction(
        tx!.id,
        profile.id,
        userDisplayName(profile)
      );
      toast.success("Approved — balance updated");
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
    if (!profile) return;
    if (!rejectReason.trim()) {
      toast.error("Rejection reason is required");
      return;
    }
    setBusy(true);
    try {
      await rejectTransaction(
        tx!.id,
        profile.id,
        userDisplayName(profile),
        rejectReason
      );
      toast.success("Transaction rejected");
      setRejectOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Could not reject");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <PageBackButton fallbackHref="/transactions" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Transaction detail
            </h1>
            <div className="text-sm text-zinc-500">
              {tx.displayId}
              {tx.transferGroupId ? (
                <Badge variant="secondary" className="ml-2">
                  Transfer
                </Badge>
              ) : null}
            </div>
          </div>
          <StatusBadge status={tx.status} />
        </div>
      </div>

      {tx.transferGroupId && linkedTx ? (
        <Card>
          <CardHeader>
            <CardTitle>Internal transfer</CardTitle>
            <CardDescription>
              Approving or rejecting either leg updates both.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TransferRoute
              fromBusiness={
                businessMap[
                  (tx.direction === "expense" ? tx : linkedTx).businessId
                ]
              }
              fromAccount={
                accountMap[
                  (tx.direction === "expense" ? tx : linkedTx).accountId
                ]
              }
              toBusiness={
                businessMap[
                  (tx.direction === "income" ? tx : linkedTx).businessId
                ]
              }
              toAccount={
                accountMap[
                  (tx.direction === "income" ? tx : linkedTx).accountId
                ]
              }
            />
            <Button asChild variant="outline" size="sm">
              <Link href={`/transactions/${linkedTx.id}`}>
                Open linked leg ({linkedTx.displayId})
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : linkedTx ? (
        <Card>
          <CardHeader>
            <CardTitle>Linked transfer leg</CardTitle>
            <CardDescription>
              Approving or rejecting either leg updates both.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href={`/transactions/${linkedTx.id}`}>
                {linkedTx.displayId} ·{" "}
                {linkedTx.direction === "income" ? "In" : "Out"} ·{" "}
                {formatMMK(linkedTx.amount)}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Record</CardTitle>
            <CardDescription>
              Only approved records affect balances and dashboard totals.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {editable && !editing && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {reviewable && (
              <>
                <Button onClick={onApprove} disabled={busy}>
                  Approve
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={busy}
                >
                  Reject
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={onSaveEdit} className="space-y-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <DatePicker
                  value={date}
                  onChange={setDate}
                  placeholder="Select date"
                />
              </div>
              <div className="space-y-2">
                <Label>Bank / cash</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {formatAccountLabel(a)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Business</Label>
                <Select value={businessId} onValueChange={setBusinessId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {businesses
                      .filter((b) => b.status === "active" || b.id === businessId)
                      .map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={direction}
                    onValueChange={(v) => {
                      const next = v as TransactionDirection;
                      setDirection(next);
                      setCategory(
                        (next === "income"
                          ? INCOME_CATEGORIES
                          : EXPENSE_CATEGORIES)[0].value
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">In</SelectItem>
                      <SelectItem value="expense">Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Amount (MMK)</Label>
                <Input
                  type="number"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>
              <TransactionAttachments
                attachments={tx.attachments}
                transactionId={tx.id}
                uploadedBy={profile?.id}
                actorName={profile ? userDisplayName(profile) : undefined}
                editable
                onAttachmentsChange={(next: TransactionAttachment[]) =>
                  setTx({ ...tx, attachments: next })
                }
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Maker</Label>
                  <Input value={tx.makerName || "—"} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label>Approver</Label>
                  <Input
                    value={transactionApproverName(tx) || "—"}
                    readOnly
                    disabled
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  Save changes
                </Button>
              </div>
            </form>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Date
                </dt>
                <dd className="mt-1">{formatDate(tx.date)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Created
                </dt>
                <dd className="mt-1">{formatDateTime(tx.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Bank / cash
                </dt>
                <dd className="mt-1 font-medium">
                  {accountMap[tx.accountId] || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Business
                </dt>
                <dd className="mt-1 font-medium">
                  {businessMap[tx.businessId] || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Type
                </dt>
                <dd className="mt-1">
                  {tx.direction === "income" ? "In" : "Out"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Category
                </dt>
                <dd className="mt-1">
                  {CATEGORY_LABELS[tx.category] || tx.category}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Amount (MMK)
                </dt>
                <dd
                  className={
                    tx.direction === "income"
                      ? "mt-1 text-lg font-semibold text-emerald-700"
                      : "mt-1 text-lg font-semibold text-rose-700"
                  }
                >
                  {tx.direction === "income" ? "+" : "−"}
                  {formatMMK(tx.amount)}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Description
                </dt>
                <dd className="mt-1">{tx.description}</dd>
              </div>
              <div className="sm:col-span-2">
                <TransactionAttachments
                  attachments={tx.attachments}
                  transactionId={tx.id}
                  uploadedBy={profile?.id}
                  actorName={profile ? userDisplayName(profile) : undefined}
                  editable={editable}
                  onAttachmentsChange={(next: TransactionAttachment[]) =>
                    setTx({ ...tx, attachments: next })
                  }
                />
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Maker
                </dt>
                <dd className="mt-1">{tx.makerName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Approver
                </dt>
                <dd className="mt-1">{transactionApproverName(tx) || "—"}</dd>
              </div>
              {tx.rejectionReason && (
                <div className="sm:col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">
                    Rejection reason
                  </dt>
                  <dd className="mt-1 text-red-700">{tx.rejectionReason}</dd>
                </div>
              )}
            </dl>
          )}
        </CardContent>
      </Card>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <form onSubmit={onReject}>
            <DialogHeader>
              <DialogTitle>Reject transaction</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectOpen(false)}
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
