"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/useAuth";
import Sidebar from "../components/Sidebar";

function Search({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function initials(name: string) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

const CHECKIN_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  not_yet_due: "bg-gray-100 text-gray-600",
};

const CHECKIN_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  not_yet_due: "Not Yet Due",
};

const RESULT_STATUS_STYLES: Record<string, string> = {
  no_action_needed: "bg-green-100 text-green-700",
  flagged: "bg-red-100 text-red-700",
};

const RESULT_STATUS_LABEL: Record<string, string> = {
  no_action_needed: "No Action Needed",
  flagged: "Flagged for Manager",
};

const DISCUSSION_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  not_scheduled: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

const DISCUSSION_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  not_scheduled: "Not Scheduled",
  completed: "Completed",
};

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-green-500",
  mixed: "bg-amber-500",
  negative: "bg-red-500",
};

const SENTIMENT_LABEL: Record<string, string> = {
  positive: "Positive",
  mixed: "Mixed",
  negative: "Negative",
};

// Calls an api.* method if it exists and resolves; returns fallback if the
// method is missing (not implemented yet) or throws/rejects (network error,
// 404, etc). Keeps load() simple and keeps each section independent.
async function safeCall<T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (typeof fn !== "function") return fallback;
  try {
    const result = await fn();
    return (result as any) ?? fallback;
  } catch {
    return fallback;
  }
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const s = (sentiment || "").toLowerCase();
  return (
    <div className="flex items-center gap-2 text-sm font-semibold">
      <span className={`h-2 w-2 rounded-full shrink-0 ${SENTIMENT_STYLES[s] ?? "bg-gray-300"}`} />
      {SENTIMENT_LABEL[s] ?? sentiment}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NOTE ON API SHAPES:
// api.listFirstDayCheckins / api.listCheckinResults / api.listManagerDiscussions
// are assumed method names — NOT confirmed against your actual lib/api.ts.
// Update these three calls (and field names in the getters/types below) once
// your backend endpoints exist. Until then this page runs on the DEMO MOCK
// DATA below.
// ---------------------------------------------------------------------------

type FirstDayCheckin = {
  employee_id: string;
  employee_name: string;
  first_day: string;
  department: string;
  status: string; // "pending" | "completed" | "not_yet_due"
};

type CheckinResult = {
  employee_id: string;
  employee_name: string;
  submitted_at: string;
  sentiment: string; // "positive" | "mixed" | "negative"
  note: string;
  status: string; // "no_action_needed" | "flagged"
};

type ManagerDiscussion = {
  employee_id: string;
  employee_name: string;
  manager: string;
  reason: string;
  status: string; // "scheduled" | "not_scheduled" | "completed"
  scheduled_date?: string;
};

// ---------------------------------------------------------------------------
// DEMO MOCK DATA
// Fallback used only when the api.* calls aren't implemented yet or fail.
// Employee names/departments mirror the real Employee Directory. Delete
// this block once real api.* endpoints are live — nothing else needs to
// change.
// ---------------------------------------------------------------------------

const MOCK_CHECKINS: FirstDayCheckin[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", first_day: "2026-07-10", department: "Legal", status: "completed" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", first_day: "2026-07-15", department: "Marketing", status: "pending" },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", first_day: "2026-07-18", department: "Compliance", status: "not_yet_due" },
];

const MOCK_RESULTS: CheckinResult[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", submitted_at: "2026-07-10 · 5:45 PM", sentiment: "positive", note: "Laptop setup was smooth, everyone was welcoming.", status: "no_action_needed" },
  { employee_id: "emp-1003", employee_name: "Karthik Subramaniam", submitted_at: "2026-07-08 · 6:10 PM", sentiment: "mixed", note: "Didn't get my access badge on time, had to wait at the front desk.", status: "flagged" },
  { employee_id: "emp-1005", employee_name: "Suresh Iyer", submitted_at: "2026-06-30 · 4:20 PM", sentiment: "negative", note: "No one from the team introduced themselves. Felt lost most of the day.", status: "flagged" },
];

const MOCK_DISCUSSIONS: ManagerDiscussion[] = [
  { employee_id: "emp-1003", employee_name: "Karthik Subramaniam", manager: "Divya Rao", reason: "Access badge delay on first day", status: "scheduled", scheduled_date: "Jul 21" },
  { employee_id: "emp-1005", employee_name: "Suresh Iyer", manager: "David Klein", reason: "Felt unwelcomed by team, no introductions made", status: "not_scheduled" },
];

