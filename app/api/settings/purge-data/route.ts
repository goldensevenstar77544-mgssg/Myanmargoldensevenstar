import { NextResponse } from "next/server";
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
} from "firebase-admin/firestore";
import {
  getAdminAuth,
  getAdminDb,
  getAdminStorage,
  isAdminConfigured,
} from "@/lib/firebase/admin";

export type PurgeCategory =
  | "transactions"
  | "accounts"
  | "businesses"
  | "auditLogs";

type PurgeBody = {
  categories?: PurgeCategory[];
};

const VALID_CATEGORIES: PurgeCategory[] = [
  "transactions",
  "accounts",
  "businesses",
  "auditLogs",
];

const BATCH_LIMIT = 400;

async function requireApprover(
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
  if (!profile.exists || role !== "approver") {
    throw new Response(
      JSON.stringify({ error: "Approver access required" }),
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

async function commitInChunks(
  db: Firestore,
  refs: DocumentReference[]
): Promise<number> {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const chunk = refs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const ref of chunk) {
      batch.delete(ref);
    }
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

/** Delete all docs in a collection (one level). Returns count deleted. */
async function deleteCollection(
  db: Firestore,
  collectionPath: string
): Promise<number> {
  const snap = await db.collection(collectionPath).get();
  if (snap.empty) return 0;
  return commitInChunks(
    db,
    snap.docs.map((d) => d.ref)
  );
}

/**
 * Delete parent docs and each named subcollection under them.
 * Returns count of parent documents deleted (subdocs are deleted but not counted).
 */
async function deleteCollectionWithSubcollections(
  db: Firestore,
  collectionPath: string,
  subcollectionNames: string[]
): Promise<{ parents: number; children: number }> {
  const parents = await db.collection(collectionPath).get();
  if (parents.empty) return { parents: 0, children: 0 };

  let children = 0;
  for (const parent of parents.docs) {
    for (const sub of subcollectionNames) {
      const subSnap = await parent.ref.collection(sub).get();
      if (!subSnap.empty) {
        children += await commitInChunks(
          db,
          subSnap.docs.map((d) => d.ref)
        );
      }
    }
  }
  const parentCount = await commitInChunks(
    db,
    parents.docs.map((d) => d.ref)
  );
  return { parents: parentCount, children };
}

async function resetAccountBalances(db: Firestore): Promise<number> {
  const snap = await db.collection("accounts").get();
  if (snap.empty) return 0;

  let updated = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const chunk = snap.docs.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    for (const doc of chunk) {
      const opening = Number(doc.data().openingBalance ?? 0);
      batch.update(doc.ref, {
        currentBalance: opening,
        pendingCount: 0,
        approvedCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    updated += chunk.length;
  }
  return updated;
}

async function deleteStoragePrefix(prefix: string): Promise<number> {
  const bucketName =
    process.env.FIREBASE_ADMIN_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    console.warn(
      "Storage bucket not configured; skipping attachment file deletes"
    );
    return 0;
  }

  const bucket = getAdminStorage().bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) return 0;

  let deleted = 0;
  for (let i = 0; i < files.length; i += 50) {
    const chunk = files.slice(i, i + 50);
    await Promise.all(chunk.map((file) => file.delete({ ignoreNotFound: true })));
    deleted += chunk.length;
  }
  return deleted;
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

    await requireApprover(request);

    const body = (await request.json()) as PurgeBody;
    const raw = Array.isArray(body.categories) ? body.categories : [];
    const categories = [...new Set(raw)].filter((c): c is PurgeCategory =>
      VALID_CATEGORIES.includes(c as PurgeCategory)
    );

    if (categories.length === 0) {
      return NextResponse.json(
        { error: "Select at least one data category to delete" },
        { status: 400 }
      );
    }

    const wantsTransactions = categories.includes("transactions");
    const wantsAccounts = categories.includes("accounts");
    const wantsBusinesses = categories.includes("businesses");
    const wantsAuditLogs = categories.includes("auditLogs");

    if ((wantsAccounts || wantsBusinesses) && !wantsTransactions) {
      return NextResponse.json(
        {
          error:
            "Deleting accounts or businesses also requires deleting transactions",
        },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const deleted = {
      transactions: 0,
      accounts: 0,
      businesses: 0,
      auditLogs: 0,
      summaries: 0,
      counters: 0,
      files: 0,
      accountsReset: 0,
    };

    // Order: transactions (+ summaries/counters/balance reset) → accounts → businesses → auditLogs
    if (wantsTransactions) {
      deleted.transactions = await deleteCollection(db, "transactions");
      deleted.counters = await deleteCollection(db, "counters");
      const groupSummaries = await deleteCollectionWithSubcollections(
        db,
        "summaries",
        ["months"]
      );
      const bizSummaries = await deleteCollectionWithSubcollections(
        db,
        "businessSummaries",
        ["months"]
      );
      const acctSummaries = await deleteCollectionWithSubcollections(
        db,
        "accountSummaries",
        ["months"]
      );
      deleted.summaries +=
        groupSummaries.parents +
        groupSummaries.children +
        bizSummaries.parents +
        bizSummaries.children +
        acctSummaries.parents +
        acctSummaries.children;
      try {
        deleted.files = await deleteStoragePrefix("transactions/");
      } catch (storageError) {
        console.error("Storage purge failed (continuing)", storageError);
      }

      if (!wantsAccounts) {
        deleted.accountsReset = await resetAccountBalances(db);
      }
    }

    if (wantsAccounts) {
      deleted.accounts = await deleteCollection(db, "accounts");
      // accountSummaries already cleared with transactions; clear again if any remain
      const leftover = await deleteCollectionWithSubcollections(
        db,
        "accountSummaries",
        ["months"]
      );
      deleted.summaries += leftover.parents + leftover.children;
    }

    if (wantsBusinesses) {
      const biz = await deleteCollectionWithSubcollections(db, "businesses", [
        "fixedAssets",
      ]);
      deleted.businesses = biz.parents;
      const leftover = await deleteCollectionWithSubcollections(
        db,
        "businessSummaries",
        ["months"]
      );
      deleted.summaries += leftover.parents + leftover.children;
    }

    if (wantsAuditLogs) {
      deleted.auditLogs = await deleteCollection(db, "auditLogs");
    }

    return NextResponse.json({ deleted });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error("POST /api/settings/purge-data failed", error);
    return NextResponse.json(
      { error: "Failed to purge selected data" },
      { status: 500 }
    );
  }
}
