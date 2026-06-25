"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setNumberingTemplate } from "@/app/actions/settings";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/lib/types/core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function NumberingSettingsForm({
  initialTemplates,
}: {
  initialTemplates: Record<string, string>;
}) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState<Record<string, string>>(initialTemplates);
  const [savingType, setSavingType] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  async function handleSave(documentType: string) {
    setSavingType(documentType);
    setErrors((prev) => ({ ...prev, [documentType]: "" }));
    try {
      await setNumberingTemplate({
        documentType: documentType as (typeof DOCUMENT_TYPES)[number],
        template: templates[documentType] ?? "",
      });
      router.refresh();
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [documentType]: err instanceof Error ? err.message : "Failed to save.",
      }));
    } finally {
      setSavingType(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Document numbers are still typed by hand when creating a
        document — a template here only checks that what was typed
        matches the expected format. Use{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">{"{number}"}</code>{" "}
        as the placeholder, e.g. <code className="rounded bg-muted px-1 py-0.5 text-xs">QM-{"{number}"}</code>.
        Leave blank to skip validation for that type.
      </p>

      <div className="flex flex-col gap-3">
        {DOCUMENT_TYPES.map((type) => (
          <div key={type} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor={`template-${type}`}>{DOCUMENT_TYPE_LABELS[type]}</Label>
              <Input
                id={`template-${type}`}
                placeholder="e.g. QM-{number}"
                value={templates[type] ?? ""}
                onChange={(e) =>
                  setTemplates((prev) => ({ ...prev, [type]: e.target.value }))
                }
              />
              {errors[type] && <p className="text-xs text-destructive">{errors[type]}</p>}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={savingType === type}
              onClick={() => handleSave(type)}
            >
              {savingType === type ? "Saving…" : "Save"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
