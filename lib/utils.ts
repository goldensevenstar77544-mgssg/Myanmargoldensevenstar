import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  compactNumberScale,
  type CompactNumberScale,
} from "@/lib/app-config";
import type { Account } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAccountLabel(
  account: Pick<Account, "name" | "type" | "bankName" | "accountNumber">
): string {
  if (account.type === "cash") {
    return `${account.name} (Cash)`;
  }
  const bank = account.bankName?.trim();
  const number = account.accountNumber?.trim();
  const nickname = account.name?.trim();
  if (!bank) {
    return nickname ? `${nickname} (Bank)` : "Bank account";
  }
  const primary = [bank, number].filter(Boolean).join(" · ");
  if (nickname && nickname.toLowerCase() !== bank.toLowerCase()) {
    return `${primary} — ${nickname}`;
  }
  return primary;
}

export function formatMMK(amount: number): string {
  return new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  }).format(amount);
}

type CompactMMKOptions = {
  scale?: CompactNumberScale;
};

/** Short MMK for dense UI — scale from app config (`lakhs` or `international`). */
export function formatCompactMMK(
  value: number,
  options?: CompactMMKOptions
): string {
  const scale = options?.scale ?? compactNumberScale;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (scale === "lakhs") {
    if (abs >= 100_000) {
      const lakhs = abs / 100_000;
      const decimals = lakhs >= 100 ? 0 : 1;
      return `${sign}${lakhs.toFixed(decimals)} lakhs`;
    }
    return `${sign}${Math.round(abs)}`;
  }

  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(0)}K`;
  }
  return `${sign}${Math.round(abs)}`;
}

export function formatDate(value: Date | string | { toDate: () => Date }): string {
  let date: Date;
  if (typeof value === "string") {
    // Treat YYYY-MM-DD as a local calendar date (avoid UTC shift).
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      date = new Date(y, m - 1, d);
    } else {
      date = new Date(value);
    }
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = value.toDate();
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(
  value: Date | string | { toDate: () => Date }
): string {
  let date: Date;
  if (typeof value === "string") {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = value.toDate();
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatTime(
  value: Date | string | { toDate: () => Date }
): string {
  let date: Date;
  if (typeof value === "string") {
    date = new Date(value);
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = value.toDate();
  }
  return new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
