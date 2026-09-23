import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { getClientDb } from "@/lib/firebase/client";
import { toDate } from "@/lib/firebase/converters";
import type { AppUser, UserRole } from "@/lib/types";

function mapUser(data: DocumentData, id: string): AppUser {
  return {
    id,
    email: data.email ?? "",
    displayName: data.displayName ?? "",
    role: (data.role as UserRole | null) ?? null,
    mustChangePassword: Boolean(data.mustChangePassword),
    createdAt: toDate(data.createdAt),
  };
}

/** Lightweight profile bootstrap for the auth critical path. */
export async function ensureUserProfile(params: {
  uid: string;
  email: string;
  displayName?: string | null;
}): Promise<AppUser> {
  const db = getClientDb();
  const ref = doc(db, "users", params.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return mapUser(snap.data(), snap.id);
  }
  const payload = {
    email: params.email,
    displayName: params.displayName || params.email.split("@")[0],
    role: null as UserRole | null,
    createdAt: serverTimestamp(),
  };
  await setDoc(ref, payload);
  return {
    id: params.uid,
    email: payload.email,
    displayName: payload.displayName,
    role: null,
    mustChangePassword: false,
    createdAt: new Date(),
  };
}
