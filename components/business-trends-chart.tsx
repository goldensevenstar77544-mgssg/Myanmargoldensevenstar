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
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Business, GroupMonthSummary } from "@/lib/types";
import {
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

type TrendMetric = SummaryMetric;

const METRIC_LABELS: Record<TrendMetric, string> = {
  net: "Net profit",
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

interface BusinessTrendsChartProps {
  businesses: Business[];
  months: GroupMonthSummary[];
  year: number;
  onYearChange: (year: number) => void;
}

export function BusinessTrendsChart({
  businesses,
  months,
  year,
  onYearChange,
}: BusinessTrendsChartProps) {
  const currentYear = new Date().getFullYear();
  const [metric, setMetric] = useState<TrendMetric>("net");

  const activeBusinesses = useMemo(
    () => businesses.filter((b) => b.status === "active"),
    [businesses]
  );

  const monthById = useMemo(
    () => new Map(months.map((m) => [m.id, m])),
    [months]
  );

  const { data, hasActivity } = useMemo(() => {
    const keys = yearMonthKeys(year);
    let activity = false;
    const rows = keys.map((month) => {
      const summary = monthById.get(month);
      const row: Record<string, string | number> = {
        month,
        label: formatMonthShort(month),
      };
      for (const business of activeBusinesses) {
        const value = metricFromBucket(
          mapBucket(summary?.byBusiness, business.id),
          metric
        );
        if (value !== 0) activity = true;
        row[business.id] = value;
      }
      return row;
    });
    return { data: rows, hasActivity: activity };
  }, [activeBusinesses, monthById, metric, year]);

  const metricLabel = METRIC_LABELS[metric];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Business trends</CardTitle>
          <CardDescription>
            Monthly {metricLabel.toLowerCase()} by business for {year}{" "}
            (approved only).
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              aria-label="Previous year"
              onClick={() => onYearChange(year - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-14 text-center text-sm font-medium tabular-nums">
              {year}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              aria-label="Next year"
              disabled={year >= currentYear}
              onClick={() => onYearChange(Math.min(currentYear, year + 1))}
            >
              <ChevronRight />
            </Button>
          </div>
          <div className="w-40">
            <Label htmlFor="trend-metric" className="sr-only">
              Metric
            </Label>
            <Select
              value={metric}
              onValueChange={(value) => setMetric(value as TrendMetric)}
            >
              <SelectTrigger id="trend-metric">
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
        </div>
      </CardHeader>
      <CardContent>
        {activeBusinesses.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No active businesses to chart yet.
          </p>
        ) : !hasActivity ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            No approved transactions in {year}.
          </p>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  interval="preserveStartEnd"
                  minTickGap={28}
                />
                <YAxis
                  domain={[paddedYMin, paddedYMax]}
                  tickFormatter={(v) => formatCompactMMK(Number(v))}
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e4e4e7" }}
                  width={48}
                />
                <Tooltip
                  formatter={(value, name) => {
                    const business = activeBusinesses.find((b) => b.id === name);
                    const amount =
                      typeof value === "number" ? value : Number(value);
                    return [
                      formatMMK(Number.isFinite(amount) ? amount : 0),
                      business?.name ?? String(name),
                    ];
                  }}
                  labelFormatter={(label) => `${label} ${year}`}
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#e4e4e7",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                  formatter={(value) => {
                    const business = activeBusinesses.find((b) => b.id === value);
                    return business?.name ?? value;
                  }}
                />
                {activeBusinesses.map((business, index) => (
                  <Line
                    key={business.id}
                    type="monotone"
                    dataKey={business.id}
                    name={business.id}
                    stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
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
