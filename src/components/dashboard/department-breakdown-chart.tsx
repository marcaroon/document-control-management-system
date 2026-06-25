"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DepartmentChartDatum {
  departmentName: string;
  count: number;
}

export function DepartmentBreakdownChart({ data }: { data: DepartmentChartDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No documents yet.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="departmentName" fontSize={12} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis allowDecimals={false} fontSize={12} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          formatter={(value) => [value, "Documents"]}
        />
        <Bar dataKey="count" fill="#1e3a5f" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
