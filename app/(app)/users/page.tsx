"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listUsers, updateUserProfile } from "@/lib/firebase/firestore";
import {
  canManageMasterData,
  isFinanceAdmin,
  roleLabel,
  userDisplayName,
} from "@/lib/permissions";
import type { AppUser, UserRole } from "@/lib/types";
import { useLoadOnMount } from "@/lib/use-load-on-mount";

export default function UsersPage() {
  const { profile, firebaseUser } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("maker");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await listUsers());
    } catch (error) {
      console.error(error);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useLoadOnMount(load);

  const canManage = canManageMasterData(profile);

  if (!isFinanceAdmin(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Staff access required</CardTitle>
          <CardDescription>
            Only Checkers and Approvers can manage user accounts.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  function openCreate() {
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("maker");
    setOpen(true);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          password,
          displayName,
          role,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user");
      }
      toast.success("User created");
      setOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create user"
      );
    } finally {
      setSaving(false);
    }
  }

  async function onRoleChange(user: AppUser, nextRole: UserRole) {
    if (!profile) return;
    if (user.role === nextRole) return;
    if (user.id === profile.id && nextRole !== "checker") {
      toast.error("You cannot remove your own Checker role");
      return;
    }
    const ok = await confirm({
      title: "Change user role?",
      description: `Change ${user.displayName || user.email} from ${roleLabel(user.role)} to ${roleLabel(nextRole)}.`,
      confirmLabel: "Change role",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await updateUserProfile(
        user.id,
        { role: nextRole },
        {
          actorId: profile.id,
          actorName: userDisplayName(profile),
        }
      );
      toast.success("Role updated");
      await load();
    } catch (error) {
      console.error(error);
      toast.error("Could not update role");
    }
  }

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-zinc-500">
            Create Maker, Checker, and Approver accounts
            {users.length > 0
              ? ` · ${users.length} user${users.length === 1 ? "" : "s"}`
              : ""}
            . Share the initial password securely.
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate} className="hidden md:inline-flex">
            <Plus className="h-4 w-4" />
            New user
          </Button>
        )}
      </div>

      {canManage && (
        <MobileFabStack>
          <MobileFab label="New user" onClick={openCreate} />
        </MobileFabStack>
      )}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <LoadingState variant="page" />
          ) : users.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead className="sticky left-0 z-10 bg-zinc-50">
                    Name
                  </TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {canManage && (
                    <TableHead className="w-[180px]">Change role</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user, index) => (
                  <TableRow key={user.id}>
                    <TableCell className="tabular-nums text-zinc-500">
                      {index + 1}
                    </TableCell>
                    <TableCell className="sticky left-0 z-10 bg-white font-medium">
                      {user.displayName || "—"}
                      {user.id === profile?.id ? (
                        <span className="ml-2 text-xs text-zinc-400">(you)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={user.role} />
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Select
                          key={`${user.id}-${user.role ?? "unassigned"}`}
                          value={user.role ?? "unassigned"}
                          onValueChange={(v) => {
                            if (
                              v === "maker" ||
                              v === "checker" ||
                              v === "approver"
                            ) {
                              void onRoleChange(user, v);
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {!user.role && (
                              <SelectItem value="unassigned" disabled>
                                Unassigned
                              </SelectItem>
                            )}
                            <SelectItem value="maker">Maker</SelectItem>
                            <SelectItem value="checker">Checker</SelectItem>
                            <SelectItem value="approver">Approver</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={onCreate}>
            <DialogHeader>
              <DialogTitle>Create user</DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Initial password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  required
                />
                <p className="text-xs text-zinc-500">
                  At least 8 characters. Share this password securely with the
                  user.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as UserRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maker">Maker</SelectItem>
                    <SelectItem value="checker">Checker</SelectItem>
                    <SelectItem value="approver">Approver</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      )}
    </div>
  );
}
