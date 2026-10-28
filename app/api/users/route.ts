import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminAuth,
  getAdminDb,
  isAdminConfigured,
} from "@/lib/firebase/admin";
import {
  ensureAdminConfigured,
  firebaseErrorCode,
  looksLikeAdminCredentialIssue,
  requireAppAdmin,
} from "@/lib/api/require-app-admin";
import type { UserRole } from "@/lib/types";

type CreateUserBody = {
  email?: string;
  password?: string;
  displayName?: string;
  role?: UserRole;
};

/** Authenticated admin check that Admin SDK env is present and PEM parses. */
export async function GET(request: Request) {
  try {
    const notConfigured = ensureAdminConfigured();
    if (notConfigured) {
      return NextResponse.json(
        {
          ok: false,
          adminConfigured: false,
          error:
            "Firebase Admin is not configured. Add FIREBASE_ADMIN_* env vars.",
        },
        { status: 503 }
      );
    }

    await requireAppAdmin(request);
    // Force credential/PEM parse so bad keys surface here.
    getAdminAuth();

    return NextResponse.json({ ok: true, adminConfigured: true });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : String(error ?? "");
    console.error("GET /api/users failed", error);
    return NextResponse.json(
      {
        ok: false,
        adminConfigured: isAdminConfigured(),
        error: /FIREBASE_ADMIN_|PRIVATE KEY|PEM|DECODER|credential/i.test(
          message
        )
          ? message
          : "Firebase Admin credentials failed to initialize",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const notConfigured = ensureAdminConfigured();
    if (notConfigured) return notConfigured;

    const actor = await requireAppAdmin(request);

    const body = (await request.json()) as CreateUserBody;
    const email = body.email?.trim().toLowerCase() || "";
    const password = body.password || "";
    const displayName = body.displayName?.trim() || "";
    const role = body.role;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }
    if (!displayName) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    if (
      role !== "admin" &&
      role !== "maker" &&
      role !== "checker" &&
      role !== "approver"
    ) {
      return NextResponse.json(
        {
          error:
            'Role must be "admin", "maker", "checker", or "approver"',
        },
        { status: 400 }
      );
    }

    const userRecord = await getAdminAuth().createUser({
      email,
      password,
      displayName,
    });

    const db = getAdminDb();
    await db.collection("users").doc(userRecord.uid).set({
      email,
      displayName,
      role,
      mustChangePassword: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    const actorName =
      actor.displayName || actor.email || "Admin";
    await db.collection("auditLogs").add({
      action: "created",
      entityType: "user",
      entityId: userRecord.uid,
      actorId: actor.uid,
      actorName,
      changes: [{ field: "role", from: null, to: role }],
      description: `${displayName} (${email}) · ${role}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id: userRecord.uid,
      email,
      displayName,
      role,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const code = firebaseErrorCode(error);

    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }
    if (code === "auth/invalid-email") {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 }
      );
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

    console.error("POST /api/users failed", error);
    return NextResponse.json(
      {
        error: credentialIssue
          ? "Firebase Admin credentials are invalid on this host. Check FIREBASE_ADMIN_PRIVATE_KEY (use \\n newlines)."
          : "Failed to create user",
      },
      { status: credentialIssue ? 503 : 500 }
    );
  }
}
