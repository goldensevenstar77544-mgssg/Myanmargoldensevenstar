export type CompactNumberScale = "lakhs" | "international";

/** Fallback when NEXT_PUBLIC_COMPACT_NUMBER_SCALE is unset or invalid. */
const DEFAULT_COMPACT_NUMBER_SCALE: CompactNumberScale = "lakhs";

function resolveCompactNumberScale(): CompactNumberScale {
  const fromEnv = process.env.NEXT_PUBLIC_COMPACT_NUMBER_SCALE?.trim();
  if (fromEnv === "lakhs" || fromEnv === "international") {
    return fromEnv;
  }
  return DEFAULT_COMPACT_NUMBER_SCALE;
}

/**
 * Compact amount scale for KPI strips and chart axes.
 * Set NEXT_PUBLIC_COMPACT_NUMBER_SCALE to `lakhs` ("N lakhs") or `international` (B/M/K).
 */
export const compactNumberScale: CompactNumberScale =
  resolveCompactNumberScale();
