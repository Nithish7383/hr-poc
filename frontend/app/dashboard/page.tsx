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
  CartesianGrid,
} from "recharts";

import { api } from "../../lib/api";
import { useAuth } from "../../lib/useAuth";

import Sidebar from "../components/Sidebar";

/* ============================================================
   Design tokens (matches workforce_overview_revamp_ForReview.html)
============================================================ */

const T = {
  navy: "#0d1730",
  navyActive: "#16234a",
  amber: "#c9791f",
  border: "#e6e8ee",
  bg: "#f5f6f9",
  text: "#111827",
  muted: "#6b7280",
  blue: "#3b6fe0",
  red: "#e0473b",
  green: "#2e9b6f",
  purple: "#7e6bd6",
};

/* Palette cycled across department slices — extend if you expect
   more than 6 departments at once. */
const DEPT_COLORS = [T.blue, T.green, T.amber, T.purple, T.red, "#0ea5a5"];

/* ============================================================
   AI vs Manual progress — MOCK DATA.

   Backend today only exposes `onboarding_trend` as "employees onboarded
   per day" (see /dashboard/summary) — it does NOT yet break that count
   down by "completed via AI agent" vs "completed manually by HR/IT".
   So this chart cannot be wired to real data until that split exists
   on the backend.

   To make this real, the backend would need something like:
     onboarding_progress_weekly: [
       { week: "Week 1", ai_completed: <count>, manual_completed: <count> },
       ...
     ]
   where ai_completed = employees whose onboarding tasks were fully
   auto-completed by the agent pipelines (Validation/IT/HR/Manager/Security
   tracks you already see in recent_activity), and manual_completed =
   employees where a human had to step in (e.g. the "Blocked -- missing
   documents" / manual document-approval cases already in recent_activity).

   What each line means, until that field exists:
   - "AI progress" (blue, solid) = cumulative count of employees whose
     onboarding was completed end-to-end by the agent pipelines, with no
     human intervention needed, tracked week over week.
   - "Manual progress" (red, dashed) = cumulative count of employees
     whose onboarding needed a human (HR/IT) to step in at some point
     (e.g. missing documents, manual approval), tracked the same way.
   - Both lines are cumulative and capped at total_employees, so together
     they explain how the current employee count was reached — how much
     of it the AI agent handled on its own vs how much needed a human.

   Until the backend field exists, this is illustrative mock data:
   X-axis = week, Y-axis = cumulative employee count onboarded through
   each path, capped at total_employees so it stays consistent with the
   KPI cards.
============================================================ */

const onboardingAiManual = [
  { week: "Week 1", ai: 1, manual: 0 },
  { week: "Week 2", ai: 4, manual: 1 },
  { week: "Week 3", ai: 6, manual: 2 },
  { week: "Week 4", ai: 6, manual: 3 },
];

// No offboarding activity yet (offboarded_today: 0) — kept as an honest
// all-zero line rather than invented numbers, until there's real
// offboarding activity to chart.
const offboardingAiManual = [
  { week: "Week 1", ai: 0, manual: 0 },
  { week: "Week 2", ai: 0, manual: 0 },
  { week: "Week 3", ai: 0, manual: 0 },
  { week: "Week 4", ai: 0, manual: 0 },
];

/* Insights come live from api.insightsSummary() (same source as the
   AI Insights Dashboard page). Category → label/color mirrors that page's
   CATEGORY_TITLE / CATEGORY_COLOR / CATEGORY_BG so the two stay consistent. */

const CATEGORY_LABEL: Record<string, string> = {
  onboarding_delay: "ONBOARDING DELAY",
  department_duration: "DEPARTMENT DURATION",
  compliance_incomplete: "COMPLIANCE",
  overdue_assets: "ASSETS",
  high_risk_access: "HIGH RISK ACCESS",
};

const CATEGORY_TAG_COLOR: Record<string, string> = {
  onboarding_delay: "#EF4444",
  department_duration: "#3B82F6",
  compliance_incomplete: "#F59E0B",
  overdue_assets: "#8B5CF6",
  high_risk_access: "#DC2626",
};

const CATEGORY_TAG_BG: Record<string, string> = {
  onboarding_delay: "#FEE2E2",
  department_duration: "#DBEAFE",
  compliance_incomplete: "#FEF3C7",
  overdue_assets: "#EDE9FE",
  high_risk_access: "#FECACA",
};

/* ============================================================
   Small building blocks
============================================================ */

function KpiCard({ label, value, sub }: { label: string; value: number | string; sub: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 8, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: T.text }}>{value}</div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Panel({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: T.text }}>{title}</h3>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>{sub}</div>
      {children}
    </div>
  );
}

