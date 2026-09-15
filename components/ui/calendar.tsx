"use client";

import * as React from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CalendarProps {
  selected?: Date;
  month: Date;
  onMonthChange: (month: Date) => void;
  onSelect: (day: Date) => void;
  fromYear: number;
  toYear: number;
  className?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function Calendar({
  selected,
  month,
  onMonthChange,
  onSelect,
  fromYear,
  toYear,
  className,
}: CalendarProps) {
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(monthStart)),
  });

  const years = Array.from(
    { length: toYear - fromYear + 1 },
    (_, i) => fromYear + i
  );

  const canGoPrev =
    month.getFullYear() > fromYear ||
    (month.getFullYear() === fromYear && month.getMonth() > 0);
  const canGoNext =
    month.getFullYear() < toYear ||
    (month.getFullYear() === toYear && month.getMonth() < 11);

  return (
    <div className={cn("w-[280px] p-3", className)}>
      <div className="mb-3 flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!canGoPrev}
          onClick={() => onMonthChange(subMonths(month, 1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1 gap-1">
          <select
            aria-label="Month"
            className="h-8 min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={month.getMonth()}
            onChange={(e) =>
              onMonthChange(
                new Date(month.getFullYear(), Number(e.target.value), 1)
              )
            }
          >
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i} value={i}>
                {format(new Date(2000, i, 1), "MMM")}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            className="h-8 w-[5.25rem] shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            value={month.getFullYear()}
            onChange={(e) =>
              onMonthChange(new Date(Number(e.target.value), month.getMonth(), 1))
            }
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          disabled={!canGoNext}
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="h-8 text-xs font-medium leading-8 text-zinc-500"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {days.map((day) => {
          const inMonth = isSameMonth(day, month);
          const isSelected = selected ? isSameDay(day, selected) : false;
          const today = isToday(day);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onSelect(day)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors",
                !inMonth && "text-zinc-300",
                inMonth && !isSelected && "text-zinc-900 hover:bg-zinc-100",
                today && !isSelected && "bg-zinc-100 font-medium",
                isSelected &&
                  "bg-zinc-900 font-medium text-white hover:bg-zinc-800"
              )}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
