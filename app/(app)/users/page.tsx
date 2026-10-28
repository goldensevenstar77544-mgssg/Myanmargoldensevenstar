"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2 } from "lucide-react";
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
  canViewUsers,
  roleLabel,
  userDisplayName,
} from "@/lib/permissions";
import type { AppUser, UserRole } from "@/lib/types";
import { useLoadOnMount } from "@/lib/use-load-on-mount";

const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "maker",
  "checker",
  "approver",
];

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

  const [resetUser, setResetUser] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  if (!canViewUsers(profile)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access required</CardTitle>
          <CardDescription>
            Only Admins and Checkers can view user accounts.
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

  function openReset(user: AppUser) {
    setResetUser(user);
    setResetPassword("");
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;

    const nextEmail = email.trim();
    const nextName = displayName.trim();
    if (!nextName) {
      toast.error("Display name is required");
      return;
    }
    if (!nextEmail || !nextEmail.includes("@")) {
      toast.error("Valid email is required");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

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
          email: nextEmail,
          password,
          displayName: nextName,
          role,
        }),
      });
      const data = await parseApiJson(res, "Create user failed");
      if (!res.ok) {
        throw new Error(data.error || `Failed to create user (HTTP ${res.status})`);
      }
      toast.success("User created");
      setOpen(false);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Failed to create user"));
    } finally {
      setSaving(false);
    }
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !resetUser) return;
    if (resetPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setResetting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/users/${resetUser.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "resetPassword",
          password: resetPassword,
        }),
      });
      const data = await parseApiJson(res, "Reset password failed");
      if (!res.ok) {
        throw new Error(
          data.error || `Failed to reset password (HTTP ${res.status})`
        );
      }
      toast.success(
        "Password reset. Share it securely — they must change it on next login."
      );
      setResetUser(null);
      setResetPassword("");
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Failed to reset password"));
    } finally {
      setResetting(false);
    }
  }

  async function onDelete(user: AppUser) {
    if (!firebaseUser || !profile) return;
    if (user.id === profile.id) {
      toast.error("You cannot delete your own account");
      return;
    }
    const ok = await confirm({
      title: "Delete user?",
      description: `Delete ${user.displayName || user.email}? This removes their login and cannot be undone.`,
      confirmLabel: "Delete user",
      variant: "destructive",
    });
    if (!ok) return;

    setDeletingId(user.id);
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await parseApiJson(res, "Delete user failed");
      if (!res.ok) {
        throw new Error(data.error || `Failed to delete user (HTTP ${res.status})`);
      }
      toast.success("User deleted");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(apiErrorMessage(error, "Failed to delete user"));
    } finally {
      setDeletingId(null);
    }
  }

  async function onRoleChange(user: AppUser, nextRole: UserRole) {
    if (!profile) return;
    if (user.role === nextRole) return;
    if (user.id === profile.id && nextRole !== "admin") {
      toast.error("You cannot remove your own Admin role");
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
            {canManage
              ? "Create Admin, Maker, Checker, and Approver accounts"
              : "View user accounts"}
            {users.length > 0
              ? ` · ${users.length} user${users.length === 1 ? "" : "s"}`
              : ""}
            {canManage ? ". Share the initial password securely." : "."}
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
                  {canManage && (
                    <TableHead className="w-[160px]">Actions</TableHead>
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
                              (ASSIGNABLE_ROLES as string[]).includes(v)
                            ) {
                              void onRoleChange(user, v as UserRole);
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
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="maker">Maker</SelectItem>
                            <SelectItem value="checker">Checker</SelectItem>
                            <SelectItem value="approver">Approver</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {canManage && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openReset(user)}
                            disabled={resetting || deletingId === user.id}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            Reset
                          </Button>
                          {user.id !== profile?.id ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void onDelete(user)}
                              disabled={deletingId === user.id || resetting}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {deletingId === user.id ? "…" : "Delete"}
                            </Button>
                          ) : null}
                        </div>
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
          {/* noValidate: WebKit type=email shows "string did not match the expected pattern" */}
          <form onSubmit={onCreate} noValidate>
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
                  type="text"
                  inputMode="email"
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
                    <SelectItem value="admin">Admin</SelectItem>
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

      {canManage && (
        <Dialog
          open={Boolean(resetUser)}
          onOpenChange={(next) => {
            if (!next) {
              setResetUser(null);
              setResetPassword("");
            }
          }}
        >
          <DialogContent>
            <form onSubmit={onResetPassword} noValidate>
              <DialogHeader>
                <DialogTitle>Reset password</DialogTitle>
              </DialogHeader>
              <div className="mt-4 space-y-4">
                <p className="text-sm text-zinc-500">
                  Set a temporary password for{" "}
                  <span className="font-medium text-zinc-800">
                    {resetUser?.displayName || resetUser?.email}
                  </span>
                  . They must change it on next login.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="resetPassword">New password</Label>
                  <Input
                    id="resetPassword"
                    type="password"
                    autoComplete="new-password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-zinc-500">
                    At least 8 characters. Share this password securely.
                  </p>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setResetUser(null);
                    setResetPassword("");
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={resetting}>
                  {resetting ? "Resetting…" : "Reset password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
