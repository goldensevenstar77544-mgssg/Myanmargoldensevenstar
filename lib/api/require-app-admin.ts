import { NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminDb,
  isAdminConfigured,
} from "@/lib/firebase/admin";

export type AppAdminActor = {
  uid: string;
  displayName: string;
  email: string;
};

export function adminNotConfiguredResponse() {
  return NextResponse.json(
    {
      error:
        "Firebase Admin is not configured. Add FIREBASE_ADMIN_* env vars.",
    },
    { status: 503 }
  );
}

export function ensureAdminConfigured(): NextResponse | null {
  if (!isAdminConfigured()) {
    return adminNotConfiguredResponse();
  }
  return null;
}

export async function requireAppAdmin(
  request: Request
): Promise<AppAdminActor> {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const decoded = await getAdminAuth().verifyIdToken(match[1]);
  const profile = await getAdminDb().collection("users").doc(decoded.uid).get();
  const role = profile.data()?.role;
  if (!profile.exists || role !== "admin") {
    throw new Response(JSON.stringify({ error: "Admin access required" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const data = profile.data()!;
  return {
    uid: decoded.uid,
    displayName: String(data.displayName || "").trim(),
    email: String(data.email || "").trim(),
  };
}

export function firebaseErrorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error
    ? String((error as { code: string }).code)
    : "";
}

export function looksLikeAdminCredentialIssue(message: string): boolean {
  return /FIREBASE_ADMIN_|private key|PEM|DECODER|credential|service account/i.test(
    message
  );
}
