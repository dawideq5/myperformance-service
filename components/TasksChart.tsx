"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { name: "Pon", ukończone: 4, w_trakcie: 2 },
  { name: "Wt", ukończone: 5, w_trakcie: 3 },
  { name: "Śr", ukończone: 6, w_trakcie: 1 },
  { name: "Czw", ukończone: 4, w_trakcie: 4 },
  { name: "Pt", ukończone: 7, w_trakcie: 2 },
];

export function TasksChart() {
  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-100 mb-4">Postęp zadań</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" stroke="#9CA3AF" />
          <YAxis stroke="#9CA3AF" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1F2937",
              border: "1px solid #374151",
              borderRadius: "8px",
            }}
            itemStyle={{ color: "#E5E7EB" }}
          />
          <Line
            type="monotone"
            dataKey="ukończone"
            stroke="#10B981"
            strokeWidth={2}
            dot={{ fill: "#10B981" }}
          />
          <Line
            type="monotone"
            dataKey="w_trakcie"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ fill: "#3B82F6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
