"use client";

import Link from "next/link";
import { Plus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const fabPositionClassName =
  "fixed z-30 flex flex-col-reverse items-end gap-2 md:hidden bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]";

const fabButtonClassName =
  "inline-flex h-12 items-center gap-1.5 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white shadow-lg transition-colors hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2";

type MobileFabBase = {
  label: string;
  className?: string;
  icon?: LucideIcon;
};

type MobileFabLink = MobileFabBase & {
  href: string;
  onClick?: never;
};

type MobileFabButton = MobileFabBase & {
  href?: never;
  onClick: () => void;
};

export type MobileFabProps = MobileFabLink | MobileFabButton;

function FabContent({
  label,
  icon: Icon = Plus,
}: {
  label: string;
  icon?: LucideIcon;
}) {
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </>
  );
}

export function MobileFabStack({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(fabPositionClassName, className)}>{children}</div>;
}

export function MobileFab({
  label,
  className,
  icon,
  ...props
}: MobileFabProps) {
  const classes = cn(fabButtonClassName, className);

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={classes}>
        <FabContent label={label} icon={icon} />
      </Link>
    );
  }

  return (
    <button type="button" onClick={props.onClick} className={classes}>
      <FabContent label={label} icon={icon} />
    </button>
  );
}
