import { GlobalSearch } from "@/components/search/global-search";

export default function SearchPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Search across documents, ISO clauses, and organization profile
          fields you have access to.
        </p>
      </div>
      <GlobalSearch />
    </div>
  );
}
