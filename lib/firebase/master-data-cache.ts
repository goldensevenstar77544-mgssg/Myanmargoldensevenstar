import type { Account, Business } from "@/lib/types";

/** Session-long cache until explicit invalidation (writes clear it). */
type CacheEntry<T> = {
  value: T;
};

let businessesCache: CacheEntry<Business[]> | null = null;
let accountsCache: CacheEntry<Account[]> | null = null;

export function getCachedBusinesses(): Business[] | null {
  return businessesCache?.value ?? null;
}

export function setCachedBusinesses(value: Business[]): void {
  businessesCache = { value };
}

export function invalidateBusinessesCache(): void {
  businessesCache = null;
}

export function getCachedAccounts(): Account[] | null {
  return accountsCache?.value ?? null;
}

export function setCachedAccounts(value: Account[]): void {
  accountsCache = { value };
}

export function invalidateAccountsCache(): void {
  accountsCache = null;
}

export function invalidateMasterDataCache(): void {
  invalidateBusinessesCache();
  invalidateAccountsCache();
}
