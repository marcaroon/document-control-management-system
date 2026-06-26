"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { ROLE_LABELS, type Role } from "@/lib/types/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface UserMenuProps {
  name: string;
  email: string;
  role: Role;
}

/**
 * User avatar dropdown in the header bar, next to the notification bell.
 * Shows user info (name, email, role badge) and provides access to the
 * profile page and sign-out action. This follows the standard SaaS
 * pattern (GitHub, Linear, Notion, etc.) where the user menu lives in
 * the top-right corner, separate from the sidebar's module navigation.
 */
export function UserMenu({ name, email, role }: UserMenuProps) {
  const router = useRouter();

  // Derive initials from the user's display name
  const initials = React.useMemo(() => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (name[0] ?? "U").toUpperCase();
  }, [name]);

  async function handleLogout() {
    await signOut(auth);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative flex items-center gap-2 px-2"
        >
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              "bg-primary text-[11px] font-semibold text-primary-foreground",
              "ring-2 ring-background"
            )}
          >
            {initials}
          </span>
          <span className="hidden text-sm font-medium sm:inline-block">
            {name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1 font-normal">
          <p className="text-sm font-medium leading-none">{name}</p>
          <p className="text-xs text-muted-foreground">{email}</p>
          <Badge
            variant="secondary"
            className="mt-1 w-fit text-[10px] font-medium"
          >
            {ROLE_LABELS[role]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile" className="flex items-center gap-2">
            <User className="size-4" />
            My Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="flex items-center gap-2 text-muted-foreground focus:text-foreground"
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
