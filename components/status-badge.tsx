"use client";

import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import type { TransactionStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const map: Record<
  TransactionStatus,
  { label: string; variant: "warning" | "success" | "danger" }
> = {
  pending: { label: "Pending review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  rejected: { label: "Rejected", variant: "danger" },
};

const iconMap: Record<
  TransactionStatus,
  {
    label: string;
    Icon: typeof Clock3;
    className: string;
  }
> = {
  pending: {
    label: "Pending",
    Icon: Clock3,
    className: "text-amber-600 hover:bg-amber-50",
  },
  approved: {
    label: "Approved",
    Icon: CheckCircle2,
    className: "text-emerald-600 hover:bg-emerald-50",
  },
  rejected: {
    label: "Rejected",
    Icon: XCircle,
    className: "text-rose-600 hover:bg-rose-50",
  },
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  const item = map[status];
  return <Badge variant={item.variant}>{item.label}</Badge>;
}

/** Icon-only status; click to reveal the label. */
export function StatusIcon({
  status,
  className,
}: {
  status: TransactionStatus;
  className?: string;
}) {
  const item = iconMap[status];
  const Icon = item.Icon;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={item.label}
          title={item.label}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            item.className,
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="top"
        className="px-2.5 py-1.5 text-xs font-medium"
        onClick={(e) => e.stopPropagation()}
      >
        {item.label}
      </PopoverContent>
    </Popover>
  );
}
