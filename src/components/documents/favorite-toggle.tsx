"use client";

import * as React from "react";
import { toggleFavorite } from "@/app/actions/favorites";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function FavoriteToggle({
  documentId,
  initialIsFavorite,
}: {
  documentId: string;
  initialIsFavorite: boolean;
}) {
  const [isFavorite, setIsFavorite] = React.useState(initialIsFavorite);
  const [pending, setPending] = React.useState(false);

  async function handleToggle() {
    setPending(true);
    try {
      const result = await toggleFavorite(documentId);
      setIsFavorite(result.isFavorite);
    } catch {
      // Silently no-op on failure rather than blocking the rest of the
      // page with an error banner over what is, functionally, a small
      // convenience toggle — the user can just click it again.
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={pending}
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
    >
      <Star
        className={cn(
          "size-4",
          isFavorite ? "fill-current text-amber-500" : "text-muted-foreground"
        )}
      />
    </Button>
  );
}
