import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
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

/** Full digits for KPI strips and chart axes (no currency code). */
export function formatCompactMMK(value: number): string {
  return new Intl.NumberFormat("en-MM", {
    maximumFractionDigits: 0,
  }).format(value);
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

function toLocalDate(value: Date | string | { toDate: () => Date }): Date {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(value);
  }
  if (value instanceof Date) return value;
  return value.toDate();
}

/** e.g. 12:00PM */
export function formatTimeCompact(
  value: Date | string | { toDate: () => Date }
): string {
  const date = toLocalDate(value);
  const raw = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return raw.replace(/\s/g, "").toUpperCase();
}

/** e.g. 1.2.2026 */
export function formatDateDots(
  value: Date | string | { toDate: () => Date }
): string {
  const date = toLocalDate(value);
  return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
}
