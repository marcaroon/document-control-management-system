"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Building2,
  Target,
  ScrollText,
  Settings,
  Search,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/rbac/permissions";
import type { Role } from "@/lib/types/core";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: (role: Role) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, visible: () => true },
  { href: "/search", label: "Search", icon: Search, visible: () => true },
  {
    href: "/documents",
    label: "Documents",
    icon: FileText,
    visible: (role) => hasPermission(role, "documents", "read"),
  },
];

const NAV_ITEMS_AFTER_CLAUSES: NavItem[] = [
  {
    href: "/organization",
    label: "Organization",
    icon: Building2,
    visible: (role) => hasPermission(role, "org_profile", "read"),
  },
  {
    href: "/vision-mission",
    label: "Vision & Mission",
    icon: Target,
    visible: (role) => hasPermission(role, "vision_mission", "read"),
  },
  {
    href: "/audit-trail",
    label: "Audit Trail",
    icon: ScrollText,
    visible: (role) => hasPermission(role, "audit_trail", "read"),
  },
  {
    href: "/settings/access-control",
    label: "Settings",
    icon: Settings,
    visible: (role) => hasPermission(role, "settings", "read"),
  },
];

interface ClauseRow {
  id: string;
  clauseNumber: string;
  title: string;
  parentClauseId: string | null;
}

interface SidebarProps {
  role: Role;
  clauses: ClauseRow[];
}

/**
 * Per explicit decision: clicking "ISO Clauses" only toggles the
 * sub-menu — it does not navigate anywhere. There is no /clauses
 * overview page; individual clause pages (/clauses/[clauseId]) are
 * reached only through this sub-menu or a direct link from a
 * document/search result elsewhere in the app.
 */
export function DashboardSidebar({ role, clauses }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const canReadClauses = hasPermission(role, "iso_clauses", "read");

  const parentClauses = React.useMemo(
    () =>
      clauses
        .filter((c) => !c.parentClauseId)
        .sort((a, b) => a.clauseNumber.localeCompare(b.clauseNumber, undefined, { numeric: true })),
    [clauses]
  );
  const childrenByParent = React.useMemo(() => {
    const map = new Map<string, ClauseRow[]>();
    for (const c of clauses) {
      if (c.parentClauseId) {
        const list = map.get(c.parentClauseId) ?? [];
        list.push(c);
        map.set(c.parentClauseId, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.clauseNumber.localeCompare(b.clauseNumber, undefined, { numeric: true }));
    }
    return map;
  }, [clauses]);

  const activeParentId = React.useMemo(() => {
    const match = pathname.match(/^\/clauses\/([^/]+)/);
    if (!match) return null;
    const activeId = match[1];
    const direct = parentClauses.find((p) => p.id === activeId);
    if (direct) return direct.id;
    for (const [parentId, children] of childrenByParent.entries()) {
      if (children.some((c) => c.id === activeId)) return parentId;
    }
    return null;
  }, [pathname, parentClauses, childrenByParent]);

  // Manual overrides only — null/"unset" means "no override, follow the
  // derived/active state below." This avoids syncing derived state via
  // useEffect+setState (which causes the cascading-render pattern the
  // set-state-in-effect lint rule flags); instead, the values actually
  // rendered are computed during render by combining the override with
  // whatever the current route implies.
  const [clausesExpandedOverride, setClausesExpandedOverride] = React.useState<boolean | null>(
    null
  );
  const [expandedParentOverride, setExpandedParentOverride] = React.useState<string | null | "unset">(
    "unset"
  );

  // Reset the parent-expand override when navigation moves to a
  // DIFFERENT parent clause section — otherwise collapsing one clause's
  // children would permanently suppress auto-expand for whichever
  // clause is navigated to next. Uses the React-documented "adjusting
  // state during render" pattern (a ref tracking the previous value,
  // compared and corrected synchronously in the render body) rather
  // than useEffect+setState, since this is a derived-state correction,
  // not a side effect synchronizing with an external system.
  const previousActiveParentIdRef = React.useRef(activeParentId);
  if (previousActiveParentIdRef.current !== activeParentId) {
    previousActiveParentIdRef.current = activeParentId;
    if (expandedParentOverride !== "unset") {
      setExpandedParentOverride("unset");
    }
  }

  const isOnClausesRoute = pathname.startsWith("/clauses");
  const clausesExpanded = clausesExpandedOverride ?? isOnClausesRoute;
  const expandedParentId =
    expandedParentOverride === "unset" ? activeParentId : expandedParentOverride;

  async function handleLogout() {
    await signOut(auth);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function renderNavItem(item: NavItem) {
    const active = pathname === item.href || pathname.startsWith(item.href + "/");
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
        )}
      >
        <Icon className="size-4" />
        {item.label}
      </Link>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r bg-card">
      <div className="border-b px-4 py-4">
        <p className="text-sm font-semibold leading-tight">QMS Document Control</p>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.filter((item) => item.visible(role)).map(renderNavItem)}

        {canReadClauses && (
          <div>
            <button
              type="button"
              onClick={() => setClausesExpandedOverride(!clausesExpanded)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <BookOpen className="size-4" />
              <span className="flex-1 text-left">ISO Clauses</span>
              <ChevronRight
                className={cn("size-3.5 transition-transform", clausesExpanded && "rotate-90")}
              />
            </button>

            {clausesExpanded && (
              <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l pl-2">
                {parentClauses.length === 0 ? (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground">No clauses yet.</p>
                ) : (
                  parentClauses.map((parent) => {
                    const children = childrenByParent.get(parent.id) ?? [];
                    const isParentExpanded = expandedParentId === parent.id;
                    const isParentActive = pathname === `/clauses/${parent.id}`;

                    return (
                      <div key={parent.id}>
                        <div className="flex items-center">
                          <Link
                            href={`/clauses/${parent.id}`}
                            className={cn(
                              "flex-1 truncate rounded-md px-3 py-1.5 text-sm transition-colors",
                              isParentActive
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                            )}
                          >
                            {parent.clauseNumber}. {parent.title}
                          </Link>
                          {children.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedParentOverride(
                                  expandedParentId === parent.id ? null : parent.id
                                )
                              }
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
                              aria-label={isParentExpanded ? "Collapse" : "Expand"}
                            >
                              <ChevronRight
                                className={cn(
                                  "size-3 transition-transform",
                                  isParentExpanded && "rotate-90"
                                )}
                              />
                            </button>
                          )}
                        </div>

                        {isParentExpanded && children.length > 0 && (
                          <div className="ml-3 flex flex-col gap-0.5 border-l pl-2">
                            {children.map((child) => {
                              const isChildActive = pathname === `/clauses/${child.id}`;
                              return (
                                <Link
                                  key={child.id}
                                  href={`/clauses/${child.id}`}
                                  className={cn(
                                    "truncate rounded-md px-3 py-1.5 text-xs transition-colors",
                                    isChildActive
                                      ? "bg-primary text-primary-foreground"
                                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                  )}
                                >
                                  {child.clauseNumber} {child.title}
                                </Link>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {NAV_ITEMS_AFTER_CLAUSES.filter((item) => item.visible(role)).map(renderNavItem)}
      </nav>
      <div className="border-t p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
