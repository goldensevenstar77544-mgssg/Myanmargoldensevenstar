"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from "firebase/auth";
import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { useConfirm } from "@/components/confirm-dialog";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearMustChangePassword } from "@/lib/firebase/firestore";
import { homePathForRole } from "@/lib/permissions";

export default function ChangePasswordPage() {
  const { firebaseUser, profile, loading, configured, refreshProfile, signOut } =
    useAuth();
  const confirm = useConfirm();
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && configured && !firebaseUser) {
      router.replace("/login");
    }
  }, [loading, configured, firebaseUser, router]);

  useEffect(() => {
    if (!loading && firebaseUser && profile && !profile.mustChangePassword) {
      router.replace(homePathForRole(profile));
    }
  }, [loading, firebaseUser, profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!firebaseUser?.email) return;

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the temporary password.");
      return;
    }

    setSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(
        firebaseUser.email,
        currentPassword
      );
      await reauthenticateWithCredential(firebaseUser, credential);
      await updatePassword(firebaseUser, newPassword);
      await clearMustChangePassword(firebaseUser.uid);
      await refreshProfile();
      router.replace(homePathForRole(profile));
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (
        code === "auth/wrong-password" ||
        code === "auth/invalid-credential"
      ) {
        setError("Current password is incorrect.");
      } else if (code === "auth/weak-password") {
        setError("New password is too weak.");
      } else {
        setError("Could not update password. Try again.");
      }
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!configured || loading || !firebaseUser || !profile) {
    return (
      <LoadingState variant="screen" size="lg" className="bg-black text-white" />
    );
  }

  if (!profile.mustChangePassword) {
    return (
      <LoadingState variant="screen" size="lg" className="bg-black text-white" />
    );
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-black p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.08)_0%,_transparent_55%)]"
        aria-hidden
      />

      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-white p-6 text-black shadow-2xl sm:p-8">
        <div className="mb-6 space-y-4">
          <BrandLogo sizeClassName="h-12 w-12" priority />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Set a new password
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Your account was created with a temporary password. Choose a new
              one to continue.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current" className="text-zinc-800">
              Current password
            </Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="border-zinc-300 bg-white text-black focus-visible:ring-black"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new" className="text-zinc-800">
              New password
            </Label>
            <Input
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
              className="border-zinc-300 bg-white text-black focus-visible:ring-black"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-zinc-800">
              Confirm new password
            </Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              className="border-zinc-300 bg-white text-black focus-visible:ring-black"
            />
          </div>
          {error && (
            <p className="border-l-2 border-black pl-3 text-sm text-zinc-800">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="w-full bg-black text-white hover:bg-zinc-900"
            disabled={submitting}
          >
            {submitting ? "Updating…" : "Update password"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
            onClick={async () => {
              const ok = await confirm({
                title: "Sign out?",
                description: "You will need to sign in again to continue.",
                confirmLabel: "Sign out",
              });
              if (!ok) return;
              await signOut();
              router.replace("/login");
            }}
          >
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
