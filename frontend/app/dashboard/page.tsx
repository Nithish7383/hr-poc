"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
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

  <ChartCard title="Onboarding Trend (7 Days)">
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={summary.onboarding_trend}>

          <XAxis
            dataKey="date"
            tickFormatter={(date) =>
              new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
          />

          <YAxis />

          <Tooltip
            labelFormatter={(date) =>
              new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
          />

          <Line
            type="monotone"
            dataKey="count"
            stroke="#6366f1"
            strokeWidth={2}
          />

        </LineChart>
      </ResponsiveContainer>
    </div>
  </ChartCard>


  <ChartCard title="Offboarding Trend (7 Days)">
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={summary.offboarding_trend}>

          <XAxis
            dataKey="date"
            tickFormatter={(date) =>
              new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
          />

          <YAxis />

          <Tooltip
            labelFormatter={(date) =>
              new Date(date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
          />

          <Line
            type="monotone"
            dataKey="count"
            stroke="#ef4444"
            strokeWidth={2}
          />

        </LineChart>
      </ResponsiveContainer>
    </div>
  </ChartCard>


              <ChartCard title="Department-wise Employees">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.department_distribution}>
                      <XAxis
                        dataKey="name"
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#101d38"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard title="Role-wise Distribution">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.role_distribution}>
                      <XAxis
                        dataKey="name"
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        fill="#EAB308"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

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