import type { AppUser, Transaction, UserRole } from "@/lib/types";

export function isAdmin(user: AppUser | null | undefined): boolean {
  return user?.role === "admin";
}

export function isChecker(user: AppUser | null | undefined): boolean {
  return user?.role === "checker";
}

export function isMaker(user: AppUser | null | undefined): boolean {
  return user?.role === "maker";
}

export function isApprover(user: AppUser | null | undefined): boolean {
  return user?.role === "approver";
}

/** @deprecated Prefer isAdmin — master-data / user management is admin-only. */
export function isFinanceAdmin(user: AppUser | null | undefined): boolean {
  return isAdmin(user);
}

export function canManageMasterData(user: AppUser | null | undefined): boolean {
  return isAdmin(user);
}

export function canCreateTransaction(user: AppUser | null | undefined): boolean {
  return isMaker(user) || isAdmin(user);
}

export function canEditTransaction(
  user: AppUser | null | undefined,
  tx: Pick<Transaction, "makerId" | "status">
): boolean {
  if (!user) return false;
  if (tx.status !== "pending") return false;
  if (isAdmin(user)) return true;
  return isMaker(user) && tx.makerId === user.id;
}

export function canApproveOrReject(
  user: AppUser | null | undefined,
  tx: Pick<Transaction, "makerId" | "status">
): boolean {
  if (!user || tx.status !== "pending") return false;
  return isApprover(user) || isAdmin(user);
}

export function canViewApprovals(user: AppUser | null | undefined): boolean {
  return isAdmin(user) || isChecker(user) || isApprover(user);
}

export function canViewAudit(user: AppUser | null | undefined): boolean {
  return isAdmin(user) || isChecker(user) || isApprover(user);
}

export function canViewUsers(user: AppUser | null | undefined): boolean {
  return isAdmin(user) || isChecker(user);
}

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function canAccessAppPath(
  user: AppUser | null | undefined,
  pathname: string
): boolean {
  if (!user) return false;

  // Unassigned users can open the dashboard to see the missing-role message.
  if (!user.role) {
    return pathname === "/" || pathname === "";
  }

  if (pathname === "/" || pathname === "") {
    return true;
  }
  if (pathMatches(pathname, "/settings")) {
    return isAdmin(user);
  }
  if (pathMatches(pathname, "/users")) {
    return canViewUsers(user);
  }
  if (pathMatches(pathname, "/approvals")) {
    return canViewApprovals(user);
  }
  if (pathMatches(pathname, "/audit")) {
    return canViewAudit(user);
  }
  if (pathMatches(pathname, "/transactions")) {
    return (
      isAdmin(user) ||
      isMaker(user) ||
      isChecker(user) ||
      isApprover(user)
    );
  }
  if (
    pathMatches(pathname, "/accounts") ||
    pathMatches(pathname, "/businesses")
  ) {
    return (
      isAdmin(user) ||
      isMaker(user) ||
      isChecker(user) ||
      isApprover(user)
    );
  }

  return false;
}

export function homePathForRole(_user: AppUser | null | undefined): string {
  return "/";
}

export function roleLabel(role: UserRole | null | undefined): string {
  if (role === "admin") return "Admin";
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
