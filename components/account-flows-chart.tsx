"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account, GroupMonthSummary, Transaction } from "@/lib/types";
import type { PeriodKind } from "@/lib/account-period";
import {
  allTimeYearKeysFromMonths,
  formatDayLabel,
  monthDayKeys,
} from "@/lib/account-period";
import {
  addTxToBucket,
  emptyBucket,
  mapBucket,
  metricFromBucket,
  type SummaryMetric,
} from "@/lib/summaries";
import {
  formatCompactMMK,
  formatMonthShort,
  paddedYMax,
  paddedYMin,
  yearMonthKeys,
} from "@/lib/chart";
import { formatMMK } from "@/lib/utils";

type FlowMetric = SummaryMetric;

const METRIC_LABELS: Record<FlowMetric, string> = {
  net: "Net flow",
  income: "Income",
  expense: "Expenses",
  transferIn: "Transfer in",
  transferOut: "Transfer out",
};

const SERIES_COLORS = [
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#4338ca",
  "#047857",
  "#c2410c",
  "#0369a1",
];

interface AccountFlowsChartProps {
  accounts: Account[];
  months: GroupMonthSummary[];
  /** Used for daily (month) charts. */
  transactions?: Transaction[];
  period?: PeriodKind;
  year: number;
  month?: number;
  periodLabel?: string;
  loading?: boolean;
}

export function AccountFlowsChart({
  accounts,
  months,
  transactions = [],
  period = "year",
  year,
  month = 1,
  periodLabel,
  loading = false,
}: AccountFlowsChartProps) {
  const currentYear = new Date().getFullYear();
  const [metric, setMetric] = useState<FlowMetric>("net");
  const isMonth = period === "month";
  const isAll = period === "all";

  const activeBankAccounts = useMemo(
    () => accounts.filter((a) => a.type === "bank" && a.status === "active"),
    [accounts]
  );

  const monthById = useMemo(
    () => new Map(months.map((m) => [m.id, m])),
    [months]
  );

  const { data, hasActivity, bucketLabel } = useMemo(() => {
    if (isMonth) {
      const keys = monthDayKeys(year, month);
      const keySet = new Set(keys);
      const dayMaps = new Map(
        keys.map((key) => [
          key,
          new Map<string, ReturnType<typeof emptyBucket>>(),
        ])
      );
      let activity = false;
      for (const tx of transactions) {
        if (tx.status !== "approved") continue;
        if (!keySet.has(tx.date)) continue;
        const byAccount = dayMaps.get(tx.date);
        if (!byAccount) continue;
        const prev = byAccount.get(tx.accountId) ?? emptyBucket();
        byAccount.set(
          tx.accountId,
          addTxToBucket(prev, {
            direction: tx.direction,
            amount: tx.amount,
            category: tx.category,
            transferGroupId: tx.transferGroupId,
          })
        );
      }
      const rows = keys.map((key) => {
        const byAccount = dayMaps.get(key);
        const row: Record<string, string | number> = {
          key,
          label: formatDayLabel(key),
        };
        for (const account of activeBankAccounts) {
          const value = metricFromBucket(
            byAccount?.get(account.id) ?? emptyBucket(),
            metric
          );
          if (value !== 0) activity = true;
          row[account.id] = value;
        }
        return row;
      });
      return { data: rows, hasActivity: activity, bucketLabel: "Daily" };
    }

    if (isAll) {
      const yearKeys = allTimeYearKeysFromMonths(months, currentYear);
      let activity = false;
      const rows = yearKeys.map((y) => {
        const prefix = `${y}-`;
        const row: Record<string, string | number> = {
          key: String(y),
          label: String(y),
        };
        for (const account of activeBankAccounts) {
          let income = 0;
          let expense = 0;
          let transferIn = 0;
          let transferOut = 0;
          for (const summary of months) {
            if (!summary.id.startsWith(prefix)) continue;
            const bucket = mapBucket(summary.byAccount, account.id);
            income += bucket.income;
            expense += bucket.expense;
            transferIn += bucket.transferIn;
            transferOut += bucket.transferOut;
          }
          const value = metricFromBucket(
            { income, expense, transferIn, transferOut },
            metric
          );
          if (value !== 0) activity = true;
          row[account.id] = value;
        }
        return row;
      });
      return { data: rows, hasActivity: activity, bucketLabel: "Yearly" };
    }

    const keys = yearMonthKeys(year);
    let activity = false;
    const rows = keys.map((monthKey) => {
      const summary = monthById.get(monthKey);
      const row: Record<string, string | number> = {
        key: monthKey,
        label: formatMonthShort(monthKey),
      };
      for (const account of activeBankAccounts) {
        const value = metricFromBucket(
          mapBucket(summary?.byAccount, account.id),
          metric
        );
        if (value !== 0) activity = true;
        row[account.id] = value;
      }
      return row;
    });
    return { data: rows, hasActivity: activity, bucketLabel: "Monthly" };
  }, [
    activeBankAccounts,
    currentYear,
    isAll,
    isMonth,
    metric,
    month,
    monthById,
    months,
    transactions,
    year,
  ]);

  const metricLabel = METRIC_LABELS[metric];
  const rangeLabel = periodLabel ?? String(year);
  const emptyRangeLabel = isMonth || isAll ? rangeLabel : String(year);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Bank account flows</CardTitle>
          <CardDescription>
            {bucketLabel} {metricLabel.toLowerCase()} by bank account for{" "}
            {rangeLabel} (approved only).
          </CardDescription>
        </div>
        <div className="w-40">
          <Label htmlFor="account-flow-metric" className="sr-only">
            Metric
          </Label>
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as FlowMetric)}
          >
            <SelectTrigger id="account-flow-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="net">Net flow</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="transferIn">Transfer in</SelectItem>
              <SelectItem value="transferOut">Transfer out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {activeBankAccounts.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No active bank accounts to chart yet.
          </p>
        ) : loading ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            Loading chart data…
          </p>
        ) : !hasActivity ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No approved bank transactions in {emptyRangeLabel}.
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{
                  top: 8,
                  right: 12,
                  left: 4,
                  bottom: isMonth ? 4 : 0,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#71717a", fontSize: isMonth ? 9 : 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  interval={isMonth ? 0 : "preserveStartEnd"}
                  minTickGap={isMonth ? 0 : 28}
                  padding={isMonth ? { left: 4, right: 4 } : undefined}
                />
                <YAxis
                  domain={[paddedYMin, paddedYMax]}
                  tickFormatter={(v) => formatCompactMMK(Number(v))}
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  width={88}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const account = activeBankAccounts.find(
                      (a) => a.id === name
                    );
                    const amount =
                      typeof value === "number" ? value : Number(value);
                    const label =
                      account?.bankName?.trim() ||
                      account?.name ||
                      String(name);
                    return [
                      formatMMK(Number.isFinite(amount) ? amount : 0),
                      label,
                    ];
                  }}
                  labelFormatter={(label) =>
                    isMonth
                      ? `${label} ${rangeLabel}`
                      : isAll
                        ? String(label)
                        : `${label} ${year}`
                  }
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => {
                    const account = activeBankAccounts.find(
                      (a) => a.id === value
                    );
                    return (
                      account?.bankName?.trim() || account?.name || value
                    );
                  }}
                />
                {activeBankAccounts.map((account, index) => (
                  <Line
                    key={account.id}
                    type="monotone"
                    dataKey={account.id}
                    name={account.id}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={isMonth || isAll ? { r: 2 } : false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
