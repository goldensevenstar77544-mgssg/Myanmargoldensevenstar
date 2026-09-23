"use client";

import type { ReactNode } from "react";
import { LoadingState } from "@/components/loading-state";
import { useMinWidth } from "@/lib/use-min-width";

/** Renders only the mobile or desktop tree after layout is known (no dual DOM). */
export function ResponsiveSwitch({
  mobile,
  desktop,
  breakpointPx = 768,
}: {
  mobile: ReactNode;
  desktop: ReactNode;
  breakpointPx?: number;
}) {
  const { matches, ready } = useMinWidth(breakpointPx);
  if (!ready) return <LoadingState variant="page" />;
  return <>{matches ? desktop : mobile}</>;
}
