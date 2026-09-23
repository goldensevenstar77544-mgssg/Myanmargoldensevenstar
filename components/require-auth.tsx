"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { AppShell } from "@/components/app-shell";
import { LoadingState } from "@/components/loading-state";
import { canAccessAppPath, homePathForRole } from "@/lib/permissions";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { firebaseUser, profile, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && configured && !firebaseUser) {
      router.replace("/login");
    }
  }, [loading, configured, firebaseUser, router]);

  useEffect(() => {
    if (!loading && firebaseUser && profile?.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [loading, firebaseUser, profile, router]);

  useEffect(() => {
    if (loading || !firebaseUser || !profile || profile.mustChangePassword) {
      return;
    }
    if (!canAccessAppPath(profile, pathname)) {
      router.replace(homePathForRole(profile));
    }
  }, [loading, firebaseUser, profile, pathname, router]);

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Firebase not configured</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Copy <code className="rounded bg-zinc-100 px-1">.env.local.example</code>{" "}
            to <code className="rounded bg-zinc-100 px-1">.env.local</code> and add
            your Firebase web app credentials.
          </p>
        </div>
      </div>
    );
  }

  // Signed in but profile not ready yet — paint shell chrome immediately.
  if (firebaseUser && !profile) {
    return (
      <AppShell>
        <LoadingState variant="page" />
      </AppShell>
    );
  }

  if (loading && !firebaseUser) {
    return <LoadingState variant="screen" className="bg-zinc-50" />;
  }

  if (!firebaseUser || !profile) {
    return <LoadingState variant="screen" className="bg-zinc-50" />;
  }

  if (profile.mustChangePassword) {
    return <LoadingState variant="screen" className="bg-zinc-50" />;
  }

  if (!canAccessAppPath(profile, pathname)) {
    return (
      <AppShell>
        <LoadingState variant="page" />
      </AppShell>
    );
  }

  return <AppShell>{children}</AppShell>;
}
