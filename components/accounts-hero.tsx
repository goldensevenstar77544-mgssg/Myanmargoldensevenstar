import {
  CircleDollarSign,
  Landmark,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn, formatCompactMMK, formatMMK } from "@/lib/utils";

export interface AccountsHeroProps {
  bankBalance: number;
  cashBalance: number;
  bankCount: number;
  cashCount: number;
}

type Metric = {
  key: string;
  label: string;
  value: string;
  title?: string;
  icon: LucideIcon;
  hero?: boolean;
};

function moneyMetric(
  key: string,
  label: string,
  amount: number,
  icon: LucideIcon,
  options?: { hero?: boolean }
): Metric {
  return {
    key,
    label,
    value: formatCompactMMK(amount),
    title: formatMMK(amount),
    icon,
    hero: options?.hero,
  };
}

function MetricRow({ metric }: { metric: Metric }) {
  const Icon = metric.icon;

  return (
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-3 px-2.5 sm:px-3",
        metric.hero ? "py-2.5 sm:py-3" : "py-2"
      )}
    >
      <div className="flex min-w-0 shrink items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
        <span className="truncate">{metric.label}</span>
      </div>
      <div
        title={metric.title}
        className={cn(
          "min-w-0 text-right font-semibold tracking-tight tabular-nums leading-tight text-zinc-950",
          metric.hero ? "text-base sm:text-lg" : "text-sm sm:text-base"
        )}
      >
        {metric.value}
      </div>
    </div>
  );
}

export function AccountsHero({
  bankBalance,
  cashBalance,
  bankCount,
  cashCount,
}: AccountsHeroProps) {
  const available = bankBalance + cashBalance;
  const metrics: Metric[] = [
    moneyMetric("available", "Available", available, CircleDollarSign, {
      hero: true,
    }),
    moneyMetric("bank", "Bank", bankBalance, Landmark),
    moneyMetric("cash", "Cash", cashBalance, Wallet),
  ];

  const countCaption = `${bankCount} bank · ${cashCount} cash`;

  return (
    <section className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white via-white to-[#e8ece9] shadow-sm">
      <div className="border-b border-zinc-200/80 px-3 py-3 sm:px-4">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
          Liquidity
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">{countCaption}</p>
      </div>
      <div className="divide-y divide-zinc-100">
        {metrics.map((metric) => (
          <MetricRow key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}
