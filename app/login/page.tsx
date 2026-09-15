"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { LoadingState } from "@/components/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { homePathForRole } from "@/lib/permissions";
import { PiggyBank } from "lucide-react";

export default function LoginPage() {
  const { signIn, firebaseUser, profile, loading, configured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && firebaseUser && profile) {
      if (profile.mustChangePassword) {
        router.replace("/change-password");
        return;
      }
      router.replace(homePathForRole(profile));
    }
  }, [loading, firebaseUser, profile, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // Redirect runs via useEffect once profile is loaded.
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: string }).code)
          : "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password" ||
        code === "auth/user-not-found" ||
        code === "auth/invalid-email"
      ) {
        setError("Invalid email or password.");
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Try again later.");
      } else if (code === "auth/invalid-api-key") {
        setError(
          "Firebase API key is invalid. Check .env.local and restart the server."
        );
      } else if (code) {
        setError(`Sign-in failed (${code}).`);
      } else {
        setError("Sign-in failed. Check the browser console for details.");
      }
      console.error("Login error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!configured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white p-8 text-black shadow-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            Firebase not configured
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Add your Firebase credentials to `.env.local` before signing in.
          </p>
        </div>
      </div>
    );
  }

  if (loading || firebaseUser) {
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.08)_0%,_transparent_55%)]" aria-hidden />

      <div className="relative w-full max-w-md rounded-2xl border border-white/15 bg-white p-6 text-black shadow-2xl sm:p-8">
        <div className="mb-6 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
            <PiggyBank className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Golden 7 Finance
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Sign in to manage group income, expenses, and approvals.
            </p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-zinc-800">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-zinc-300 bg-white text-black focus-visible:ring-black"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-zinc-800">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
