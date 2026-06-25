import { listDepartments } from "@/app/actions/organization";
import { getNumberingTemplatesForHint } from "@/app/actions/settings";
import { listIsoClauses } from "@/app/actions/clauses";
import { NewDocumentForm } from "@/components/documents/new-document-form";

export default async function NewDocumentPage({
  searchParams,
}: {
  searchParams: Promise<{ clauseId?: string }>;
}) {
  const { clauseId } = await searchParams;
  const departments = (await listDepartments()) as unknown as { id: string; name: string }[];
  const numberingTemplates = await getNumberingTemplatesForHint();
  const rawClauses = await listIsoClauses();
  const clauses = rawClauses as unknown as {
    id: string;
    clauseNumber: string;
    title: string;
    parentClauseId: string | null;
  }[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New document</h1>
        <p className="text-sm text-muted-foreground">
          Created in Draft status. Upload a revision and submit it for
          review from the document page once created.
        </p>
      </div>
      <NewDocumentForm
        departments={departments}
        numberingTemplates={numberingTemplates}
        clauses={clauses}
        preselectedClauseId={clauseId}
      />
    </div>
  );
}
