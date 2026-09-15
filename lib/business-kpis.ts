export function businessComputedBalance(income: number, expense: number): number {
  return income - expense;
}

/** Variance vs reported profit when totalProfit is set. */
export function businessCheckBalance(
  computedBalance: number,
  totalProfit: number | undefined
): number | null {
  if (totalProfit === undefined || totalProfit === null) return null;
  return computedBalance - totalProfit;
}

export function groupBankTotal(accounts: { currentBalance: number }[]): number {
  return accounts.reduce((sum, a) => sum + (Number(a.currentBalance) || 0), 0);
}

export function groupCheckBalance(
  sumBusinessBalances: number,
  bankTotal: number
): number {
  return sumBusinessBalances - bankTotal;
}
