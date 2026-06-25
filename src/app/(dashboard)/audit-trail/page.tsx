import * as React from "react";
import { listAuditLogs } from "@/app/actions/audit";
import { AuditTrailFilter } from "@/components/audit/audit-trail-filter";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import type { Module } from "@/lib/types/core";

interface AuditLogRow {
  id: string;
  userName: string;
  action: string;
  module: Module;
  targetType: string;
  targetId: string;
  timestamp: string | null;
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const { module } = await searchParams;

  const { logs: rawLogs } = await listAuditLogs({
    module: module as Module | undefined,
  });
  const logs = rawLogs as unknown as AuditLogRow[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">
            Every mutating action in this organization, recorded automatically.
            No role can edit or delete these rows — see §4 of the spec.
          </p>
        </div>
        <React.Suspense fallback={null}>
          <AuditTrailFilter />
        </React.Suspense>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No audit log entries{module ? ` for "${module}"` : ""} yet.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Target</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>{log.userName}</TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell className="text-muted-foreground">{log.module}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {log.targetType} · {log.targetId.slice(0, 8)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing the most recent {logs.length} entries
        {module ? ` for "${module}"` : ""}. Pagination ships alongside global
        search in Phase 4 per the roadmap.
      </p>
    </div>
  );
}
