"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { seedIsoClauses } from "@/app/actions/clauses";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function SeedClausesButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSeed() {
    setPending(true);
    setError(null);
    try {
      await seedIsoClauses();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed clauses.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleSeed} disabled={pending}>
        <Sparkles className="size-4" />
        {pending ? "Seeding…" : "Seed ISO 9001:2015 clauses"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
