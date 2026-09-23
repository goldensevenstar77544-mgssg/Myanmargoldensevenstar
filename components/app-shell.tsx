"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { useConfirm } from "@/components/confirm-dialog";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isApprover, isChecker } from "@/lib/permissions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Visible to checkers only (master-data / setup). */
  checkerOnly?: boolean;
  /** Visible to checkers and approvers (not makers). */
  staffOnly?: boolean;
  /** Visible to approvers only. */
  approverOnly?: boolean;
};

const primaryNav: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, staffOnly: true },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, staffOnly: true },
  { href: "/audit", label: "Audit Logs", icon: ScrollText, staffOnly: true },
];

const setupNav: NavItem[] = [
  { href: "/businesses", label: "Businesses", icon: Building2, checkerOnly: true },
  { href: "/accounts", label: "Accounts", icon: Wallet, checkerOnly: true },
  { href: "/users", label: "Users", icon: Users, checkerOnly: true },
  { href: "/settings", label: "Settings", icon: Settings, approverOnly: true },
];

function initialsFrom(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/** Sticky header label from route — section name for detail paths. */
function titleFromPathname(pathname: string): string {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/transactions")) return "Transactions";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/audit")) return "Audit Logs";
  if (pathname.startsWith("/businesses")) return "Businesses";
  if (pathname.startsWith("/accounts")) return "Accounts";
  if (pathname.startsWith("/users")) return "Users";
  if (pathname.startsWith("/settings")) return "Settings";
  return "Golden 7";
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        active
          ? "bg-zinc-100 font-medium text-zinc-950"
          : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full transition-colors",
          active ? "bg-zinc-950" : "bg-transparent group-hover:bg-zinc-400"
        )}
        aria-hidden
      />
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-zinc-950" : "text-zinc-600 group-hover:text-zinc-800"
        )}
      />
      {item.label}
    </Link>
  );
}

function NavSection({
  label,
  items,
  pathname,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.08em] text-zinc-600">
        {label}
      </p>
      <div className="space-y-0.5">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <NavLink
              key={item.href}
              item={item}
              active={active}
              onNavigate={onNavigate}
            />
          );
        })}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(false);

  const checker = isChecker(profile);
  const approver = isApprover(profile);
  const drawerOpen = isMobileNav && open;

  function visibleNav(item: NavItem) {
    if (item.approverOnly) return approver;
    // Approvers can open every other page; create/edit of master data stays Checker-only in UI.
    if (approver) return true;
    if (item.checkerOnly) return checker;
    if (item.staffOnly) return checker;
    return true;
  }

  const primaryItems = useMemo(
    () => primaryNav.filter(visibleNav),
    [checker, approver]
  );
  const setupItems = useMemo(
    () => setupNav.filter(visibleNav),
    [checker, approver]
  );

  const displayName = profile?.displayName || profile?.email || "Account";
  const initials = initialsFrom(profile?.displayName, profile?.email);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobileNav(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const ok = await confirm({
      title: "Sign out?",
      description: "You will need to sign in again to continue.",
      confirmLabel: "Sign out",
    });
    if (!ok) return;
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-dvh bg-[radial-gradient(ellipse_at_top,_#f4f7f5_0%,_#eef1ef_45%,_#e8ebe9_100%)] text-zinc-900">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-64 shrink-0 flex-col border-r border-zinc-200/80 bg-white pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-zinc-900 shadow-[1px_0_0_rgba(0,0,0,0.02)] transition-transform duration-200 ease-out lg:sticky lg:top-0 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          isMobileNav && !open && "pointer-events-none"
        )}
        aria-hidden={isMobileNav && !open ? true : undefined}
        inert={isMobileNav && !open ? true : undefined}
        {...(drawerOpen
          ? { role: "dialog" as const, "aria-modal": true as const }
          : {})}
        aria-label="Navigation menu"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-zinc-100 px-4">
          <BrandLogo sizeClassName="h-9 w-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">
              Golden 7
            </p>
            <p className="truncate text-xs text-zinc-600">Financial System</p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <NavSection
            label="Overview"
            items={primaryItems}
            pathname={pathname}
            onNavigate={() => setOpen(false)}
          />
          {setupItems.length > 0 && (
            <>
              <div className="my-3 mx-3 border-t border-zinc-100" />
              <NavSection
                label="Setup"
                items={setupItems}
                pathname={pathname}
                onNavigate={() => setOpen(false)}
              />
            </>
          )}
        </nav>

        <div className="shrink-0 border-t border-zinc-100 p-3">
          <div className="mb-2 flex items-center gap-3 rounded-lg px-2 py-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-800"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-950">
                {displayName}
              </p>
              <div className="mt-0.5">
                <RoleBadge role={profile?.role} />
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            className="h-10 w-full justify-start rounded-lg text-zinc-700 hover:bg-zinc-50 hover:text-zinc-950"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {drawerOpen && (
        <button
          type="button"
          className="fixed inset-0 z-[35] bg-zinc-900/20 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Close overlay"
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b border-zinc-200/70 bg-white/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold tracking-tight text-zinc-950">
              {titleFromPathname(pathname)}
            </p>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
