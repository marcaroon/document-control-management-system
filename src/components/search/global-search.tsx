"use client";

import * as React from "react";
import Link from "next/link";
import { getSearchIndex, type SearchIndexItem } from "@/app/actions/search";
import { Input } from "@/components/ui/input";
import { DocumentStatusBadge } from "@/components/shared/document-status-badge";
import { DOCUMENT_TYPE_LABELS } from "@/lib/types/core";
import { FileText, BookOpen, Building2, Search } from "lucide-react";

/**
 * Per explicit decision: client-side instant search. getSearchIndex()
 * is fetched ONCE on mount, held in component state, and filtered
 * in-memory on every keystroke — no server round-trip while typing.
 * See the large comment block in app/actions/search.ts for exactly what
 * is and isn't included in that index, and the RBAC/scale rationale.
 */
export function GlobalSearch() {
  const [index, setIndex] = React.useState<SearchIndexItem[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    getSearchIndex()
      .then(setIndex)
      .finally(() => setLoading(false));
  }, []);

  const results = React.useMemo(() => {
    if (!index || query.trim().length === 0) return [];
    const q = query.trim().toLowerCase();

    return index
      .filter((item) => {
        if (item.kind === "document") {
          return (
            item.documentNumber.toLowerCase().includes(q) ||
            item.title.toLowerCase().includes(q)
          );
        }
        if (item.kind === "clause") {
          return (
            item.clauseNumber.toLowerCase().includes(q) ||
            item.title.toLowerCase().includes(q)
          );
        }
        return item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q);
      })
      .slice(0, 30);
  }, [index, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder={
            loading
              ? "Loading search index…"
              : "Search documents, clauses, organization info…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          autoFocus
        />
      </div>

      {query.trim().length > 0 && (
        <div className="flex flex-col gap-1.5">
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No matches for &quot;{query}&quot;.
            </p>
          ) : (
            results.map((item) => <SearchResultRow key={`${item.kind}-${item.id}`} item={item} />)
          )}
        </div>
      )}
    </div>
  );
}

function SearchResultRow({ item }: { item: SearchIndexItem }) {
  if (item.kind === "document") {
    return (
      <Link
        href={`/documents/${item.id}`}
        className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent"
      >
        <span className="flex items-center gap-2 text-sm">
          <FileText className="size-4 text-muted-foreground" />
          <span className="font-medium">{item.documentNumber}</span>
          {item.title}
          <span className="text-muted-foreground">· {DOCUMENT_TYPE_LABELS[item.type]}</span>
        </span>
        <DocumentStatusBadge status={item.status} />
      </Link>
    );
  }

  if (item.kind === "clause") {
    return (
      <Link
        href={`/clauses/${item.id}`}
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
      >
        <BookOpen className="size-4 text-muted-foreground" />
        <span className="font-medium">{item.clauseNumber}</span>
        {item.title}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
      <Building2 className="size-4 text-muted-foreground" />
      <span className="font-medium">{item.label}:</span>
      <span className="truncate text-muted-foreground">{item.value}</span>
    </div>
  );
}
