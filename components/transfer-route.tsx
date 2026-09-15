import { cn } from "@/lib/utils";

export function TransferRoute({
  fromBusiness,
  fromAccount,
  toBusiness,
  toAccount,
  className,
  compact = false,
}: {
  fromBusiness?: string | null;
  fromAccount?: string | null;
  toBusiness?: string | null;
  toAccount?: string | null;
  className?: string;
  compact?: boolean;
}) {
  const from = [fromBusiness, fromAccount].filter(Boolean).join(" · ") || "—";
  const to = [toBusiness, toAccount].filter(Boolean).join(" · ") || "—";

  if (compact) {
    return (
      <div className={cn("space-y-0.5 text-xs leading-snug", className)}>
        <p className="truncate text-zinc-950">
          <span className="font-medium text-zinc-500">From </span>
          {from}
        </p>
        <p className="truncate text-zinc-950">
          <span className="font-medium text-zinc-500">To </span>
          {to}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1.5 text-sm", className)}>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          From
        </div>
        <div className="truncate text-zinc-950">{from}</div>
      </div>
      <div>
        <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          To
        </div>
        <div className="truncate text-zinc-950">{to}</div>
      </div>
    </div>
  );
}
