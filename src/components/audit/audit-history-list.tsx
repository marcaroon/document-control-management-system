import type { Module } from "@/lib/types/core";

export interface AuditLogEntry {
  id: string;
  userName: string;
  action: string;
  module: Module;
  timestamp: string | null;
}

export function AuditHistoryList({ logs }: { logs: AuditLogEntry[] }) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit history yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {logs.map((log) => (
        <li key={log.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
          <span>
            <span className="font-medium">{log.userName}</span>{" "}
            <span className="font-mono text-xs text-muted-foreground">{log.action}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
