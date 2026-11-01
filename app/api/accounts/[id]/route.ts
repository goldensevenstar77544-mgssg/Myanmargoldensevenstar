import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  ensureAdminConfigured,
  looksLikeAdminCredentialIssue,
  requireAppAdmin,
} from "@/lib/api/require-app-admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function accountLabel(
  data: Record<string, unknown> | undefined,
  id: string
): string {
  if (!data) return id;
  const type = String(data.type || "");
  const name = String(data.name || "").trim();
  const bankName = String(data.bankName || "").trim();
  const accountNumber = String(data.accountNumber || "").trim();
  if (type === "cash") {
    return name ? `${name} (Cash)` : "Cash account";
  }
  if (!bankName) {
    return name ? `${name} (Bank)` : "Bank account";
  }
  const primary = [bankName, accountNumber].filter(Boolean).join(" · ");
  if (name && name.toLowerCase() !== bankName.toLowerCase()) {
    return `${primary} — ${name}`;
  }
  return primary;
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const notConfigured = ensureAdminConfigured();
    if (notConfigured) return notConfigured;

    const actor = await requireAppAdmin(request);
    const { id: rawId } = await context.params;
    const id = rawId?.trim() || "";
    if (!id) {
      return NextResponse.json(
        { error: "Account id is required" },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const accountRef = db.collection("accounts").doc(id);
    const accountSnap = await accountRef.get();
    if (!accountSnap.exists) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const txSnap = await db
      .collection("transactions")
      .where("accountId", "==", id)
      .limit(1)
      .get();
    if (!txSnap.empty) {
      return NextResponse.json(
        {
          error:
            "This account has transactions and cannot be deleted. Deactivate it instead.",
        },
        { status: 409 }
      );
    }

    const holdingsSnap = await db
      .collection("businessAccountBalances")
      .where("accountId", "==", id)
      .get();
    if (!holdingsSnap.empty) {
      const batch = db.batch();
      for (const doc of holdingsSnap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }

    const summaryRef = db.collection("accountSummaries").doc(id);
    const monthsSnap = await summaryRef.collection("months").get();
    if (!monthsSnap.empty) {
      const batch = db.batch();
      for (const doc of monthsSnap.docs) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }
    const summarySnap = await summaryRef.get();
    if (summarySnap.exists) {
      await summaryRef.delete();
    }

    const label = accountLabel(
      accountSnap.data() as Record<string, unknown> | undefined,
      id
    );
    await accountRef.delete();

    const actorName = actor.displayName || actor.email || "Admin";
    await db.collection("auditLogs").add({
      action: "deleted",
      entityType: "account",
      entityId: id,
      actorId: actor.uid,
      actorName,
      description: `Deleted ${label}`,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    const message =
      error instanceof Error ? error.message : String(error ?? "");
    const credentialIssue = looksLikeAdminCredentialIssue(message);

    console.error("DELETE /api/accounts/[id] failed", error);
    return NextResponse.json(
      {
        error: credentialIssue
          ? "Firebase Admin credentials are invalid on this host. Check FIREBASE_ADMIN_PRIVATE_KEY (use \\n newlines)."
          : "Failed to delete account",
      },
      { status: credentialIssue ? 503 : 500 }
    );
  }
}
