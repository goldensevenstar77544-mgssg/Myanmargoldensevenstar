import type { UserRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ROLE_TONE: Record<
  UserRole | "unassigned",
  string
> = {
  maker: "border-transparent bg-sky-100 text-sky-800",
  checker: "border-transparent bg-amber-100 text-amber-900",
  approver: "border-transparent bg-emerald-100 text-emerald-800",
  unassigned: "border-zinc-200 bg-zinc-50 text-zinc-600",
};

export function RoleBadge({
  role,
  className,
}: {
  role: UserRole | null | undefined;
  className?: string;
}) {
  const key = role ?? "unassigned";
  return (
    <Badge className={cn(ROLE_TONE[key], className)}>{roleLabel(role)}</Badge>
  );
}
