"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

import { api } from "../../lib/api";
import { useAuth } from "../../lib/useAuth";

import Sidebar from "../components/Sidebar";
import DashboardHeader from "./DashboardHeader";
import StatCard from "../dashboard/StatCard";
import ChartCard from "./ChartCard";

function timeAgo(timestamp: string) {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;

  return `${Math.floor(mins / 60)} hr ago`;
}

// ---- Sample data (frontend-only, no backend/API changes) ----

// Manual vs AI Agent — Onboarding, Employee Count by Month
const onboardingProcessComparison = [
  { month: "Jan", manual: 18, aiAgent: 9 },
  { month: "Feb", manual: 22, aiAgent: 14 },
  { month: "Mar", manual: 20, aiAgent: 19 },
  { month: "Apr", manual: 25, aiAgent: 24 },
  { month: "May", manual: 21, aiAgent: 27 },
  { month: "Jun", manual: 19, aiAgent: 31 },
  { month: "Jul", manual: 17, aiAgent: 33 },
];

// Manual vs AI Agent — Offboarding, Employee Count by Month
const offboardingProcessComparison = [
  { month: "Jan", manual: 12, aiAgent: 5 },
  { month: "Feb", manual: 14, aiAgent: 7 },
  { month: "Mar", manual: 13, aiAgent: 10 },
  { month: "Apr", manual: 15, aiAgent: 13 },
  { month: "May", manual: 11, aiAgent: 15 },
  { month: "Jun", manual: 10, aiAgent: 17 },
  { month: "Jul", manual: 9, aiAgent: 18 },
];

// Department-wise Onboarding distribution (HR & IT only)
const departmentOnboarding = [
  { name: "HR", value: 14 },
  { name: "IT", value: 28 },
];

// Department-wise Offboarding distribution (HR & IT only)
const departmentOffboarding = [
  { name: "HR", value: 6 },
  { name: "IT", value: 13 },
];

// Navy/gold-derived palette so the pie slices stay on-brand
const PIE_COLORS = [
  "#14213D", // navy
  "#D9A653", // gold
  "#5C6F9C", // muted steel blue
  "#B8860B", // deep gold
  "#8D99AE", // cool grey-blue
  "#3A4F7A", // secondary navy
];

// AI-generated insight callouts for the HR manager
const aiInsights = [
  {
    title: "Pending time is trending up",
    detail:
      "Average time-in-pending for onboarding approvals has risen over the last 3 weeks, mostly stuck at the IT Provisioning stage. This stage is now the slowest step in the workflow.",
    severity: "warning",
  },
  {
    title: "License allocation isn't auto-completing",
    detail:
      "Several IT Provisioning tasks are stalling because software licenses aren't being assigned automatically. These cases are falling back to manual allocation, which adds delay to the overall approval chain.",
    severity: "critical",
  },
  {
    title: "AI Agent is outpacing manual processing",
    detail:
      "Since April, the AI Agent process has been closing more onboarding and offboarding cases per month than the manual process, with the gap widening each month.",
    severity: "positive",
  },
  {
    title: "IT carries most of the onboarding load",
    detail:
      "IT accounts for roughly twice the onboarding volume of HR. Prioritizing license and access-provisioning fixes for IT will have the largest impact on pending time.",
    severity: "info",
  },
];

const severityStyles: Record<string, string> = {
  critical: "border-red-200 bg-red-50",
  warning: "border-amber-200 bg-amber-50",
  positive: "border-emerald-200 bg-emerald-50",
  info: "border-gray-200 bg-gray-50",
};

const severityDot: Record<string, string> = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  positive: "bg-emerald-500",
  info: "bg-[#14213D]",
};

export default function DashboardPage() {
  useAuth();

  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    api.dashboardSummary().then(setSummary);
  }, []);

  return (
    <Sidebar>
      <div className="flex-1 bg-gray-50 min-h-screen p-4">

        <DashboardHeader />

        {!summary ? (
          <p className="mt-6">Loading...</p>
        ) : (
          <>

            {/* Stat Cards */}

            <div className="grid grid-cols-3 gap-3 mt-1">

              <StatCard
                label="Total Employees"
                value={summary.total_employees}
              />

              <StatCard
                label="Onboarded Today"
                value={summary.onboarded_today}
              />

              <StatCard
                label="Offboarded Today"
                value={summary.offboarded_today}
              />

              <StatCard
                label="Pending Onboarding"
                value={summary.pending_onboarding}
              />

              <StatCard
                label="Pending Offboarding"
                value={summary.pending_offboarding}
              />

              <StatCard
                label="Approval Pending"
                value={summary.pending_approvals}
              />

            </div>

            {/* Charts */}

            <div className="grid grid-cols-2 gap-4 mt-5">

              <ChartCard title="Onboarding: Manual vs AI Agent (Employee Count)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={onboardingProcessComparison}>

                      <XAxis dataKey="month" />
                      <YAxis
                        label={{
                          value: "Employee Count",
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 12 },
                        }}
                      />
                      <Tooltip />
                      <Legend />

                      <Line
                        type="monotone"
                        dataKey="manual"
                        name="Manual Process"
                        stroke="#2563EB"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="aiAgent"
                        name="AI Agent Process"
                        stroke="#EF4444"
                        strokeWidth={2}
                      />

                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Offboarding: Manual vs AI Agent (Employee Count)">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={offboardingProcessComparison}>

                      <XAxis dataKey="month" />
                      <YAxis
                        label={{
                          value: "Employee Count",
                          angle: -90,
                          position: "insideLeft",
                          style: { fontSize: 12 },
                        }}
                      />
                      <Tooltip />
                      <Legend />

                      <Line
                        type="monotone"
                        dataKey="manual"
                        name="Manual Process"
                        stroke="#2563EB"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="aiAgent"
                        name="AI Agent Process"
                        stroke="#EF4444"
                        strokeWidth={2}
                      />

                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Department-wise Onboarding">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={departmentOnboarding}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {departmentOnboarding.map((entry, index) => (
                          <Cell
                            key={`onboard-cell-${entry.name}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Department-wise Offboarding">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={departmentOffboarding}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`
                        }
                      >
                        {departmentOffboarding.map((entry, index) => (
                          <Cell
                            key={`offboard-cell-${entry.name}`}
                            fill={PIE_COLORS[index % PIE_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

            </div>

            {/* AI Insights */}

            <div className="bg-white border rounded-xl p-6 mt-8">

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  AI Insights
                </h3>
                <span className="text-xs text-gray-500">
                  Generated from current approval &amp; provisioning data
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {aiInsights.map((insight) => (
                  <div
                    key={insight.title}
                    className={`rounded-lg border p-4 ${severityStyles[insight.severity]}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`h-2 w-2 rounded-full ${severityDot[insight.severity]}`}
                      />
                      <span className="font-semibold text-sm">
                        {insight.title}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 leading-snug">
                      {insight.detail}
                    </p>
                  </div>
                ))}
              </div>

            </div>

            {/* Recent Activity */}

            <div className="bg-white border rounded-xl p-6 mt-8">

              <h3 className="text-lg font-semibold mb-4">
                Recent Activity
              </h3>

              {summary.recent_activity.map((activity: any, index: number) => (

                <div
                  key={index}
                  className="border-b last:border-0 py-3"
                >
                  <span className="font-semibold">
                    {activity.agent}
                  </span>

                  {" "}—{" "}

                  {activity.action}

                  <span className="text-gray-500 ml-2">
                    ({timeAgo(activity.timestamp)})
                  </span>

                </div>

              ))}

            </div>

          </>
        )}

      </div>
    </Sidebar>
  );
}