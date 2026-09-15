import { formatCompactMMK } from "@/lib/utils";

const HEADROOM = 0.15;

/** Lower Y bound with headroom for negative values; floor at 0 when all non-negative. */
export function paddedYMin(dataMin: number): number {
  return dataMin < 0 ? dataMin * (1 + HEADROOM) : Math.min(0, dataMin);
}

/** Upper Y bound with headroom above the peak so lines don't hug the top. */
export function paddedYMax(dataMax: number): number {
  if (dataMax > 0) return dataMax * (1 + HEADROOM);
  if (dataMax < 0) return 0;
  return 1;
}

/** Calendar months Jan–Dec for a given year as `YYYY-MM` keys. */
export function yearMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, "0");
    return `${year}-${m}`;
  });
}

/** Short month label from `YYYY-MM` (e.g. "Jan"). */
export function formatMonthShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "short" }).format(
    new Date(y, m - 1, 1)
  );
}

export { formatCompactMMK };
