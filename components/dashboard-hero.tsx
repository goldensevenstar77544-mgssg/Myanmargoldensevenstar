import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Clock3,
  Landmark,
  Plus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileFab, MobileFabStack } from "@/components/mobile-fab";
import { cn, formatCompactMMK, formatMMK } from "@/lib/utils";

export interface DashboardHeroStats {
  income: number;
  expenses: number;
  transferIn: number;
  transferOut: number;
  net: number;
  bankBalance: number;
  cashBalance: number;
  available: number;
  businessCount: number;
  bankAccountCount: number;
  cashAccountCount: number;
  pending: number;
}

interface DashboardHeroProps {
  stats: DashboardHeroStats;
  showApprovalsCta: boolean;
  showNewTransactionCta: boolean;
}

type Metric = {
  key: string;
  label: string;
  value: string;
  title?: string;
  icon: LucideIcon;
  emphasize?: boolean;
  tone?: "profit" | "loss" | "income" | "expense" | "neutral";
};

type MetricGroup = {
  title: string;
  metrics: Metric[];
};

function moneyMetric(
  key: string,
  label: string,
  amount: number,
  icon: LucideIcon,
  tone?: Metric["tone"]
): Metric {
  return {
    key,
    label,
    value: formatCompactMMK(amount),
    title: formatMMK(amount),
    icon,
    tone,
  };
}

function MetricCell({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  const valueTone =
    metric.tone === "profit" || metric.tone === "income"
      ? "text-emerald-700"
      : metric.tone === "loss" || metric.tone === "expense"
        ? "text-rose-700"
        : metric.emphasize
          ? "text-amber-700"
          : "text-zinc-950";
  const iconTone =
    metric.tone === "profit" || metric.tone === "income"
      ? "text-emerald-600"
      : metric.tone === "loss" || metric.tone === "expense"
        ? "text-rose-600"
        : "text-zinc-400";

  return (
    <div className="min-w-0 px-2.5 py-1.5 sm:px-3">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        <Icon className={cn("h-2.5 w-2.5 shrink-0", iconTone)} aria-hidden />
        <span className="truncate">{metric.label}</span>
      </div>
      <div
        title={metric.title}
        className={cn(
          "mt-0.5 truncate text-sm font-semibold tracking-tight tabular-nums leading-tight",
          valueTone
        )}
      >
        {metric.value}
      </div>
    </div>
  );
}

export function DashboardHero({
  stats,
  showApprovalsCta,
  showNewTransactionCta,
}: DashboardHeroProps) {
  const netTone: Metric["tone"] =
    stats.net > 0 ? "profit" : stats.net < 0 ? "loss" : "neutral";

  const metricGroups: MetricGroup[] = [
    {
      title: "Performance",
      metrics: [
        moneyMetric("income", "Income", stats.income, TrendingUp, "income"),
        moneyMetric(
          "expenses",
          "Expenses",
          stats.expenses,
          TrendingDown,
          "expense"
        ),
        moneyMetric("net", "Net", stats.net, CircleDollarSign, netTone),
      ],
    },
    {
      title: "Internal transfers",
      metrics: [
        moneyMetric(
          "transferIn",
          "Transfer in",
          stats.transferIn,
          ArrowDownLeft,
          "income"
        ),
        moneyMetric(
          "transferOut",
          "Transfer out",
          stats.transferOut,
          ArrowUpRight,
          "expense"
        ),
      ],
    },
    {
      title: "Liquidity",
      metrics: [
        moneyMetric("bank", "Bank", stats.bankBalance, Landmark),
        moneyMetric("cash", "Cash", stats.cashBalance, Wallet),
        moneyMetric("available", "Available", stats.available, CircleDollarSign),
      ],
    },
  ];

  const opsMetrics: Metric[] = [
    {
      key: "businesses",
      label: "Biz",
      value: String(stats.businessCount),
      icon: Building2,
    },
    {
      key: "bankAccounts",
      label: "Bank",
      value: String(stats.bankAccountCount),
      icon: Landmark,
    },
    {
      key: "cashAccounts",
      label: "Cash",
      value: String(stats.cashAccountCount),
      icon: Wallet,
    },
    {
      key: "pending",
      label: "Pending",
      value: String(stats.pending),
      icon: Clock3,
      emphasize: stats.pending > 0,
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-gradient-to-br from-white via-white to-[#e8ece9] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
            Group overview
          </h1>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            Golden 7 Myanmar Group · approved figures · income/expenses exclude
            transfers
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <span className="hidden text-[9px] font-semibold uppercase tracking-wider text-zinc-400 sm:inline">
              Ops
            </span>
            <div className="flex items-stretch divide-x divide-zinc-200/80 rounded-lg border border-zinc-200/80 bg-white/60">
              {opsMetrics.map((metric) => (
                <MetricCell key={metric.key} metric={metric} />
              ))}
            </div>
          </div>
          {(showNewTransactionCta || showApprovalsCta) && (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {showNewTransactionCta && (
                <Button asChild size="sm">
                  <Link href="/transactions/new">
                    <Plus className="h-4 w-4" />
                    New transaction
                  </Link>
                </Button>
              )}
              {showApprovalsCta && (
                <Button
                  asChild
                  size="sm"
                  variant={showNewTransactionCta ? "outline" : "default"}
                >
                  <Link href="/approvals">Approvals ({stats.pending})</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {(showNewTransactionCta || showApprovalsCta) && (
        <MobileFabStack>
          {showNewTransactionCta && (
            <MobileFab href="/transactions/new" label="New transaction" />
          )}
          {showApprovalsCta && (
            <MobileFab
              href="/approvals"
              label={
                stats.pending > 0
                  ? `Approvals (${stats.pending})`
                  : "Approvals"
              }
              icon={ShieldCheck}
            />
          )}
        </MobileFabStack>
      )}
      <div className="grid divide-y divide-zinc-200/80 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {metricGroups.map((group) => (
          <div key={group.title} className="min-w-0">
            <div className="px-2.5 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-400 sm:px-3">
              {group.title}
            </div>
            <div
              className={
                group.metrics.length === 2
                  ? "grid grid-cols-2"
                  : "grid grid-cols-2 sm:grid-cols-3"
              }
            >
              {group.metrics.map((metric) => (
                <MetricCell key={metric.key} metric={metric} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
