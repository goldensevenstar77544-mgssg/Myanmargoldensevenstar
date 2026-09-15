"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { AccountFlowsChart } from "@/components/account-flows-chart";
import { BusinessComparisonChart } from "@/components/business-comparison-chart";
import { BusinessTrendsChart } from "@/components/business-trends-chart";
import { DashboardHero } from "@/components/dashboard-hero";
import { LoadingState } from "@/components/loading-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAccounts,
  listBusinesses,
  listTransactions,
} from "@/lib/firebase/firestore";
import {
  getBusinessSummary,
  getGroupMonthsForYear,
  getGroupSummary,
} from "@/lib/firebase/summaries";
import {
  canCreateTransaction,
  isFinanceAdmin,
} from "@/lib/permissions";
import type {
  Account,
  Business,
  EntitySummary,
  GroupMonthSummary,
  GroupSummary,
  Transaction,
} from "@/lib/types";
import { formatDate, formatMMK } from "@/lib/utils";
import { useLoadOnMount } from "@/lib/use-load-on-mount";

export default function DashboardPage() {
  const { profile } = useAuth();
  const currentYear = new Date().getFullYear();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bizSummaries, setBizSummaries] = useState<
    Record<string, EntitySummary>
  >({});
  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [months, setMonths] = useState<GroupMonthSummary[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [chartYear, setChartYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [monthsLoading, setMonthsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [biz, acc, summary, monthDocs, recentPage] = await Promise.all([
        listBusinesses(),
        listAccounts(),
        getGroupSummary(),
        getGroupMonthsForYear(currentYear),
        listTransactions({ pageSize: 8 }),
      ]);
      const summaries = await Promise.all(
        biz.map(async (b) => [b.id, await getBusinessSummary(b.id)] as const)
      );
      setBusinesses(biz);
      setAccounts(acc);
      setBizSummaries(Object.fromEntries(summaries));
      setGroup(summary);
      setMonths(monthDocs);
      setRecent(recentPage.items);
      setChartYear(currentYear);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [currentYear, profile]);

  useLoadOnMount(load);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    setMonthsLoading(true);
    getGroupMonthsForYear(chartYear)
      .then((docs) => {
        if (!cancelled) setMonths(docs);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Failed to load chart data");
      })
      .finally(() => {
        if (!cancelled) setMonthsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chartYear, loading]);

  const stats = useMemo(() => {
    const income = group?.income ?? 0;
    const expenses = group?.expense ?? 0;
    const transferIn = group?.transferIn ?? 0;
    const transferOut = group?.transferOut ?? 0;
    const bankBalance = accounts
      .filter((a) => a.type === "bank" && a.status === "active")
      .reduce((sum, a) => sum + a.currentBalance, 0);
    const cashBalance = accounts
      .filter((a) => a.type === "cash" && a.status === "active")
      .reduce((sum, a) => sum + a.currentBalance, 0);
    return {
      income,
      expenses,
      transferIn,
      transferOut,
      net: income - expenses,
      bankBalance,
      cashBalance,
      available: bankBalance + cashBalance,
      businessCount: businesses.filter((b) => b.status === "active").length,
      bankAccountCount: accounts.filter(
        (a) => a.type === "bank" && a.status === "active"
      ).length,
      cashAccountCount: accounts.filter(
        (a) => a.type === "cash" && a.status === "active"
      ).length,
      pending: group?.pendingCount ?? 0,
      recent,
    };
  }, [group, accounts, businesses, recent]);

  const businessMap = useMemo(
    () => Object.fromEntries(businesses.map((b) => [b.id, b.name])),
    [businesses]
  );

  const showMobileFabs =
    canCreateTransaction(profile) || isFinanceAdmin(profile);

  return (
    <div className={showMobileFabs ? "space-y-6 pb-28 md:pb-0" : "space-y-6"}>
      {loading ? (
        <LoadingState variant="inline" />
      ) : (
        <>
          <DashboardHero
            stats={stats}
            showApprovalsCta={isFinanceAdmin(profile)}
            showNewTransactionCta={canCreateTransaction(profile)}
          />

          <BusinessTrendsChart
            businesses={businesses}
            months={monthsLoading ? [] : months}
            year={chartYear}
            onYearChange={setChartYear}
          />

          <AccountFlowsChart
            accounts={accounts}
            months={monthsLoading ? [] : months}
            year={chartYear}
            onYearChange={setChartYear}
          />

          <BusinessComparisonChart
            businesses={businesses}
            summaries={bizSummaries}
          />

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Recent transactions</CardTitle>
                <CardDescription>
                  Latest activity across all statuses.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/transactions">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {stats.recent.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">
                  No transactions yet. Submit one for review to begin.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">
                          {tx.displayId}
                        </TableCell>
                        <TableCell>{formatDate(tx.date)}</TableCell>
                        <TableCell>
                          {businessMap[tx.businessId] || "—"}
                        </TableCell>
                        <TableCell className="capitalize">
                          {tx.transferGroupId ? "Transfer" : tx.direction}
                        </TableCell>
                        <TableCell
                          className={
                            tx.direction === "income"
                              ? "font-medium text-emerald-700"
                              : "font-medium text-rose-700"
                          }
                        >
                          {tx.direction === "income" ? "+" : "−"}
                          {formatMMK(tx.amount)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={tx.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild variant="ghost" size="xs">
                            <Link href={`/transactions/${tx.id}`}>Open</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {!profile?.role && (
            <Card className="border-amber-200 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-amber-900">Role not assigned</CardTitle>
                <CardDescription className="text-amber-800">
                  Your user profile exists but has no role. Ask a Checker to set
                  your role to <code>maker</code>, <code>checker</code>, or{" "}
                  <code>approver</code>.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
