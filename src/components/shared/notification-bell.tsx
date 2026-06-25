"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/auth-provider";
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

interface NotificationRow {
  id: string;
  type: string;
  relatedDocumentId?: string;
  message: string;
  isRead: boolean;
}

/**
 * §7: "Phase 1-2: In-app only, via Firestore listener on
 * notifications/{userId}." This is that listener — onSnapshot gives
 * real-time updates without polling, scoped by firestore.rules to only
 * this user's own notifications/{id} rows (rules check
 * resource.data.userId == request.auth.uid, not a query-time filter
 * alone — the query below filters by userId too, but the rule is what
 * actually prevents reading anyone else's inbox even if the query were
 * written wrong).
 */
export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = React.useState<NotificationRow[]>([]);

  React.useEffect(() => {
    if (!user) {
      // No early setState call here — the previous effect run's cleanup
      // (the `return () => unsub()` below, from the last time `user` was
      // truthy) already tore down the old listener. We still need
      // notifications cleared for the signed-out state, but doing that
      // via a synchronous setState at the top of the effect body is what
      // react-hooks/set-state-in-effect flags (it causes a render whose
      // only purpose is to synchronize React state with React state,
      // which usually means the value belongs in cleanup or in a
      // derived computation instead). Returning a no-op subscription
      // here means there's deliberately nothing to clean up — and the
      // cleanup function for the PREVIOUS (user-present) run is what
      // actually unsubscribes; this branch just skips creating a new one.
      return () => {};
    }

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      setNotifications(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificationRow)
      );
    });

    return () => {
      unsub();
      // Clear on teardown (covers both "component unmounting" and "user
      // changed/signed out, this effect instance is being cleaned up
      // before the next run") rather than at the top of a future run.
      setNotifications([]);
    };
  }, [user]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function markAsRead(id: string) {
    // Direct client write — permitted by firestore.rules' notifications
    // match block (userId === auth.uid), no server action needed for
    // this one. See §2: "Notifications: Full (own)" for every role.
    await updateDoc(doc(db, "notifications", id), { isRead: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        )}
        {notifications.map((n) => (
          <DropdownMenuItem
            key={n.id}
            asChild
            className={n.isRead ? "opacity-60" : ""}
            onSelect={() => !n.isRead && markAsRead(n.id)}
          >
            <Link
              href={n.relatedDocumentId ? `/documents/${n.relatedDocumentId}` : "#"}
              className="flex flex-col items-start gap-0.5 whitespace-normal"
            >
              <span className="text-sm leading-snug">{n.message}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
