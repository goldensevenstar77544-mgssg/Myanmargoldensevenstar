"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
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
import type { EntityMonthSummary, Transaction } from "@/lib/types";
import type { PeriodKind, PeriodMatchField } from "@/lib/account-period";
import {
  allTimeYearKeysFromMonths,
  formatDayLabel,
  monthDayKeys,
} from "@/lib/account-period";
import {
  addTxToBucket,
  emptyBucket,
  metricFromBucket,
  sumBuckets,
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

type TrendMetric = SummaryMetric;

const METRIC_LABELS: Record<TrendMetric, string> = {
  net: "Net profit",
  income: "Income",
  expense: "Expenses",
  transferIn: "Transfer in",
  transferOut: "Transfer out",
};

interface PeriodTrendsChartProps {
  entityId: string;
  matchField: PeriodMatchField;
  /** Used for daily (month) charts; year/all prefer monthSummaries. */
  transactions: Transaction[];
  monthSummaries?: EntityMonthSummary[];
  period: PeriodKind;
  year: number;
  month: number;
  periodLabel: string;
  title?: string;
}

export function PeriodTrendsChart({
  entityId,
  matchField,
  transactions,
  monthSummaries = [],
  period,
  year,
  month,
  periodLabel,
  title = "Trends",
}: PeriodTrendsChartProps) {
  const [metric, setMetric] = useState<TrendMetric>("net");
  const currentYear = new Date().getFullYear();

  const { data, hasActivity, bucketLabel } = useMemo(() => {
    if (period === "month") {
      const keys = monthDayKeys(year, month);
      const keySet = new Set(keys);
      const buckets = new Map(keys.map((key) => [key, emptyBucket()]));
      let activity = false;
      for (const tx of transactions) {
        if (tx.status !== "approved") continue;
        if (tx[matchField] !== entityId) continue;
        if (!keySet.has(tx.date)) continue;
        const prev = buckets.get(tx.date) ?? emptyBucket();
        const next = addTxToBucket(prev, {
          direction: tx.direction,
          amount: tx.amount,
          category: tx.category,
          transferGroupId: tx.transferGroupId,
        });
        buckets.set(tx.date, next);
      }
      const rows = keys.map((key) => {
        const value = metricFromBucket(
          buckets.get(key) ?? emptyBucket(),
          metric
        );
        if (value !== 0) activity = true;
        return {
          key,
          label: formatDayLabel(key),
          value,
        };
      });
      return {
        data: rows,
        hasActivity: activity,
        bucketLabel: "Daily",
      };
    }

    if (period === "year") {
      const keys = yearMonthKeys(year);
      const byId = new Map(monthSummaries.map((m) => [m.id, m]));
      let activity = false;
      const rows = keys.map((key) => {
        const value = metricFromBucket(
          byId.get(key) ?? emptyBucket(),
          metric
        );
        if (value !== 0) activity = true;
        return { key, label: formatMonthShort(key), value };
      });
      return { data: rows, hasActivity: activity, bucketLabel: "Monthly" };
    }

    const yearKeys = allTimeYearKeysFromMonths(monthSummaries, currentYear);
    let activity = false;
    const rows = yearKeys.map((y) => {
      const prefix = `${y}-`;
      const yearMonths = monthSummaries.filter((m) => m.id.startsWith(prefix));
      const value = metricFromBucket(sumBuckets(yearMonths), metric);
      if (value !== 0) activity = true;
      return { key: String(y), label: String(y), value };
    });
    return { data: rows, hasActivity: activity, bucketLabel: "Yearly" };
  }, [
    entityId,
    matchField,
    transactions,
    monthSummaries,
    metric,
    period,
    year,
    month,
    currentYear,
  ]);

  const metricLabel = METRIC_LABELS[metric];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription className="text-xs">
            {bucketLabel} {metricLabel.toLowerCase()} for {periodLabel}{" "}
            (approved only).
          </CardDescription>
        </div>
        <div className="w-full sm:w-40">
          <Label htmlFor="period-trend-metric" className="sr-only">
            Metric
          </Label>
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as TrendMetric)}
          >
            <SelectTrigger id="period-trend-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="net">Net profit</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="transferIn">Transfer in</SelectItem>
              <SelectItem value="transferOut">Transfer out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-3 sm:pb-6">
        {!hasActivity ? (
          <p className="py-6 text-center text-sm text-zinc-500">
            No approved transactions for {periodLabel}.
          </p>
        ) : (
          <div className="h-52 w-full sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{
                  top: 8,
                  right: 8,
                  left: 0,
                  bottom: period === "month" ? 4 : 0,
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="label"
                  tick={{
                    fill: "#71717a",
                    fontSize: period === "month" ? 9 : 12,
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  interval={period === "month" ? 0 : "preserveStartEnd"}
                  minTickGap={period === "month" ? 0 : 28}
                  padding={
                    period === "month" ? { left: 4, right: 4 } : undefined
                  }
                />
                <YAxis
                  domain={[paddedYMin, paddedYMax]}
                  tickFormatter={(v) => formatCompactMMK(Number(v))}
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  width={40}
                />
                <Tooltip
                  formatter={(value) => {
                    const amount =
                      typeof value === "number" ? value : Number(value);
                    return [
                      formatMMK(Number.isFinite(amount) ? amount : 0),
                      metricLabel,
                    ];
                  }}
                  labelFormatter={(label) =>
                    period === "month"
                      ? `${label} ${periodLabel}`
                      : period === "year"
                        ? `${label} ${year}`
                        : String(label)
                  }
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="value"
                  stroke="#0f766e"
                  strokeWidth={2}
                  dot={period === "month" ? { r: 2 } : false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** @deprecated Prefer PeriodTrendsChart */
export function AccountTrendsChart(
  props: Omit<PeriodTrendsChartProps, "entityId" | "matchField" | "title"> & {
    account: { id: string };
  }
) {
  const { account, ...rest } = props;
  return (
    <PeriodTrendsChart
      {...rest}
      entityId={account.id}
      matchField="accountId"
      title="Account trends"
    />
  );
}
