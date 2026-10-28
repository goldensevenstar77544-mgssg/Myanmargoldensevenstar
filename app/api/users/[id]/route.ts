import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import {
  ensureAdminConfigured,
  firebaseErrorCode,
  looksLikeAdminCredentialIssue,
  requireAppAdmin,
} from "@/lib/api/require-app-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ResetPasswordBody = {
  action?: string;
  password?: string;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const notConfigured = ensureAdminConfigured();
    if (notConfigured) return notConfigured;

    const actor = await requireAppAdmin(request);
    const { id } = await context.params;
    const uid = id?.trim() || "";
    if (!uid) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }
    if (uid === actor.uid) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const profileRef = db.collection("users").doc(uid);
    const profileSnap = await profileRef.get();
    const profileData = profileSnap.data();
    const label =
      String(profileData?.displayName || "").trim() ||
      String(profileData?.email || "").trim() ||
      uid;

    await getAdminAuth().deleteUser(uid);

    if (profileSnap.exists) {
      await profileRef.delete();
    }

    const actorName = actor.displayName || actor.email || "Admin";
    await db.collection("auditLogs").add({
      action: "deleted",
      entityType: "user",
      entityId: uid,
      actorId: actor.uid,
      actorName,
      description: `Deleted ${label}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: uid });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const code = firebaseErrorCode(error);
    if (code === "auth/user-not-found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const message =
      error instanceof Error ? error.message : String(error ?? "");
    const credentialIssue = looksLikeAdminCredentialIssue(message);

    console.error("DELETE /api/users/[id] failed", error);
    return NextResponse.json(
      {
        error: credentialIssue
          ? "Firebase Admin credentials are invalid on this host. Check FIREBASE_ADMIN_PRIVATE_KEY (use \\n newlines)."
          : "Failed to delete user",
      },
      { status: credentialIssue ? 503 : 500 }
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const notConfigured = ensureAdminConfigured();
    if (notConfigured) return notConfigured;

    const actor = await requireAppAdmin(request);
    const { id } = await context.params;
    const uid = id?.trim() || "";
    if (!uid) {
      return NextResponse.json({ error: "User id is required" }, { status: 400 });
    }

    const body = (await request.json()) as ResetPasswordBody;
    if (body.action !== "resetPassword") {
      return NextResponse.json(
        { error: 'action must be "resetPassword"' },
        { status: 400 }
      );
    }

    const password = body.password || "";
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const profileRef = db.collection("users").doc(uid);
    const profileSnap = await profileRef.get();
    if (!profileSnap.exists) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const profileData = profileSnap.data()!;
    const label =
      String(profileData.displayName || "").trim() ||
      String(profileData.email || "").trim() ||
      uid;

    const auth = getAdminAuth();
    await auth.updateUser(uid, { password });
    await auth.revokeRefreshTokens(uid);
    await profileRef.update({
      mustChangePassword: true,
    });

    const actorName = actor.displayName || actor.email || "Admin";
    await db.collection("auditLogs").add({
      action: "updated",
      entityType: "user",
      entityId: uid,
      actorId: actor.uid,
      actorName,
      changes: [{ field: "password", from: null, to: "(reset)" }],
      description: `Password reset for ${label}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: uid });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const code = firebaseErrorCode(error);
    if (code === "auth/user-not-found") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (code === "auth/invalid-password") {
      return NextResponse.json(
        { error: "Password does not meet Firebase requirements" },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : String(error ?? "");
    const credentialIssue = looksLikeAdminCredentialIssue(message);

    console.error("POST /api/users/[id] resetPassword failed", error);
    return NextResponse.json(
      {
        error: credentialIssue
          ? "Firebase Admin credentials are invalid on this host. Check FIREBASE_ADMIN_PRIVATE_KEY (use \\n newlines)."
          : "Failed to reset password",
      },
      { status: credentialIssue ? 503 : 500 }
    );
  }
}
