"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  createBusiness,
  listBusinesses,
  updateBusiness,
} from "@/lib/firebase/firestore";
import { canManageMasterData } from "@/lib/permissions";
import type { Business } from "@/lib/types";
import { useLoadOnMount } from "@/lib/use-load-on-mount";
import { Plus } from "lucide-react";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";

export default function BusinessesPage() {
  const { profile } = useAuth();
  const confirm = useConfirm();
  const canManage = canManageMasterData(profile);
  const [items, setItems] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listBusinesses());
    } catch (error) {
      console.error(error);
      toast.error("Failed to load businesses");
    } finally {
      setLoading(false);
    }
  }, []);

  useLoadOnMount(load);

  function openCreate() {
    setEditing(null);
    setName("");
    setCode("");
    setNotes("");
    setOpen(true);
  }

  function openEdit(business: Business) {
    setEditing(business);
    setName(business.name);
    setCode(business.code);
    setNotes(business.notes || "");
    setOpen(true);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (editing) {
      const ok = await confirm({
        title: "Save business changes?",
        description: `Update details for “${editing.name}”.`,
        confirmLabel: "Save changes",
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateBusiness(editing.id, {
          name,
          code,
          notes,
        });
        toast.success("Business updated");
      } else {
        await createBusiness({ name, code, notes });
        toast.success("Business created");
      }
      setOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not save business"
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(business: Business) {
    const nextActive = business.status !== "active";
    const ok = await confirm({
      title: nextActive
        ? "Activate this business?"
        : "Deactivate this business?",
      description: nextActive
        ? `“${business.name}” will be available for new transactions.`
        : `“${business.name}” will no longer be available for new transactions.`,
      confirmLabel: nextActive ? "Activate" : "Deactivate",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await updateBusiness(business.id, {
        status: nextActive ? "active" : "inactive",
      });
      toast.success(
        nextActive ? "Business activated" : "Business deactivated"
      );
      setOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Could not update status"
      );
    }
  }

  const activeCount = useMemo(
    () => items.filter((b) => b.status === "active").length,
    [items]
  );

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Businesses</h1>
          <p className="text-sm text-zinc-500">
            {activeCount} active of {items.length} total
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="hidden md:inline-flex">
            <Plus className="h-4 w-4" />
            New business
          </Button>
        )}
      </div>

      {canManage && (
        <MobileFabStack>
          <MobileFab label="New business" onClick={openCreate} />
        </MobileFabStack>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Group businesses</CardTitle>
          <CardDescription>
            Separate financial records for each Golden 7 business unit.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">
              No businesses yet.
              {canManage ? " Create the first business to get started." : ""}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((business) => (
                  <TableRow key={business.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/businesses/${business.id}`}
                        className="text-zinc-900 underline-offset-4 hover:underline"
                      >
                        {business.name}
                      </Link>
                    </TableCell>
                    <TableCell>{business.code}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          business.status === "active" ? "success" : "secondary"
                        }
                      >
                        {business.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-zinc-500">
                      {business.notes || "—"}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => openEdit(business)}
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
                {editing ? "Edit business" : "Create business"}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
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
