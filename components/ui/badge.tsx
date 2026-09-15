import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning" | "danger";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0 text-[11px] font-semibold transition-colors",
        variant === "default" && "border-transparent bg-zinc-900 text-zinc-50",
        variant === "secondary" && "border-transparent bg-zinc-100 text-zinc-900",
        variant === "outline" && "text-zinc-950",
        variant === "success" && "border-transparent bg-emerald-100 text-emerald-800",
        variant === "warning" && "border-transparent bg-amber-100 text-amber-800",
        variant === "danger" && "border-transparent bg-red-100 text-red-800",
        className
      )}
      {...props}
    />
  );
}

export { Badge };
