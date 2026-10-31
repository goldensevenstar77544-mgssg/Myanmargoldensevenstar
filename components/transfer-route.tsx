import { cn, formatMMK } from "@/lib/utils";

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
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          From
        </div>
        <div className="truncate text-zinc-950">{from}</div>
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          To
        </div>
        <div className="truncate text-zinc-950">{to}</div>
      </div>
    </div>
  );
}

function transferPlaceLabel(
  business?: string | null,
  account?: string | null
): string {
  const parts = [business?.trim(), account?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** Transfer amount: −MMK / +MMK (optionally with from/to place labels). */
export function TransferAmount({
  amount,
  fromBusiness,
  fromAccount,
  toBusiness,
  toAccount,
  className,
  compact = false,
  leg = "both",
  showPlaces = true,
}: {
  amount: number;
  fromBusiness?: string | null;
  fromAccount?: string | null;
  toBusiness?: string | null;
  toAccount?: string | null;
  className?: string;
  compact?: boolean;
  /** Which transfer leg to show; default both (− and +). */
  leg?: "out" | "in" | "both";
  /** When false, show only ± amounts (no from/to place text). */
  showPlaces?: boolean;
}) {
  const from = transferPlaceLabel(fromBusiness, fromAccount);
  const to = transferPlaceLabel(toBusiness, toAccount);
  const showOut = leg === "out" || leg === "both";
  const showIn = leg === "in" || leg === "both";
  return (
    <div
      className={cn(
        "space-y-0.5 tabular-nums leading-snug",
        compact ? "text-xs" : "text-sm",
        className
      )}
    >
      {showOut ? (
        <p className="font-semibold text-rose-700">
          −{formatMMK(amount)}
          {showPlaces ? (
            <span className="font-normal text-zinc-500"> from {from}</span>
          ) : null}
        </p>
      ) : null}
      {showIn ? (
        <p className="font-semibold text-emerald-700">
          +{formatMMK(amount)}
          {showPlaces ? (
            <span className="font-normal text-zinc-500"> to {to}</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
