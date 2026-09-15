"use client";

import { useEffect } from "react";

/** Schedule a data load after mount without sync setState in the effect body. */
export function useLoadOnMount(load: () => void | Promise<void>) {
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) void load();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [load]);
}