function DonutChart({
  data,
  total,
  defaultTitle,
  showLegend = true,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
  defaultTitle: string;
  showLegend?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const active =
    activeIndex !== null
      ? data[activeIndex]
      : {
          name: defaultTitle,
          value: total,
        };

  return (
    <div
      style={{
        position: "relative",
        height: 210,
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="60%"
            outerRadius="85%"
            paddingAngle={data.length > 1 ? 3 : 0}
            stroke="#fff"
            strokeWidth={2}
            activeIndex={activeIndex ?? undefined}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.color}
                style={{
                  cursor: "pointer",
                  opacity:
                    activeIndex === null || activeIndex === index
                      ? 1
                      : 0.45,
                  transition: "all .25s",
                }}
              />
            ))}
          </Pie>

          {showLegend && (
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              iconSize={8}
              wrapperStyle={{
                fontSize: 12,
              }}
            />
          )}
        </PieChart>
      </ResponsiveContainer>

      <div
        style={{
          position: "absolute",
          top: showLegend ? "42%" : "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          {active.value}
        </div>

        <div
          style={{
            fontSize: 13,
            color: "#666",
            marginTop: 4,
          }}
        >
          {active.name}
        </div>
      </div>
    </div>
  );
}

function AiManualLineChart({ data, maxY }: { data: any[]; maxY?: number }) {
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="week" tick={{ fontSize: 11.5, fill: T.muted }} />
          <YAxis
            allowDecimals={false}
            domain={[0, maxY ?? "auto"]}
            tick={{ fontSize: 11.5, fill: T.muted }}
          />
          <Tooltip />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11.5, color: T.muted }}
          />
          <Line type="monotone" dataKey="ai" name="AI progress" stroke={T.blue} strokeWidth={2} dot={{ r: 3 }} />
          <Line
            type="monotone"
            dataKey="manual"
            name="Manual progress"
            stroke={T.red}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ============================================================
   Dashboard Component
============================================================ */