export default function FirstDayCheckinPage() {
  const { role } = useAuth();
  const router = useRouter();

  const [checkins, setCheckins] = useState<FirstDayCheckin[]>([]);
  const [results, setResults] = useState<CheckinResult[]>([]);
  const [discussions, setDiscussions] = useState<ManagerDiscussion[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");

  useEffect(() => {
    load();
  }, [role]);

  async function load() {
    if (!role) return;
    setLoading(true);

    // Cast to `any` here only because these three methods don't exist on
    // lib/api.ts yet — this lets the page compile and run today, showing
    // mock data. Once you add real endpoints, remove the `as any` cast.
    const apiAny = api as any;
    const [checkinData, resultData, discussionData] = await Promise.all([
      safeCall(apiAny.listFirstDayCheckins, MOCK_CHECKINS),
      safeCall(apiAny.listCheckinResults, MOCK_RESULTS),
      safeCall(apiAny.listManagerDiscussions, MOCK_DISCUSSIONS),
    ]);

    setCheckins(checkinData.length ? checkinData : MOCK_CHECKINS);
    setResults(resultData.length ? resultData : MOCK_RESULTS);
    setDiscussions(discussionData.length ? discussionData : MOCK_DISCUSSIONS);
    setLoading(false);
  }

  const departments = useMemo(() => {
    const unique = Array.from(new Set(checkins.map((c) => c.department).filter(Boolean)));
    return unique.sort();
  }, [checkins]);

  const filteredCheckins = useMemo(() => {
    const q = search.trim().toLowerCase();
    return checkins.filter((c) => {
      const matchesDept = department === "all" || c.department === department;
      const matchesSearch = !q || [c.employee_name, c.department].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [checkins, search, department]);

  const filteredResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => !q || [r.employee_name, r.note].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [results, search]);

  const filteredDiscussions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return discussions.filter((d) => !q || [d.employee_name, d.manager, d.reason].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [discussions, search]);

  return (
    <Sidebar>
      <div className="bg-[#FAFAF9] min-h-screen w-full p-6 flex-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653]">People Operations</p>
            <h2 className="mt-2 text-4xl font-bold text-[#14213D]">First-Day Check-in</h2>
            <p className="mt-2 text-gray-500">
              Run an automated first-day check-in with new hires and flag anything that needs a manager conversation.
            </p>
          </div>
        </div>

        {/* Search + filter (shared across all three sections) */}
        <div className="mt-8 w-full">
          <div className="flex items-center gap-4 mb-5">
            <div className="relative w-full">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employees or notes..."
                className="w-full rounded-xl border border-gray-200 bg-white pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-[#D9A653] focus:border-transparent"
              />
            </div>

            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="shrink-0 w-48 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-[#D9A653] focus:border-transparent"
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* ============ FIRST-DAY CHECK-INS ============ */}
          <div className="flex items-center justify-between mb-3 mt-2">
            <h3 className="text-lg font-bold text-[#14213D]">First-Day Check-ins</h3>
            <button
              onClick={() => router.push("/first-day-checkin/trigger")}
              className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D9A653] transition"
            >
              + Trigger Check-in
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[28%]">New Hire</th>
                  <th className="p-3 w-[18%]">First Day</th>
                  <th className="p-3 w-[19%]">Department</th>
                  <th className="p-3 w-[18%]">Status</th>
                  <th className="p-3 w-[17%]">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredCheckins.map((c, idx) => {
                  const status = (c.status || "pending").toLowerCase();
                  const disabled = status === "not_yet_due";
                  return (
                    <tr
                      key={c.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14213D] text-white text-xs font-bold shrink-0">
                            {initials(c.employee_name)}
                          </div>
                          <div className="font-semibold text-[#14213D] truncate">{c.employee_name}</div>
                        </div>
                      </td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{c.first_day}</td>
                      <td className="p-3 py-3.5 align-top truncate">{c.department}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${CHECKIN_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {CHECKIN_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          disabled={disabled}
                          onClick={() => !disabled && router.push(`/first-day-checkin/${c.employee_id}`)}
                          className={`rounded-lg px-3 py-1.5 text-xs text-white transition ${
                            disabled ? "bg-gray-300 cursor-not-allowed" : "bg-[#14213D] hover:bg-[#243654]"
                          }`}
                        >
                          {status === "completed" ? "View" : "Send Check-in"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredCheckins.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No new hires found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ AUTOMATED CHECK-IN RESULTS ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Automated Check-in Results</h3>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[20%]">New Hire</th>
                  <th className="p-3 w-[18%]">Submitted</th>
                  <th className="p-3 w-[14%]">Sentiment</th>
                  <th className="p-3 w-[30%]">Notes / Flags</th>
                  <th className="p-3 w-[18%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredResults.map((r, idx) => {
                  const status = (r.status || "no_action_needed").toLowerCase();
                  return (
                    <tr
                      key={r.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{r.employee_name}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{r.submitted_at}</td>
                      <td className="p-3 py-3.5 align-top">
                        <SentimentBadge sentiment={r.sentiment} />
                      </td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-600">
                        <span className="line-clamp-2">"{r.note}"</span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${RESULT_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {RESULT_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredResults.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No check-in responses yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ MANAGER DISCUSSION ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Manager Discussion</h3>
            <button
              onClick={() => router.push("/first-day-checkin/schedule-discussion")}
              className="rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#14213D] hover:bg-gray-50 transition"
            >
              + Schedule Discussion
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[22%]">New Hire</th>
                  <th className="p-3 w-[18%]">Manager</th>
                  <th className="p-3 w-[30%]">Reason for Flag</th>
                  <th className="p-3 w-[18%]">Discussion Status</th>
                  <th className="p-3 w-[12%]">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredDiscussions.map((d, idx) => {
                  const status = (d.status || "not_scheduled").toLowerCase();
                  return (
                    <tr
                      key={d.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{d.employee_name}</td>
                      <td className="p-3 py-3.5 align-top truncate">{d.manager}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-600 truncate">{d.reason}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${DISCUSSION_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {DISCUSSION_STATUS_LABEL[status] ?? status}{d.scheduled_date ? ` — ${d.scheduled_date}` : ""}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/first-day-checkin/discussion/${d.employee_id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          {status === "not_scheduled" ? "Schedule" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredDiscussions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No flagged discussions.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
