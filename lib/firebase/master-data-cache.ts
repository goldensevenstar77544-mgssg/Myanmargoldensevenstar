import type { Account, Business } from "@/lib/types";

const TTL_MS = 60_000;

type CacheEntry<T> = {
  value: T;
  loadedAt: number;
};

let businessesCache: CacheEntry<Business[]> | null = null;
let accountsCache: CacheEntry<Account[]> | null = null;

function fresh<T>(entry: CacheEntry<T> | null): T | null {
  if (!entry) return null;
  if (Date.now() - entry.loadedAt > TTL_MS) return null;
  return entry.value;
}

export function getCachedBusinesses(): Business[] | null {
  return fresh(businessesCache);
}

export function setCachedBusinesses(value: Business[]): void {
  businessesCache = { value, loadedAt: Date.now() };
}

export function invalidateBusinessesCache(): void {
  businessesCache = null;
}

export function getCachedAccounts(): Account[] | null {
  return fresh(accountsCache);
}

export function setCachedAccounts(value: Account[]): void {
  accountsCache = { value, loadedAt: Date.now() };
}

export function invalidateAccountsCache(): void {
  accountsCache = null;
}

export function invalidateMasterDataCache(): void {
  invalidateBusinessesCache();
  invalidateAccountsCache();
}
