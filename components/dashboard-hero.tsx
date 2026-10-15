import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CircleDollarSign,
  Clock3,
  Landmark,
  Plus,
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
  periodLabel?: string;
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
  hero?: boolean;
  tone?: "profit" | "loss" | "income" | "expense" | "neutral";
};

type MetricGroup = {
  title: string;
  caption?: string;
  metrics: Metric[];
  /** Optional second row (e.g. ops counts under Liquidity money). */
  secondaryMetrics?: Metric[];
  secondaryCaption?: string;
};

function moneyMetric(
  key: string,
  label: string,
  amount: number,
  icon: LucideIcon,
  options?: {
    tone?: Metric["tone"];
    hero?: boolean;
  }
): Metric {
  return {
    key,
    label,
    value: formatCompactMMK(amount),
    title: formatMMK(amount),
    icon,
    tone: options?.tone,
    hero: options?.hero,
  };
}

function MetricRow({ metric }: { metric: Metric }) {
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
    <div
      className={cn(
        "flex min-w-0 items-baseline justify-between gap-3 px-2.5 sm:px-3",
        metric.hero ? "py-2.5 sm:py-3" : "py-2"
      )}
    >
      <div className="flex min-w-0 shrink items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <Icon className={cn("h-3.5 w-3.5 shrink-0", iconTone)} aria-hidden />
        <span className="truncate">{metric.label}</span>
      </div>
      <div
        title={metric.title}
        className={cn(
          "min-w-0 text-right font-semibold tracking-tight tabular-nums leading-tight",
          metric.hero ? "text-base sm:text-lg" : "text-sm sm:text-base",
          valueTone
        )}
      >
        {metric.value}
      </div>
    </div>
  );
}

function MetricsStack({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="divide-y divide-zinc-100">
      {metrics.map((metric) => (
        <MetricRow key={metric.key} metric={metric} />
      ))}
    </div>
  );
}

function OpsGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div key={metric.key} className="min-w-0 px-2.5 py-2 sm:px-3">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
              <span className="truncate">{metric.label}</span>
            </div>
            <div
              title={metric.title}
              className={cn(
                "mt-0.5 text-sm font-semibold tracking-tight tabular-nums text-zinc-950",
                metric.emphasize && "text-amber-700"
              )}
            >
              {metric.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DashboardHero({
  stats,
  periodLabel,
  showApprovalsCta,
  showNewTransactionCta,
}: DashboardHeroProps) {
  const netTone: Metric["tone"] =
    stats.net > 0 ? "profit" : stats.net < 0 ? "loss" : "neutral";

  const metricGroups: MetricGroup[] = [
    {
      title: "Liquidity",
      metrics: [
        moneyMetric("available", "Available", stats.available, CircleDollarSign, {
          hero: true,
        }),
        moneyMetric("bank", "Bank", stats.bankBalance, Landmark),
        moneyMetric("cash", "Cash", stats.cashBalance, Wallet),
      ],
      secondaryCaption: "Ops",
      secondaryMetrics: [
        {
          key: "businesses",
          label: "Biz",
          value: String(stats.businessCount),
          icon: Building2,
        },
        {
          key: "bankAccounts",
          label: "Accts",
          value: String(stats.bankAccountCount + stats.cashAccountCount),
          title: `${stats.bankAccountCount} bank · ${stats.cashAccountCount} cash`,
          icon: Landmark,
        },
        {
          key: "pending",
          label: "Pending",
          value: String(stats.pending),
          icon: Clock3,
          emphasize: stats.pending > 0,
        },
      ],
    },
    {
      title: "Performance",
      caption: "Income and expenses exclude transfers",
      metrics: [
        moneyMetric("net", "Net", stats.net, CircleDollarSign, {
          tone: netTone,
          hero: true,
        }),
        moneyMetric("income", "Income", stats.income, TrendingUp, {
          tone: "income",
        }),
        moneyMetric("expenses", "Expenses", stats.expenses, TrendingDown, {
          tone: "expense",
        }),
      ],
    },
    {
      title: "Internal transfers",
      metrics: [
        moneyMetric("transferIn", "Transfer in", stats.transferIn, ArrowDownLeft, {
          tone: "income",
        }),
        moneyMetric(
          "transferOut",
          "Transfer out",
          stats.transferOut,
          ArrowUpRight,
          { tone: "expense" }
        ),
      ],
    },
  ];

  const subtitle = periodLabel
    ? `${periodLabel} · approved figures`
    : "Approved figures";

  return (
    <section className="rounded-xl border border-zinc-200 bg-gradient-to-br from-white via-white to-[#e8ece9] shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200/80 px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950 sm:text-2xl">
            Group overview
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
            <span className="min-w-0 truncate">{subtitle}</span>
            {showApprovalsCta && (
              <Link
                href="/approvals"
                className="shrink-0 font-medium text-zinc-800 underline-offset-2 hover:underline md:hidden"
              >
                Approvals ({stats.pending})
              </Link>
            )}
          </p>
        </div>
        {(showNewTransactionCta || showApprovalsCta) && (
          <div className="ml-auto hidden flex-wrap items-center justify-end gap-2 md:flex">
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

      {showNewTransactionCta && (
        <MobileFabStack>
          <MobileFab href="/transactions/new" label="New transaction" />
        </MobileFabStack>
      )}
      <div className="grid divide-y divide-zinc-200/80 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {metricGroups.map((group) => (
          <div key={group.title} className="min-w-0">
            <div className="px-2.5 pt-2 sm:px-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {group.title}
              </div>
              {group.caption && (
                <p className="mt-0.5 text-xs text-zinc-400">{group.caption}</p>
              )}
            </div>
            <MetricsStack metrics={group.metrics} />
            {group.secondaryMetrics && group.secondaryMetrics.length > 0 && (
              <div className="border-t border-zinc-100">
                {group.secondaryCaption && (
                  <div className="px-2.5 pt-1.5 text-xs font-medium uppercase tracking-wider text-zinc-400 sm:px-3">
                    {group.secondaryCaption}
                  </div>
                )}
                <OpsGrid metrics={group.secondaryMetrics} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
