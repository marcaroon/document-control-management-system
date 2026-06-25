"use client";

import { Check } from "lucide-react";

export interface ClauseOption {
  id: string;
  clauseNumber: string;
  title: string;
  parentClauseId?: string | null;
}

/**
 * Best-practice rationale for how clause selection is presented,
 * applied consistently here and in ClauseTagger:
 * - Multi-select, not single-select: a document is very often relevant
 *   to more than one clause.
 * - Grouped by parent clause number, sorted numerically.
 * - Selection is OPTIONAL at every point clauses can be assigned.
 * - THE PARENT CLAUSE ITSELF IS ALWAYS SELECTABLE, even when it has
 *   children. This was a real bug, not a deliberate restriction: many
 *   documents are relevant at the main-clause level (e.g. a Quality
 *   Manual maps to Clause 4 "Context of the Organization" generally,
 *   not to one specific sub-clause like 4.1), and the previous version
 *   of this component only let you pick a parent when it had NO
 *   children — which excluded exactly the clauses (4, 5, 6...) most
 *   likely to need top-level tagging.
 */
export function ClausePickerList({
  allClauses,
  selected,
  onToggle,
}: {
  allClauses: ClauseOption[];
  selected: string[];
  onToggle: (clauseId: string) => void;
}) {
  if (allClauses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No ISO clauses exist yet for this organization — seed or create
        some from the Organization page, then come back to tag this
        document.
      </p>
    );
  }

  const parents = allClauses
    .filter((c) => !c.parentClauseId)
    .sort((a, b) => a.clauseNumber.localeCompare(b.clauseNumber, undefined, { numeric: true }));
  const childrenByParent = new Map<string, ClauseOption[]>();
  for (const c of allClauses) {
    if (c.parentClauseId) {
      const list = childrenByParent.get(c.parentClauseId) ?? [];
      list.push(c);
      childrenByParent.set(c.parentClauseId, list);
    }
  }

  return (
    <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
      {parents.map((parent) => {
        const children = childrenByParent
          .get(parent.id)
          ?.sort((a, b) => a.clauseNumber.localeCompare(b.clauseNumber, undefined, { numeric: true }));
        const isParentSelected = selected.includes(parent.id);

        return (
          <div key={parent.id} className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => onToggle(parent.id)}
              className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                isParentSelected ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <span>
                {parent.clauseNumber}. {parent.title}
              </span>
              {isParentSelected && <Check className="size-3.5 text-primary" />}
            </button>

            {children && children.length > 0 && (
              <div className="flex flex-col gap-1 pl-4">
                {children.map((c) => {
                  const isSelected = selected.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onToggle(c.id)}
                      className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                    >
                      <span>
                        {c.clauseNumber} {c.title}
                      </span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
