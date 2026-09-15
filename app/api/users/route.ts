import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import {
  getAdminAuth,
  getAdminDb,
  isAdminConfigured,
} from "@/lib/firebase/admin";
import type { UserRole } from "@/lib/types";

type CreateUserBody = {
  email?: string;
  password?: string;
  displayName?: string;
  role?: UserRole;
};

async function requireFinanceAdmin(
  request: Request
): Promise<{ uid: string; displayName: string; email: string }> {
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
  if (!profile.exists || (role !== "checker" && role !== "approver")) {
    throw new Response(
      JSON.stringify({ error: "Checker or Approver access required" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  const data = profile.data()!;
  return {
    uid: decoded.uid,
    displayName: String(data.displayName || "").trim(),
    email: String(data.email || "").trim(),
  };
}

export async function POST(request: Request) {
  try {
    if (!isAdminConfigured()) {
      return NextResponse.json(
        {
          error:
            "Firebase Admin is not configured. Add FIREBASE_ADMIN_* env vars.",
        },
        { status: 503 }
      );
    }

    const actor = await requireFinanceAdmin(request);

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
    if (role !== "maker" && role !== "checker" && role !== "approver") {
      return NextResponse.json(
        { error: 'Role must be "maker", "checker", or "approver"' },
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
      actor.displayName || actor.email || "Checker";
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

    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: string }).code)
        : "";

    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }
    if (code === "auth/invalid-password") {
      return NextResponse.json(
        { error: "Password does not meet Firebase requirements" },
        { status: 400 }
      );
    }

    console.error("POST /api/users failed", error);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
