"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createTransaction,
  createTransfer,
  listAccounts,
  listAllBusinessAccountBalances,
  listBusinesses,
  updateTransaction,
} from "@/lib/firebase/firestore";
import { uploadTransactionImages } from "@/lib/firebase/storage";
import { canCreateTransaction, userDisplayName } from "@/lib/permissions";
import type {
  Account,
  Business,
  BusinessAccountBalance,
  TransactionDirection,
} from "@/lib/types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/types";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { cn, formatAccountLabel, formatMMK } from "@/lib/utils";
import {
  TransactionAttachments,
  revokePendingFiles,
  type PendingFile,
} from "@/components/transaction-attachments";
import { PageBackButton } from "@/components/page-back-button";

type EntryMode = "standard" | "transfer";

function shortAccountLabel(account: Account): string {
  if (account.type === "cash") return account.name;
  const bank = account.bankName?.trim();
  const number = account.accountNumber?.trim();
  if (bank && number) return `${bank} ${number}`;
  if (bank) return bank;
  return account.name;
}

function BusinessHoldingsHint({
  bizId,
  accounts,
  total,
  balanceFor,
}: {
  bizId: string;
  accounts: Account[];
  total: number;
  balanceFor: (accountId: string) => number;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    setOpen(true);
  }, [bizId]);

  if (!bizId || accounts.length === 0) return null;

  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 text-xs text-zinc-600">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left font-medium text-zinc-700 hover:bg-zinc-100/80"
        onClick={() => setOpen((v) => !v)}
      >
        <span>In each account</span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums font-normal text-zinc-500">
            {formatMMK(total)}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-zinc-500 transition-transform",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        </span>
      </button>
      {open && (
        <ul className="space-y-1 border-t border-zinc-200 px-3 py-2">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="truncate">{formatAccountLabel(a)}</span>
              <span className="shrink-0 tabular-nums text-zinc-800">
                {formatMMK(balanceFor(a.id))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NewTransactionPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [holdings, setHoldings] = useState<BusinessAccountBalance[]>([]);
  const [mode, setMode] = useState<EntryMode>("standard");
  const [businessId, setBusinessId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [fromBusinessId, setFromBusinessId] = useState("");
  const [toBusinessId, setToBusinessId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [direction, setDirection] = useState<TransactionDirection | "">("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedBusinessIds, setExpandedBusinessIds] = useState<Set<string>>(
    () => new Set()
  );

  function toggleBusinessExpanded(bizId: string) {
    setExpandedBusinessIds((prev) => {
      const next = new Set(prev);
      if (next.has(bizId)) next.delete(bizId);
      else next.add(bizId);
      return next;
    });
  }

  const loadFormData = useCallback(async () => {
    try {
      const [biz, acc, holdingRows] = await Promise.all([
        listBusinesses(),
        listAccounts(),
        listAllBusinessAccountBalances(),
      ]);
      setBusinesses(biz.filter((b) => b.status === "active"));
      setAccounts(acc.filter((a) => a.status === "active"));
      setHoldings(holdingRows);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load form data");
    }
  }, []);

  useLoadOnMount(loadFormData);

  function holdingBalanceFor(bizId: string, acctId: string): number {
    const holding = holdings.find(
      (h) => h.businessId === bizId && h.accountId === acctId
    );
    return holding?.currentBalance ?? 0;
  }

  function totalForBusiness(bizId: string): number {
    return holdings
      .filter((h) => h.businessId === bizId)
      .reduce((sum, h) => sum + h.currentBalance, 0);
  }

  function BusinessSelectValue({ bizId }: { bizId: string }) {
    const business = businesses.find((b) => b.id === bizId);
    if (!business) return null;
    return (
      <span className="flex w-full min-w-0 items-center justify-between gap-3 pr-1">
        <span className="truncate">{business.name}</span>
        <span className="shrink-0 tabular-nums text-zinc-500">
          {formatMMK(totalForBusiness(bizId))}
        </span>
      </span>
    );
  }

  function BusinessSelectItemContent({ business }: { business: Business }) {
    const expanded = expandedBusinessIds.has(business.id);
    return (
      <span className="flex w-full flex-col gap-1.5 py-0.5">
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            {accounts.length > 0 && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={
                  expanded
                    ? `Hide accounts for ${business.name}`
                    : `Show accounts for ${business.name}`
                }
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleBusinessExpanded(business.id);
                }}
              >
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    expanded ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
            )}
            <span className="truncate font-medium text-zinc-900">
              {business.name}
            </span>
          </span>
          <span className="shrink-0 tabular-nums text-zinc-700">
            {formatMMK(totalForBusiness(business.id))}
          </span>
        </span>
        {expanded && accounts.length > 0 && (
          <span className="space-y-0.5 border-t border-zinc-100 pt-1.5 pl-6">
            {accounts.map((a) => (
              <span
                key={a.id}
                className="flex items-baseline justify-between gap-3 text-xs text-zinc-500"
              >
                <span className="truncate">{shortAccountLabel(a)}</span>
                <span className="shrink-0 tabular-nums">
                  {formatMMK(holdingBalanceFor(business.id, a.id))}
                </span>
              </span>
            ))}
          </span>
        )}
      </span>
    );
  }

  /** Spendable amount for a business in an account (holding capped by account cash). */
  function availableInAccount(bizId: string, account: Account): number {
    if (!bizId) return account.currentBalance;
    return Math.min(
      holdingBalanceFor(bizId, account.id),
      account.currentBalance
    );
  }

  function AccountSelectValue({
    acctId,
    bizId,
  }: {
    acctId: string;
    bizId: string;
  }) {
    const account = accounts.find((a) => a.id === acctId);
    if (!account) return null;
    const balance = availableInAccount(bizId, account);
    return (
      <span className="flex w-full min-w-0 items-center justify-between gap-3 pr-1">
        <span className="truncate">{formatAccountLabel(account)}</span>
        <span className="shrink-0 tabular-nums text-zinc-500">
          {formatMMK(balance)}
        </span>
      </span>
    );
  }

  function AccountSelectItemContent({
    account,
    bizId,
  }: {
    account: Account;
    bizId: string;
  }) {
    const balance = availableInAccount(bizId, account);
    return (
      <span className="flex w-full items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{formatAccountLabel(account)}</span>
        <span className="shrink-0 tabular-nums text-zinc-600">
          {formatMMK(balance)}
        </span>
      </span>
    );
  }

  const categories =
    direction === "income"
      ? INCOME_CATEGORIES
      : direction === "expense"
        ? EXPENSE_CATEGORIES
        : [];
  const makerLabel = userDisplayName(profile);

  if (!canCreateTransaction(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Not allowed</CardTitle>
          <CardDescription>
            Your role cannot create financial transactions.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }

    if (!date) {
      toast.error("Select a date");
      return;
    }

    setSaving(true);
    try {
      if (mode === "transfer") {
        if (!fromBusinessId || !toBusinessId || !fromAccountId || !toAccountId) {
          toast.error("Select from/to businesses and accounts");
          setSaving(false);
          return;
        }
        if (fromAccountId === toAccountId) {
          toast.error("Choose two different accounts for a transfer");
          setSaving(false);
          return;
        }
        const fromAccount = accounts.find((a) => a.id === fromAccountId);
        if (fromAccount) {
          const available = availableInAccount(fromBusinessId, fromAccount);
          if (value > available) {
            toast.error(
              `Amount exceeds available balance (${formatMMK(available)})`
            );
            setSaving(false);
            return;
          }
        }
        const { outId } = await createTransfer({
          fromBusinessId,
          toBusinessId,
          fromAccountId,
          toAccountId,
          amount: value,
          date,
          description,
          makerId: profile.id,
          makerName: makerLabel,
        });
        if (pendingFiles.length > 0) {
          const attachments = await uploadTransactionImages({
            transactionId: outId,
            files: pendingFiles.map((p) => p.file),
            uploadedBy: profile.id,
          });
          await updateTransaction(
            outId,
            { attachments },
            { actorId: profile.id, actorName: makerLabel }
          );
          revokePendingFiles(pendingFiles);
        }
        toast.success("Transfer submitted for approval");
        router.replace(`/transactions/${outId}`);
        return;
      }

      if (!businessId || !accountId) {
        toast.error("Select business and bank / cash account");
        setSaving(false);
        return;
      }
      if (!direction) {
        toast.error("Select type");
        setSaving(false);
        return;
      }
      if (!category) {
        toast.error("Select category");
        setSaving(false);
        return;
      }
      if (direction === "expense") {
        const account = accounts.find((a) => a.id === accountId);
        if (account) {
          const available = availableInAccount(businessId, account);
          if (value > available) {
            toast.error(
              `Amount exceeds available balance (${formatMMK(available)})`
            );
            setSaving(false);
            return;
          }
        }
      }
      const id = await createTransaction({
        businessId,
        accountId,
        direction,
        category,
        amount: value,
        date,
        description,
        makerId: profile.id,
        makerName: makerLabel,
      });
      if (pendingFiles.length > 0) {
        const attachments = await uploadTransactionImages({
          transactionId: id,
          files: pendingFiles.map((p) => p.file),
          uploadedBy: profile.id,
        });
        await updateTransaction(
          id,
          { attachments },
          { actorId: profile.id, actorName: makerLabel }
        );
        revokePendingFiles(pendingFiles);
      }
      toast.success("Submitted for approval");
      router.replace(`/transactions/${id}`);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not submit transaction"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <PageBackButton fallbackHref="/transactions" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            New transaction
          </h1>
          <p className="text-sm text-zinc-500">
            Submitted for Approver review when you save.
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Entry type</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as EntryMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Income / expense</SelectItem>
                  <SelectItem value="transfer">Internal transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <DatePicker
                id="date"
                value={date}
                onChange={setDate}
                placeholder="Select date"
              />
            </div>

            {mode === "standard" ? (
              <>
                <div className="space-y-2">
                  <Label>Business</Label>
                  <Select
                    value={businessId || undefined}
                    onValueChange={setBusinessId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select business">
                        {businessId ? (
                          <BusinessSelectValue bizId={businessId} />
                        ) : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {businesses.map((b) => (
                        <SelectItem
                          key={b.id}
                          value={b.id}
                          textValue={`${b.name} ${formatMMK(totalForBusiness(b.id))}`}
                          className="items-start py-2"
                        >
                          <BusinessSelectItemContent business={b} />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <BusinessHoldingsHint
                    bizId={businessId}
                    accounts={accounts}
                    total={totalForBusiness(businessId)}
                    balanceFor={(acctId) =>
                      holdingBalanceFor(businessId, acctId)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Bank / cash</Label>
                  <Select
                    value={accountId || undefined}
                    onValueChange={setAccountId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank or cash account">
                        {accountId ? (
                          <AccountSelectValue
                            acctId={accountId}
                            bizId={businessId}
                          />
                        ) : undefined}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem
                          key={a.id}
                          value={a.id}
                          textValue={`${formatAccountLabel(a)} ${formatMMK(
                            availableInAccount(businessId, a)
                          )}`}
                        >
                          <AccountSelectItemContent
                            account={a}
                            bizId={businessId}
                          />
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select
                      value={direction || undefined}
                      onValueChange={(v) => {
                        setDirection(v as TransactionDirection);
                        setCategory("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">In</SelectItem>
                        <SelectItem value="expense">Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={category || undefined}
                      onValueChange={setCategory}
                      disabled={!direction}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
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
              </>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>From business</Label>
                    <Select
                      value={fromBusinessId || undefined}
                      onValueChange={setFromBusinessId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Source business">
                          {fromBusinessId ? (
                            <BusinessSelectValue bizId={fromBusinessId} />
                          ) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {businesses.map((b) => (
                          <SelectItem
                            key={b.id}
                            value={b.id}
                            textValue={`${b.name} ${formatMMK(totalForBusiness(b.id))}`}
                            className="items-start py-2"
                          >
                            <BusinessSelectItemContent business={b} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <BusinessHoldingsHint
                      bizId={fromBusinessId}
                      accounts={accounts}
                      total={totalForBusiness(fromBusinessId)}
                      balanceFor={(acctId) =>
                        holdingBalanceFor(fromBusinessId, acctId)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>To business</Label>
                    <Select
                      value={toBusinessId || undefined}
                      onValueChange={setToBusinessId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Destination business">
                          {toBusinessId ? (
                            <BusinessSelectValue bizId={toBusinessId} />
                          ) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {businesses.map((b) => (
                          <SelectItem
                            key={b.id}
                            value={b.id}
                            textValue={`${b.name} ${formatMMK(totalForBusiness(b.id))}`}
                            className="items-start py-2"
                          >
                            <BusinessSelectItemContent business={b} />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <BusinessHoldingsHint
                      bizId={toBusinessId}
                      accounts={accounts}
                      total={totalForBusiness(toBusinessId)}
                      balanceFor={(acctId) =>
                        holdingBalanceFor(toBusinessId, acctId)
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>From account</Label>
                    <Select
                      value={fromAccountId || undefined}
                      onValueChange={setFromAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Source account">
                          {fromAccountId ? (
                            <AccountSelectValue
                              acctId={fromAccountId}
                              bizId={fromBusinessId}
                            />
                          ) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem
                            key={a.id}
                            value={a.id}
                            textValue={`${formatAccountLabel(a)} ${formatMMK(
                              availableInAccount(fromBusinessId, a)
                            )}`}
                          >
                            <AccountSelectItemContent
                              account={a}
                              bizId={fromBusinessId}
                            />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To account</Label>
                    <Select
                      value={toAccountId || undefined}
                      onValueChange={setToAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Destination account">
                          {toAccountId ? (
                            <AccountSelectValue
                              acctId={toAccountId}
                              bizId={toBusinessId}
                            />
                          ) : undefined}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem
                            key={a.id}
                            value={a.id}
                            textValue={`${formatAccountLabel(a)} ${formatMMK(
                              availableInAccount(toBusinessId, a)
                            )}`}
                          >
                            <AccountSelectItemContent
                              account={a}
                              bizId={toBusinessId}
                            />
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount">Amount (MMK)</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            <TransactionAttachments
              pendingFiles={pendingFiles}
              onPendingFilesChange={setPendingFiles}
              editable
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Maker</Label>
                <Input value={makerLabel} readOnly disabled />
              </div>
              <div className="space-y-2">
                <Label>Approver</Label>
                <Input value="—" readOnly disabled />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/transactions")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Submitting…" : "Submit for approval"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
