"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Settings, Trash2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { invalidateMasterDataCache } from "@/lib/firebase/master-data-cache";
import { isAdmin } from "@/lib/permissions";
import { cn } from "@/lib/utils";

type PurgeCategory =
  | "transactions"
  | "accounts"
  | "businesses"
  | "auditLogs";

type CategoryOption = {
  id: PurgeCategory;
  label: string;
  description: string;
};

const CATEGORY_OPTIONS: CategoryOption[] = [
  {
    id: "transactions",
    label: "Transactions",
    description:
      "All transactions, attachment files, display-ID counters, and financial summaries. Account balances are reset to opening if accounts are kept.",
  },
  {
    id: "accounts",
    label: "Accounts (banks & cash)",
    description: "All bank and cash accounts. Requires deleting transactions.",
  },
  {
    id: "businesses",
    label: "Businesses",
    description:
      "All businesses (including Retained Earnings) and fixed assets. Requires deleting transactions.",
  },
  {
    id: "auditLogs",
    label: "Audit logs",
    description: "All audit trail entries. User accounts are never deleted.",
  },
];

type PurgeResponse = {
  error?: string;
  deleted?: {
    transactions: number;
    accounts: number;
    businesses: number;
    auditLogs: number;
    summaries: number;
    counters: number;
    files: number;
    accountsReset: number;
  };
};

export default function SettingsPage() {
  const { profile, firebaseUser } = useAuth();
  const confirm = useConfirm();
  const [selected, setSelected] = useState<Set<PurgeCategory>>(new Set());
  const [purging, setPurging] = useState(false);

  const selectedList = useMemo(() => [...selected], [selected]);

  if (!isAdmin(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Admin access required</CardTitle>
          <CardDescription>
            Only Admins can open Settings and purge test data.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function toggle(category: PurgeCategory, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(category);
        if (category === "accounts" || category === "businesses") {
          next.add("transactions");
        }
      } else {
        next.delete(category);
        if (category === "transactions") {
          next.delete("accounts");
          next.delete("businesses");
        }
      }
      return next;
    });
  }

  async function onPurge() {
    if (!firebaseUser || selectedList.length === 0) return;

    const labels = CATEGORY_OPTIONS.filter((o) => selected.has(o.id)).map(
      (o) => o.label
    );
    const ok = await confirm({
      title: "Permanently delete selected data?",
      description: `This cannot be undone. Will delete: ${labels.join(", ")}. User accounts are kept.`,
      confirmLabel: "Delete permanently",
      variant: "destructive",
    });
    if (!ok) return;

    setPurging(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/settings/purge-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ categories: selectedList }),
      });
      const data = (await res.json()) as PurgeResponse;
      if (!res.ok) {
        throw new Error(data.error || "Failed to purge data");
      }

      invalidateMasterDataCache();
      setSelected(new Set());

      const d = data.deleted;
      const parts: string[] = [];
      if (d) {
        if (d.transactions) parts.push(`${d.transactions} transactions`);
        if (d.accounts) parts.push(`${d.accounts} accounts`);
        if (d.businesses) parts.push(`${d.businesses} businesses`);
        if (d.auditLogs) parts.push(`${d.auditLogs} audit logs`);
        if (d.summaries) parts.push(`${d.summaries} summary docs`);
        if (d.counters) parts.push(`${d.counters} counters`);
        if (d.files) parts.push(`${d.files} files`);
        if (d.accountsReset) parts.push(`${d.accountsReset} accounts reset`);
      }
      toast.success(
        parts.length > 0
          ? `Deleted: ${parts.join(", ")}`
          : "Purge completed (nothing to delete)"
      );
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to purge data"
      );
    } finally {
      setPurging(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-zinc-700" />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">
            Settings
          </h1>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Admin tools for environment cleanup. User accounts are never
          deleted.
        </p>
      </div>

      <Card className="border-red-200/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Delete test data
          </CardTitle>
          <CardDescription>
            Hard-delete selected categories. Irreversible. Prefer this for
            clearing seed or trial data before going live.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {CATEGORY_OPTIONS.map((option) => {
              const checked = selected.has(option.id);
              const forcedOn =
                option.id === "transactions" &&
                (selected.has("accounts") || selected.has("businesses"));
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-lg border border-zinc-200 bg-white p-3 transition-colors",
                    checked && "border-zinc-400 bg-zinc-50"
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-900"
                    checked={checked}
                    disabled={purging || forcedOn}
                    onChange={(e) => toggle(option.id, e.target.checked)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-zinc-950">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">
                      {option.description}
                      {forcedOn
                        ? " (required because accounts or businesses are selected)"
                        : null}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Only <strong className="font-medium">users</strong> are preserved.
            Everything in a selected category is permanently removed.
          </div>

          <Button
            variant="destructive"
            disabled={purging || selectedList.length === 0}
            onClick={onPurge}
            className="w-full sm:w-auto"
          >
            <Trash2 className="h-4 w-4" />
            {purging ? "Deleting…" : "Delete selected data"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
