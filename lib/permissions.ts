import type { AppUser, Transaction, UserRole } from "@/lib/types";

export function isChecker(user: AppUser | null | undefined): boolean {
  return user?.role === "checker";
}

export function isMaker(user: AppUser | null | undefined): boolean {
  return user?.role === "maker";
}

export function isApprover(user: AppUser | null | undefined): boolean {
  return user?.role === "approver";
}

/** Checker or Approver — full admin create/edit (same as Checker). */
export function isFinanceAdmin(user: AppUser | null | undefined): boolean {
  return isChecker(user) || isApprover(user);
}

export function canManageMasterData(user: AppUser | null | undefined): boolean {
  return isFinanceAdmin(user);
}

export function canCreateTransaction(user: AppUser | null | undefined): boolean {
  return isMaker(user) || isFinanceAdmin(user);
}

export function canEditTransaction(
  user: AppUser | null | undefined,
  tx: Pick<Transaction, "makerId" | "status">
): boolean {
  if (!user) return false;
  if (tx.status !== "pending") return false;
  if (isFinanceAdmin(user)) return true;
  return isMaker(user) && tx.makerId === user.id;
}

export function canApproveOrReject(
  user: AppUser | null | undefined,
  tx: Pick<Transaction, "makerId" | "status">
): boolean {
  if (!user || !isApprover(user)) return false;
  return tx.status === "pending";
}

export function canAccessAppPath(
  user: AppUser | null | undefined,
  pathname: string
): boolean {
  if (!user) return false;
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return isApprover(user);
  }
  if (isFinanceAdmin(user)) return true;
  if (isMaker(user)) {
    return pathname === "/transactions" || pathname.startsWith("/transactions/");
  }
  // Unassigned users can open the dashboard to see the missing-role message.
  return pathname === "/";
}

export function homePathForRole(user: AppUser | null | undefined): string {
  return isMaker(user) ? "/transactions" : "/";
}

export function roleLabel(role: UserRole | null | undefined): string {
  if (role === "checker") return "Checker";
  if (role === "maker") return "Maker";
  if (role === "approver") return "Approver";
  return "Unassigned";
}

export function userDisplayName(user: {
  displayName?: string | null;
  email?: string | null;
} | null | undefined): string {
  return user?.displayName?.trim() || user?.email?.trim() || "Unknown";
}

/** Resolve approve actor from new or legacy fields. */
export function transactionApproverId(
  tx: Pick<Transaction, "approverId" | "checkerId">
): string | undefined {
  return tx.approverId || tx.checkerId;
}

export function transactionApproverName(
  tx: Pick<Transaction, "approverName" | "checkerName">
): string | undefined {
  return tx.approverName || tx.checkerName;
}
