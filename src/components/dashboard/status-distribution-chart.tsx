"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface StatusChartDatum {
  status: string;
  label: string;
  count: number;
}

/**
 * Colors intentionally match the CSS custom properties used by
 * DocumentStatusBadge (components/shared/document-status-badge.tsx) so
 * a document's color coding is consistent whether seen as a badge or a
 * bar on this chart. Recharts needs literal hex values rather than CSS
 * var() references for fill colors in some render paths, so these are
 * duplicated from globals.css rather than read live — if the palette in
 * globals.css changes, update both places.
 */
const STATUS_COLORS: Record<string, string> = {
  draft: "#5b6573",
  submitted_for_review: "#9a6700",
  under_review: "#9a6700",
  effective: "#1a7f4b",
  obsolete: "#6b5ca5",
  archived: "#5b6573",
};

export function StatusDistributionChart({ data }: { data: StatusChartDatum[] }) {
  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No documents yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} fontSize={12} />
        <YAxis type="category" dataKey="label" width={120} fontSize={12} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          formatter={(value) => [value, "Documents"]}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#5b6573"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
