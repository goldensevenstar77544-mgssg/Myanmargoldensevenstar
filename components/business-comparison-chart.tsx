"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import type { Business, EntitySummary } from "@/lib/types";
import { metricFromBucket, type SummaryMetric } from "@/lib/summaries";
import { formatCompactMMK, paddedYMax, paddedYMin } from "@/lib/chart";
import { formatMMK } from "@/lib/utils";

type ComparisonMetric = "fixedAssets" | SummaryMetric;

const BAR_COLORS = [
  "#0f766e",
  "#b45309",
  "#1d4ed8",
  "#be123c",
  "#4338ca",
  "#047857",
  "#c2410c",
  "#0369a1",
];

const METRIC_LABELS: Record<ComparisonMetric, string> = {
  fixedAssets: "Fixed assets",
  income: "Income",
  expense: "Expenses",
  net: "Net",
  transferIn: "Transfer in",
  transferOut: "Transfer out",
};

interface BusinessComparisonChartProps {
  businesses: Business[];
  summaries: Record<string, EntitySummary>;
  periodLabel?: string;
}

function metricValue(
  business: Business,
  summaries: Record<string, EntitySummary>,
  metric: ComparisonMetric
): number {
  if (metric === "fixedAssets") {
    return Number(business.fixedAssetExpense) || 0;
  }
  const summary = summaries[business.id];
  return metricFromBucket(
    {
      income: summary?.income ?? 0,
      expense: summary?.expense ?? 0,
      transferIn: summary?.transferIn ?? 0,
      transferOut: summary?.transferOut ?? 0,
    },
    metric
  );
}

export function BusinessComparisonChart({
  businesses,
  summaries,
  periodLabel,
}: BusinessComparisonChartProps) {
  const [metric, setMetric] = useState<ComparisonMetric>("fixedAssets");

  const { data, hasData, total } = useMemo(() => {
    const rows = businesses
      .filter((b) => b.status === "active")
      .map((b) => ({
        id: b.id,
        name: b.name,
        amount: metricValue(b, summaries, metric),
      }))
      .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
    return {
      data: rows,
      hasData: rows.some((row) => row.amount !== 0),
      total: rows.reduce((sum, row) => sum + row.amount, 0),
    };
  }, [businesses, summaries, metric]);

  const metricLabel = METRIC_LABELS[metric];
  const yDomain =
    metric === "net"
      ? ([paddedYMin, paddedYMax] as const)
      : ([0, paddedYMax] as const);

  const emptyMessage =
    metric === "fixedAssets"
      ? "No fixed assets recorded yet."
      : "No approved income or expense for this metric yet.";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Business comparison</CardTitle>
          <CardDescription>
            {metricLabel} by business
            {periodLabel && metric !== "fixedAssets" ? ` · ${periodLabel}` : ""}
            {hasData ? ` · group ${formatMMK(total)}` : ""}
            {metric !== "fixedAssets" ? " (approved only)" : ""}.
          </CardDescription>
        </div>
        <div className="w-40">
          <Label htmlFor="comparison-metric" className="sr-only">
            Metric
          </Label>
          <Select
            value={metric}
            onValueChange={(value) => setMetric(value as ComparisonMetric)}
          >
            <SelectTrigger id="comparison-metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixedAssets">Fixed assets</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="net">Net</SelectItem>
              <SelectItem value="transferIn">Transfer in</SelectItem>
              <SelectItem value="transferOut">Transfer out</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No active businesses to compare yet.
          </p>
        ) : !hasData ? (
          <p className="py-10 text-center text-sm text-zinc-500">{emptyMessage}</p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 12, left: 4, bottom: 48 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#71717a", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={72}
                  tickFormatter={(value) => {
                    const label = String(value);
                    return label.length > 14 ? `${label.slice(0, 13)}…` : label;
                  }}
                />
                <YAxis
                  domain={[...yDomain]}
                  tickFormatter={(v) => formatCompactMMK(Number(v))}
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  width={48}
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
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {data.map((row, index) => (
                    <Cell
                      key={row.id}
                      fill={BAR_COLORS[index % BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
