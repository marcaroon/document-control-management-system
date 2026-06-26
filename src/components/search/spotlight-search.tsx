"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { getSearchIndex, type SearchIndexItem } from "@/app/actions/search";
import { DocumentStatusBadge } from "@/components/shared/document-status-badge";
import { DOCUMENT_TYPE_LABELS } from "@/lib/types/core";
import { Search, FileText, BookOpen, Building2, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";

/* ─────────────────────────────────────────────────────────────────── */
/*  Types                                                              */
/* ─────────────────────────────────────────────────────────────────── */

interface SpotlightGroup {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: SearchIndexItem[];
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Helpers                                                            */
/* ─────────────────────────────────────────────────────────────────── */

function groupResults(items: SearchIndexItem[]): SpotlightGroup[] {
  const groups: SpotlightGroup[] = [];

  const documents = items.filter((i) => i.kind === "document");
  if (documents.length > 0) {
    groups.push({ key: "documents", label: "Documents", icon: FileText, items: documents });
  }

  const clauses = items.filter((i) => i.kind === "clause");
  if (clauses.length > 0) {
    groups.push({ key: "clauses", label: "ISO Clauses", icon: BookOpen, items: clauses });
  }

  const orgFields = items.filter((i) => i.kind === "org_profile");
  if (orgFields.length > 0) {
    groups.push({ key: "org", label: "Organization", icon: Building2, items: orgFields });
  }

  return groups;
}

/** Build a flat array of navigable item references for keyboard nav. */
function flatItems(groups: SpotlightGroup[]): SearchIndexItem[] {
  return groups.flatMap((g) => g.items);
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Public component                                                   */
/* ─────────────────────────────────────────────────────────────────── */

interface SpotlightSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SpotlightSearch({ open, onOpenChange }: SpotlightSearchProps) {
  const router = useRouter();

  // ── Search index (lazy-loaded on first open) ──
  const [index, setIndex] = React.useState<SearchIndexItem[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const hasLoadedRef = React.useRef(false);

  React.useEffect(() => {
    if (open && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      setLoading(true);
      getSearchIndex()
        .then(setIndex)
        .finally(() => setLoading(false));
    }
  }, [open]);

  // ── Query + filtering ──
  const [query, setQuery] = React.useState("");

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

  const groups = React.useMemo(() => groupResults(results), [results]);
  const flat = React.useMemo(() => flatItems(groups), [groups]);

  // ── Keyboard navigation ──
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  // Reset active index when results change
  React.useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  // Reset query when modal closes
  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  function navigateToItem(item: SearchIndexItem) {
    if (item.kind === "document") {
      router.push(`/documents/${item.id}`);
    } else if (item.kind === "clause") {
      router.push(`/clauses/${item.id}`);
    }
    // org_profile items are non-navigable
    if (item.kind !== "org_profile") {
      onOpenChange(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (flat.length === 0) return;

    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        const next = activeIndex < flat.length - 1 ? activeIndex + 1 : 0;
        setActiveIndex(next);
        scrollToItem(next);
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        const prev = activeIndex > 0 ? activeIndex - 1 : flat.length - 1;
        setActiveIndex(prev);
        scrollToItem(prev);
        break;
      }
      case "Enter": {
        e.preventDefault();
        const item = flat[activeIndex];
        if (item) navigateToItem(item);
        break;
      }
    }
  }

  function scrollToItem(idx: number) {
    const el = listRef.current?.querySelector(`[data-spotlight-idx="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }

  // ── Render helpers ──
  function getItemId(item: SearchIndexItem) {
    return `${item.kind}-${item.id}`;
  }

  const hasQuery = query.trim().length > 0;
  const hasResults = flat.length > 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-spotlight-overlay=""
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        />
        <DialogPrimitive.Content
          data-spotlight-panel=""
          aria-label="Search"
          onKeyDown={handleKeyDown}
          className="fixed left-1/2 top-[15vh] z-50 w-[calc(100%-2rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-border/50 bg-popover shadow-2xl outline-none"
        >
          {/* ── Visually hidden title for a11y ── */}
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search across documents, ISO clauses, and organization profile.
          </DialogPrimitive.Description>

          {/* ── Search input ── */}
          <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              id="spotlight-search-input"
              className="flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
              placeholder={
                loading
                  ? "Loading search index…"
                  : "Search documents, clauses, organization…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={loading}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* ── Results area ── */}
          <div
            ref={listRef}
            className="max-h-[400px] overflow-y-auto overscroll-contain"
          >
            {/* Loading shimmer */}
            {loading && (
              <div className="flex flex-col gap-3 px-4 py-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="size-4 animate-pulse rounded bg-muted" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty state: has query, no results */}
            {!loading && hasQuery && !hasResults && (
              <div className="flex flex-col items-center gap-2 py-10">
                <Search className="size-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No results for &quot;{query}&quot;
                </p>
              </div>
            )}

            {/* Idle state: no query yet */}
            {!loading && !hasQuery && (
              <div className="flex flex-col items-center gap-2 py-10">
                <Search className="size-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground/60">
                  Type to search across your workspace
                </p>
              </div>
            )}

            {/* Results grouped by category */}
            {!loading && hasResults && (
              <div className="py-2">
                {groups.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.key}>
                      {/* Section header */}
                      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
                        <GroupIcon className="size-3.5 text-muted-foreground/60" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                          {group.label}
                        </span>
                      </div>

                      {/* Items */}
                      {group.items.map((item) => {
                        const flatIdx = flat.indexOf(item);
                        const isActive = flatIdx === activeIndex;
                        return (
                          <SpotlightResultRow
                            key={getItemId(item)}
                            item={item}
                            isActive={isActive}
                            flatIdx={flatIdx}
                            onSelect={() => navigateToItem(item)}
                            onHover={() => setActiveIndex(flatIdx)}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Footer hints ── */}
          {hasResults && (
            <div className="flex items-center gap-4 border-t border-border/50 px-4 py-2">
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <ArrowUp className="size-3" />
                <ArrowDown className="size-3" />
                <span>Navigate</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <CornerDownLeft className="size-3" />
                <span>Open</span>
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
                <span className="font-medium">ESC</span>
                <span>Close</span>
              </span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/*  Result row                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function SpotlightResultRow({
  item,
  isActive,
  flatIdx,
  onSelect,
  onHover,
}: {
  item: SearchIndexItem;
  isActive: boolean;
  flatIdx: number;
  onSelect: () => void;
  onHover: () => void;
}) {
  if (item.kind === "document") {
    return (
      <button
        type="button"
        data-spotlight-idx={flatIdx}
        onClick={onSelect}
        onMouseEnter={onHover}
        className={`flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-foreground/80 hover:bg-accent/50"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            <span className="font-medium">{item.documentNumber}</span>
            <span className="mx-1.5 text-muted-foreground">—</span>
            <span>{item.title}</span>
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {DOCUMENT_TYPE_LABELS[item.type]}
          </span>
        </span>
        <DocumentStatusBadge status={item.status} />
      </button>
    );
  }

  if (item.kind === "clause") {
    return (
      <button
        type="button"
        data-spotlight-idx={flatIdx}
        onClick={onSelect}
        onMouseEnter={onHover}
        className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
          isActive
            ? "bg-primary/10 text-foreground"
            : "text-foreground/80 hover:bg-accent/50"
        }`}
      >
        <BookOpen className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          <span className="font-medium">{item.clauseNumber}</span>
          <span className="mx-1.5 text-muted-foreground">—</span>
          <span>{item.title}</span>
        </span>
        {isActive && (
          <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        )}
      </button>
    );
  }

  // org_profile — non-navigable, just displays
  return (
    <div
      data-spotlight-idx={flatIdx}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
        isActive
          ? "bg-primary/10 text-foreground"
          : "text-foreground/80"
      }`}
    >
      <Building2 className="size-4 shrink-0 text-muted-foreground" />
      <span className="font-medium">{item.label}:</span>
      <span className="truncate text-muted-foreground">{item.value}</span>
    </div>
  );
}
