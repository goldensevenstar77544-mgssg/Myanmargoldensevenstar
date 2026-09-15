"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createAccount, listAccounts, updateAccount } from "@/lib/firebase/firestore";
import { canManageMasterData } from "@/lib/permissions";
import type { Account, AccountType } from "@/lib/types";
import { formatAccountLabel, formatMMK } from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { Plus } from "lucide-react";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";

export default function AccountsPage() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const canManage = canManageMasterData(profile);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [type, setType] = useState<AccountType>("bank");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankAddress, setBankAddress] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await listAccounts());
    } catch (error) {
      console.error(error);
      toast.error("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useLoadOnMount(load);

  function openCreate() {
    setEditing(null);
    setType("bank");
    setName("");
    setBankName("");
    setAccountNumber("");
    setBankBranch("");
    setBankAddress("");
    setOpeningBalance("0");
    setOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    setType(account.type);
    setName(account.name);
    setBankName(account.bankName || "");
    setAccountNumber(account.accountNumber || "");
    setBankBranch(account.bankBranch || "");
    setBankAddress(account.bankAddress || "");
    setOpeningBalance(String(account.openingBalance));
    setOpen(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      const ok = await confirm({
        title: "Save account changes?",
        description: `Update details for “${editing.name}”.`,
        confirmLabel: "Save changes",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateAccount(editing.id, {
          type,
          name,
          bankName,
          accountNumber,
          bankBranch,
          bankAddress,
        });
        toast.success("Account updated");
      } else {
        await createAccount({
          type,
          name,
          bankName,
          accountNumber,
          bankBranch,
          bankAddress,
          openingBalance: Number(openingBalance) || 0,
        });
        toast.success("Account created");
      }
      setOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Could not save account");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: Account) {
    const nextActive = account.status !== "active";
    const ok = await confirm({
      title: nextActive
        ? "Activate this account?"
        : "Deactivate this account?",
      description: nextActive
        ? `“${formatAccountLabel(account)}” will be available for new transactions.`
        : `“${formatAccountLabel(account)}” will no longer be available for new transactions.`,
      confirmLabel: nextActive ? "Activate" : "Deactivate",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await updateAccount(account.id, {
        status: nextActive ? "active" : "inactive",
      });
      toast.success("Account status updated");
      setOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Could not update status");
    }
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Financial accounts
          </h1>
          <p className="text-sm text-zinc-500">
            Shared group bank accounts and cash in hand — usable by any business.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="hidden md:inline-flex">
            <Plus className="h-4 w-4" />
            New account
          </Button>
        )}
      </div>

      {canManage && (
        <MobileFabStack>
          <MobileFab label="New account" onClick={openCreate} />
        </MobileFabStack>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>
            Balances update when transactions are approved. Business is chosen
            per transaction, not per account.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : accounts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No accounts found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bank / Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Opening</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Pending</TableHead>
                  <TableHead>Approved</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/accounts/${account.id}`}
                        className="text-zinc-900 underline-offset-4 hover:underline"
                      >
                        {account.type === "bank"
                          ? account.bankName?.trim() || account.name
                          : account.name}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{account.type}</TableCell>
                    <TableCell className="text-zinc-500">
                      {account.type === "bank"
                        ? [account.name, account.accountNumber, account.bankBranch]
                            .map((v) => v?.trim())
                            .filter(Boolean)
                            .join(" · ") || "—"
                        : "Cash in hand"}
                    </TableCell>
                    <TableCell>{formatMMK(account.openingBalance)}</TableCell>
                    <TableCell className="font-medium">
                      {formatMMK(account.currentBalance)}
                    </TableCell>
                    <TableCell>{account.pendingCount}</TableCell>
                    <TableCell>{account.approvedCount}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          account.status === "active" ? "success" : "secondary"
                        }
                      >
                        {account.status}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => openEdit(account)}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={onSave}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Edit account" : "Create account"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 grid gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as AccountType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="cash">Cash in hand</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {type === "bank" && (
                <div className="space-y-2">
                  <Label htmlFor="bank">Bank name</Label>
                  <Input
                    id="bank"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="acc-name">Account name</Label>
                <Input
                  id="acc-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              {type === "bank" && (
                <div className="space-y-2">
                  <Label htmlFor="number">Account number</Label>
                  <Input
                    id="number"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>
              )}
              {type === "bank" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="branch">Bank branch</Label>
                    <Input
                      id="branch"
                      value={bankBranch}
                      onChange={(e) => setBankBranch(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Bank address</Label>
                    <Input
                      id="address"
                      value={bankAddress}
                      onChange={(e) => setBankAddress(e.target.value)}
                    />
                  </div>
                </>
              )}
              {!editing && (
                <div className="space-y-2">
                  <Label htmlFor="opening">Opening balance (MMK)</Label>
                  <Input
                    id="opening"
                    type="number"
                    min="0"
                    step="1"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    required
                  />
                </div>
              )}
              {editing && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">Status</p>
                      <p className="text-xs text-zinc-500">
                        {editing.status === "active"
                          ? "Active — available for new transactions."
                          : "Inactive — hidden from new transactions."}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={
                        editing.status === "active" ? "destructive" : "secondary"
                      }
                      size="sm"
                      onClick={() => toggleStatus(editing)}
                    >
                      {editing.status === "active" ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
