"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  listBusinesses,
  updateTransaction,
} from "@/lib/firebase/firestore";
import { uploadTransactionImages } from "@/lib/firebase/storage";
import { canCreateTransaction, userDisplayName } from "@/lib/permissions";
import type {
  Account,
  Business,
  TransactionDirection,
} from "@/lib/types";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/types";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { formatAccountLabel, formatMMK } from "@/lib/utils";
import {
  TransactionAttachments,
  revokePendingFiles,
  type PendingFile,
} from "@/components/transaction-attachments";
import { PageBackButton } from "@/components/page-back-button";

type EntryMode = "standard" | "transfer";

export default function NewTransactionPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
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

  const loadFormData = useCallback(async () => {
    try {
      const [biz, acc] = await Promise.all([listBusinesses(), listAccounts()]);
      setBusinesses(biz.filter((b) => b.status === "active"));
      setAccounts(acc.filter((a) => a.status === "active"));
    } catch (error) {
      console.error(error);
      toast.error("Failed to load form data");
    }
  }, []);

  useLoadOnMount(loadFormData);

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
        if (fromAccount && value > fromAccount.currentBalance) {
          toast.error(
            `Amount exceeds current balance (${formatMMK(fromAccount.currentBalance)})`
          );
          setSaving(false);
          return;
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
        if (account && value > account.currentBalance) {
          toast.error(
            `Amount exceeds current balance (${formatMMK(account.currentBalance)})`
          );
          setSaving(false);
          return;
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
                      <SelectValue placeholder="Select business" />
                    </SelectTrigger>
                    <SelectContent>
                      {businesses.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bank / cash</Label>
                  <Select
                    value={accountId || undefined}
                    onValueChange={setAccountId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank or cash account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {`${formatAccountLabel(a)} · ${formatMMK(a.currentBalance)}`}
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
                        <SelectValue placeholder="Source business" />
                      </SelectTrigger>
                      <SelectContent>
                        {businesses.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To business</Label>
                    <Select
                      value={toBusinessId || undefined}
                      onValueChange={setToBusinessId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Destination business" />
                      </SelectTrigger>
                      <SelectContent>
                        {businesses.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <SelectValue placeholder="Source account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {`${formatAccountLabel(a)} · ${formatMMK(a.currentBalance)}`}
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
                        <SelectValue placeholder="Destination account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {`${formatAccountLabel(a)} · ${formatMMK(a.currentBalance)}`}
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