export default function DashboardPage() {
  useAuth();

  const [summary, setSummary] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(true);

  useEffect(() => {
    api.dashboardSummary().then(setSummary);
    api.insightsSummary().then((data) => {
      setInsights(data.insights || []);
      setInsightsLoading(false);
    });
  }, []);

  if (!summary) {
    return (
      <Sidebar>
        <div style={{ padding: 24 }}>Loading Dashboard...</div>
      </Sidebar>
    );
  }

  // ---- Values sourced directly from the backend summary payload ----
  const totalEmployees = Number(summary.total_employees ?? 0) + Number(summary.pending_documents ?? 0);
  const onboardedToday = Number(summary.total_onboarded ?? 0);
  const offboardedToday = Number(summary.total_offboarded ?? 0);
  const pendingOnboarding = Number(summary.pending_onboarding ?? 0) + Number(summary.pending_documents ?? 0);
  const pendingOffboarding = Number(summary.pending_offboarding ?? 0);
  // Backend already computes this total (IT + HR combined) — use it directly
  // instead of re-deriving it on the frontend.
  const pendingApprovalsTotal = Number(summary.pending_approvals ?? 0);

  // Backend doesn't provide a real IT/HR or per-track approval breakdown —
  // it only gives one combined total (pending_approvals). Rather than
  // guessing a split (previous version assumed "×2 for IT+HR", which didn't
  // reconcile with pending_approvals), these two donuts show the real
  // number of employees waiting on approval in each track.
  const onboardingApprovalCount = pendingOnboarding;
  const offboardingApprovalCount = pendingOffboarding;

  const approvalOnboarding =
    onboardingApprovalCount > 0
      ? [{ name: "Onboarding approvals", value: onboardingApprovalCount, color: T.blue }]
      : [{ name: "No pending approvals", value: 1, color: T.border }];

  const approvalOffboarding =
    offboardingApprovalCount > 0
      ? [{ name: "Offboarding approvals", value: offboardingApprovalCount, color: T.red }]
      : [{ name: "No pending approvals", value: 1, color: T.border }];

  // Department distribution — backend provides one org-wide breakdown
  // (department_distribution). Until it's split by onboarded/offboarded
  // status, map it to "Onboarded by department" (current dataset is all
  // onboarded employees) and show "no activity" for offboarded until
  // offboarded_today > 0.
  const departmentDistribution: { name: string; count: number }[] = Array.isArray(
    summary.department_distribution
  )
    ? summary.department_distribution
    : [];

  const deptOnboarded = departmentDistribution.map((d, i) => ({
    name: d.name,
    value: d.count,
    color: DEPT_COLORS[i % DEPT_COLORS.length],
  }));

  const deptOffboarded =
    offboardedToday > 0
      ? departmentDistribution.map((d, i) => ({
          name: d.name,
          value: d.count,
          color: DEPT_COLORS[i % DEPT_COLORS.length],
        }))
      : [{ name: "No activity", value: 1, color: T.border }];

  return (
    <Sidebar>
      <div style={{ minHeight: "100vh", background: T.bg, padding: "26px 32px" }}>
        {/* Topbar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 22,
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: 1, color: T.amber, fontWeight: 700 }}>
              EXECUTIVE DASHBOARD
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: "4px 0 6px", color: T.text }}>
              Workforce Overview
            </h1>
            <div style={{ fontSize: 13.5, color: T.muted }}>
              Monitor employee onboarding and offboarding across the organization.
            </div>
          </div>
          <div
            style={{
              border: `1px solid ${T.border}`,
              background: "#fff",
              padding: "7px 14px",
              borderRadius: 8,
              fontSize: 13,
              color: T.text,
              whiteSpace: "nowrap",
            }}
          >
            Logged in as HR
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
          <KpiCard
            label="Total employees in onboarding + offboarding"
            value={totalEmployees}
            sub="Active across both pipelines this period"
          />
          <KpiCard
            label="Total employees onboarded"
            value={onboardedToday}
            sub="Completed onboarding, all mandatory docs cleared"
          />
          <KpiCard
            label="Total employees offboarded"
            value={offboardedToday}
            sub="Completed offboarding this period"
          />
          <KpiCard
            label="Onboarding pending"
            value={pendingOnboarding}
            sub="Awaiting document validation or approver action"
          />
          <KpiCard
            label="Offboarding pending"
            value={pendingOffboarding}
            sub="Awaiting clearance or approver action"
          />
          <KpiCard
            label="Approvals pending (IT + HR)"
            value={pendingApprovalsTotal}
            sub="Across onboarding + offboarding queues"
          />
        </div>

        {/* Department breakdown */}
        <div style={{ fontSize: 15, fontWeight: 600, margin: "26px 0 12px", color: T.text }}>
          Department breakdown
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 6 }}>
          <Panel
            title="Onboarded by department"
            sub={`${onboardedToday} employee${onboardedToday === 1 ? "" : "s"} onboarded this period`}
          >
            <DonutChart data={deptOnboarded} defaultTitle="Onboarded" total={onboardedToday} />
          </Panel>
          <Panel
            title="Offboarded by department"
            sub={`${offboardedToday} employee${offboardedToday === 1 ? "" : "s"} offboarded this period`}
          >
            <DonutChart
              data={deptOffboarded}
              defaultTitle="Offboarded"
              total={offboardedToday}
              showLegend={offboardedToday > 0}
            />
          </Panel>
        </div>

        {/* AI vs Manual progress */}
        <div style={{ fontSize: 15, fontWeight: 600, margin: "26px 0 12px", color: T.text }}>
          AI-driven vs manual progress
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 6 }}>
          <Panel title="Onboarding progress (this month)" sub="AI-completed vs manually-completed steps · by week">
            <AiManualLineChart data={onboardingAiManual} />
          </Panel>
          <Panel title="Offboarding progress (this month)" sub="AI-completed vs manually-completed steps · by week">
            {/* No offboarding activity yet (offboarded_today: 0) — chart
                stays at 0 across all weeks rather than showing invented
                numbers, until there's real offboarding activity. */}
            <AiManualLineChart data={offboardingAiManual} maxY={4} />
          </Panel>
        </div>

        {/* Approvals pending by department */}
        <div style={{ fontSize: 15, fontWeight: 600, margin: "26px 0 12px", color: T.text }}>
          Approvals pending by department
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 6 }}>
          <Panel
            title="Onboarding approvals pending"
            sub={
              onboardingApprovalCount === 0
                ? "No onboarding approvals pending"
                : `${onboardingApprovalCount} employee${onboardingApprovalCount === 1 ? "" : "s"} awaiting onboarding approval`
            }
          >
            <DonutChart
              data={approvalOnboarding}
              total={onboardingApprovalCount}
              defaultTitle="Onboarding"
            />
          </Panel>
          <Panel
            title="Offboarding approvals pending"
            sub={
              offboardingApprovalCount === 0
                ? "No offboarding approvals pending"
                : `${offboardingApprovalCount} employee${offboardingApprovalCount === 1 ? "" : "s"} awaiting offboarding approval`
            }
          >
            <DonutChart
              data={approvalOffboarding}
              total={offboardingApprovalCount}
              defaultTitle="Offboarding"
            />
          </Panel>
        </div>

        {/* Insights summary */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: "18px 20px",
            margin: "26px 0 10px",
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12, color: T.text }}>
            Insights summary
          </h3>

          {insightsLoading && (
            <div style={{ fontSize: 13, color: T.muted, padding: "9px 0" }}>Loading insights...</div>
          )}

          {!insightsLoading && insights.length === 0 && (
            <div style={{ fontSize: 13, color: T.muted, padding: "9px 0" }}>
              No delays, overdue assets, compliance issues or high-risk access found.
            </div>
          )}

          {!insightsLoading &&
            insights.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "9px 0",
                  borderBottom: idx < insights.length - 1 ? "1px solid #f0f1f4" : "none",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 5,
                    height: "fit-content",
                    whiteSpace: "nowrap",
                    background: CATEGORY_TAG_BG[item.category] || "#DBEAFE",
                    color: CATEGORY_TAG_COLOR[item.category] || "#2563EB",
                  }}
                >
                  {CATEGORY_LABEL[item.category] || "INSIGHT"}
                </span>
                <span style={{ color: T.text }}>{item.text}</span>
              </div>
            ))}
        </div>
      </div>
    </Sidebar>
  );
}