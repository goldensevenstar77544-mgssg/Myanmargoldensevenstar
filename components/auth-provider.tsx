"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { getClientAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { ensureUserProfile } from "@/lib/firebase/user-profile";
import type { AppUser } from "@/lib/types";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: AppUser | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PROFILE_CACHE_KEY = "g7-profile-cache";

function readCachedProfile(uid: string): AppUser | null {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUser & { createdAt: string };
    if (parsed.id !== uid) return null;
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
    };
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: AppUser) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
  } catch {
    // ignore quota / private mode
  }
}

function clearCachedProfile() {
  try {
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(() => isFirebaseConfigured());

  const loadProfile = useCallback(async (user: User) => {
    const next = await ensureUserProfile({
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName,
    });
    setProfile(next);
    writeCachedProfile(next);
  }, []);

  useEffect(() => {
    if (!configured) {
      return;
    }
    const auth = getClientAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const cached = readCachedProfile(user.uid);
        if (cached) setProfile(cached);
        try {
          await loadProfile(user);
        } catch (error) {
          console.error("Failed to load user profile", error);
          if (!cached) setProfile(null);
        }
      } else {
        setProfile(null);
        clearCachedProfile();
      }
      setLoading(false);
    });
    return () => unsub();
  }, [configured, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getClientAuth(), email, password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getClientAuth());
    setProfile(null);
    clearCachedProfile();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUser) return;
    await loadProfile(firebaseUser);
  }, [firebaseUser, loadProfile]);

  const value = useMemo(
    () => ({
      firebaseUser,
      profile,
      loading,
      configured,
      signIn,
      signOut,
      refreshProfile,
    }),
    [
      firebaseUser,
      profile,
      loading,
      configured,
      signIn,
      signOut,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
