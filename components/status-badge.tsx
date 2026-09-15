import type { TransactionStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const map: Record<
  TransactionStatus,
  { label: string; variant: "warning" | "success" | "danger" }
> = {
  pending: { label: "Pending review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const item = map[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}
