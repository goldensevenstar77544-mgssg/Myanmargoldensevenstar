"use client";

import { useSyncExternalStore } from "react";

function subscribeMinWidth(minWidthPx: number, onStoreChange: () => void) {
  const mql = window.matchMedia(`(min-width: ${minWidthPx}px)`);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

function getMinWidthSnapshot(minWidthPx: number) {
  return window.matchMedia(`(min-width: ${minWidthPx}px)`).matches;
}

/** Whether viewport is at least `minWidthPx`. SSR/first paint uses `false`. */
export function useMinWidth(minWidthPx: number): {
  matches: boolean;
  ready: boolean;
} {
  const matches = useSyncExternalStore(
    (onStoreChange) => subscribeMinWidth(minWidthPx, onStoreChange),
    () => getMinWidthSnapshot(minWidthPx),
    () => false
  );
  // Client snapshot always runs after hydration → ready once we are on the client.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  return { matches, ready };
}
