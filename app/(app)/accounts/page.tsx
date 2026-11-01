"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AccountsHero } from "@/components/accounts-hero";
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
} from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { invalidateAccountsCache } from "@/lib/firebase/master-data-cache";
import { canManageMasterData } from "@/lib/permissions";
import type { Account, AccountType } from "@/lib/types";
import { cn, formatAccountLabel, formatMMK } from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { useMinWidth } from "@/lib/use-min-width";
import { Info, Landmark, Plus } from "lucide-react";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";

async function parseApiJson(
  res: Response,
  fallback: string
): Promise<{ error?: string }> {
  const raw = await res.text();
  if (!raw) {
    if (!res.ok) {
      throw new Error(`${fallback} (HTTP ${res.status}). Empty response.`);
    }
    return {};
  }
  try {
    return JSON.parse(raw) as { error?: string };
  } catch {
    throw new Error(
      `${fallback} (HTTP ${res.status}). Server returned non-JSON.`
    );
  }
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/did not match the expected pattern/i.test(message)) {
    return `${fallback}. Check FIREBASE_ADMIN_* env on the host.`;
  }
  return message;
}

function accountPrimaryLabel(account: Account): string {
  if (account.type === "bank") {
    return account.bankName?.trim() || account.name;
  }
  return account.name;
}

function accountNumberLabel(account: Account): string {
  if (account.type === "cash") return "—";
  return account.accountNumber?.trim() || "—";
}

function accountNameLabel(account: Account): string {
  return account.name?.trim() || "—";
}

function BankWithBranchDetails({
  account,
  className,
}: {
  account: Account;
  className?: string;
}) {
  const label = accountPrimaryLabel(account);
  const branch = account.bankBranch?.trim();
  const hasBranch = account.type === "bank" && Boolean(branch);

  if (!hasBranch) {
    return (
      <span
        className={cn(
          "block max-w-full truncate font-medium text-zinc-900",
          className
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Branch details: ${label}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="min-w-0 truncate">{label}</span>
          <Info className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-56 px-3 py-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Landmark
              className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Bank
              </p>
              <p className="truncate text-sm font-semibold text-zinc-950">
                {label}
              </p>
            </div>
          </div>
          <div className="border-t border-zinc-100 pt-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Branch
            </p>
            <p className="truncate text-sm text-zinc-900">{branch}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AccountsPage() {
  const router = useRouter();
  const { profile, firebaseUser } = useAuth();
  const confirm = useConfirm();
  const canManage = canManageMasterData(profile);
  const { matches: isDesktop, ready: layoutReady } = useMinWidth(768);
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
  const [deleting, setDeleting] = useState(false);

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

  const liquidity = useMemo(() => {
    const activeBank = accounts.filter(
      (a) => a.type === "bank" && a.status === "active"
    );
    const activeCash = accounts.filter(
      (a) => a.type === "cash" && a.status === "active"
    );
    return {
      bankBalance: activeBank.reduce((sum, a) => sum + a.currentBalance, 0),
      cashBalance: activeCash.reduce((sum, a) => sum + a.currentBalance, 0),
      bankCount: activeBank.length,
      cashCount: activeCash.length,
    };
  }, [accounts]);

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

  async function onDelete(account: Account) {
    if (!firebaseUser) return;
    const ok = await confirm({
      title: "Delete this account?",
      description: `Permanently delete “${formatAccountLabel(account)}”? This cannot be undone. Accounts with transactions cannot be deleted — deactivate them instead.`,
      confirmLabel: "Delete account",
      variant: "destructive",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/accounts/${account.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await parseApiJson(res, "Delete account failed");
      if (!res.ok) {
        throw new Error(
          data.error || `Failed to delete account (HTTP ${res.status})`
        );
      }
      toast.success("Account deleted");
      setOpen(false);
      invalidateAccountsCache();
      await load();
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Failed to delete account"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Financial accounts
          </h1>
          <p className="text-sm text-zinc-500">
            Shared group bank and cash accounts. Balances update when
            transactions are approved; business is chosen per transaction.
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

      {!loading && (
        <AccountsHero
          bankBalance={liquidity.bankBalance}
          cashBalance={liquidity.cashBalance}
          bankCount={liquidity.bankCount}
          cashCount={liquidity.cashCount}
        />
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : accounts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No accounts found.</p>
          ) : (
            <>
              {!layoutReady ? (
                <LoadingState variant="page" />
              ) : isDesktop ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Account name</TableHead>
                      <TableHead>Account number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Opening</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Pending</TableHead>
                      <TableHead>Approved</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && (
                        <TableHead className="text-right">Actions</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account, index) => (
                      <TableRow
                        key={account.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/accounts/${account.id}`)}
                      >
                        <TableCell className="tabular-nums text-zinc-500">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <BankWithBranchDetails account={account} />
                        </TableCell>
                        <TableCell className="max-w-[12rem] truncate">
                          {accountNameLabel(account)}
                        </TableCell>
                        <TableCell className="font-mono text-xs tabular-nums">
                          {accountNumberLabel(account)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {account.type}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatMMK(account.openingBalance)}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {formatMMK(account.currentBalance)}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {account.pendingCount}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {account.approvedCount}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              account.status === "active"
                                ? "success"
                                : "secondary"
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
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(account);
                              }}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="divide-y divide-zinc-100">
                  {accounts.map((account) => (
                    <div
                      key={account.id}
                      role="link"
                      tabIndex={0}
                      className="block cursor-pointer space-y-2 px-4 py-3 transition-colors hover:bg-zinc-50 active:bg-zinc-100"
                      onClick={() => router.push(`/accounts/${account.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/accounts/${account.id}`);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <BankWithBranchDetails account={account} />
                          {account.type === "bank" &&
                          account.name?.trim() &&
                          account.name.trim() !==
                            accountPrimaryLabel(account) ? (
                            <p className="truncate text-xs text-zinc-500">
                              {account.name.trim()}
                            </p>
                          ) : null}
                          {account.type === "bank" &&
                          account.accountNumber?.trim() ? (
                            <p className="truncate font-mono text-xs text-zinc-500">
                              {account.accountNumber.trim()}
                            </p>
                          ) : null}
                          <p className="truncate text-xs capitalize text-zinc-500">
                            {account.type}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge
                            variant={
                              account.status === "active"
                                ? "success"
                                : "secondary"
                            }
                          >
                            {account.status}
                          </Badge>
                          {canManage && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(account);
                              }}
                            >
                              Edit
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="truncate text-xs text-zinc-500">
                          {account.pendingCount} pending ·{" "}
                          {account.approvedCount} approved
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-zinc-900">
                          {formatMMK(account.currentBalance)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
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
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">
                          Status
                        </p>
                        <p className="text-xs text-zinc-500">
                          {editing.status === "active"
                            ? "Active — available for new transactions."
                            : "Inactive — hidden from new transactions."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={
                          editing.status === "active"
                            ? "destructive"
                            : "secondary"
                        }
                        size="sm"
                        onClick={() => toggleStatus(editing)}
                      >
                        {editing.status === "active"
                          ? "Deactivate"
                          : "Activate"}
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">
                          Delete account
                        </p>
                        <p className="text-xs text-zinc-500">
                          Permanent. Blocked if this account has any
                          transactions.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={deleting || saving}
                        onClick={() => void onDelete(editing)}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving || deleting}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
