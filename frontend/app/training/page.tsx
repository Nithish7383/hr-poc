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

const TRAINING_STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  overdue: "bg-red-100 text-red-700",
};

const TRAINING_STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  overdue: "Overdue",
};

// ---------------------------------------------------------------------------
// NOTE ON API SHAPES:
// The field/method names below (api.listTrainings, api.listLearningPaths,
// api.trainingCompletion, and the fields read off each item) are assumed to
// match your onboarding/approvals API conventions but were NOT confirmed
// against your actual lib/api.ts or backend schema. Swap these three calls
// and the getter functions below for your real ones — everything else
// (filtering, search, rendering, routing) will keep working unchanged.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DEMO MOCK DATA
// Used only as a fallback when the api.* calls below aren't implemented yet
// (or throw/return nothing) — e.g. for demoing this screen before the backend
// endpoints exist. Employee names/departments mirror the real Employee
// Directory (Ananya Sharma - Legal, Rohan Mehta - Finance, Karthik
// Subramaniam - IT, Divya Menon - Marketing, Suresh Iyer - Legal, Fatima
// Noor - Compliance) so the demo looks consistent with the rest of the app.
// Delete this block once real api.* endpoints are live — nothing else in
// this file needs to change.
// ---------------------------------------------------------------------------

const MOCK_TRAININGS: Training[] = [
  { id: "trn-1", name: "Data Privacy & Compliance", due_date: "2026-07-31", department: "Legal", status: "scheduled", assigned_count: 6 },
  { id: "trn-2", name: "Workplace Security Awareness", due_date: "2026-07-25", department: "IT", status: "in_progress", assigned_count: 2 },
  { id: "trn-3", name: "Anti-Harassment Policy", due_date: "2026-07-18", department: "Compliance", status: "overdue", assigned_count: 6 },
  { id: "trn-4", name: "Legal Ethics Refresher", due_date: "2026-08-05", department: "Legal", status: "scheduled", assigned_count: 2 },
  { id: "trn-5", name: "Financial Reporting Standards", due_date: "2026-08-10", department: "Finance", status: "scheduled", assigned_count: 1 },
];

const MOCK_LEARNING_PATHS: LearningPathAssignment[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", path_name: "Legal Associate Track", progress_pct: 33 },
  { employee_id: "emp-1003", employee_name: "Karthik Subramaniam", path_name: "IT Security Track", progress_pct: 50 },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", path_name: "Compliance Onboarding", progress_pct: 0 },
];

const MOCK_COMPLETION: TrainingCompletionRow[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", department: "Legal", completion_pct: 33, status: "in_progress" },
  { employee_id: "emp-1002", employee_name: "Rohan Mehta", department: "Finance", completion_pct: 17, status: "in_progress" },
  { employee_id: "emp-1003", employee_name: "Karthik Subramaniam", department: "IT", completion_pct: 50, status: "in_progress" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", department: "Marketing", completion_pct: 100, status: "completed" },
  { employee_id: "emp-1005", employee_name: "Suresh Iyer", department: "Legal", completion_pct: 0, status: "overdue" },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", department: "Compliance", completion_pct: 0, status: "scheduled" },
];

function getTrainingStatus(t: any): string {
  return (t.status ?? t.training_status ?? "scheduled").toLowerCase();
}

function getAssignedCount(t: any): number {
  return t.assigned_count ?? t.assignedCount ?? (t.assignees || []).length ?? 0;
}

function getProgressPct(item: any): number {
  const raw = item.progress_pct ?? item.progress ?? item.completion_pct ?? 0;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

// Calls an api.* method if it exists and resolves; returns fallback if the
// method is missing (not implemented yet) or throws/rejects (network error,
// 404, etc). Keeps load() simple and keeps each section independent.
async function safeCall<T>(fn: (() => Promise<T>) | undefined, fallback: T): Promise<T> {
  if (typeof fn !== "function") return fallback;
  try {
    const result = await fn();
    return result ?? fallback;
  } catch {
    return fallback;
  }
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${value >= 100 ? "bg-green-500" : "bg-[#D9A653]"}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{value}%</span>
    </div>
  );
}

type Training = {
  id: string;
  name: string;
  due_date: string;
  department?: string;
  status: string;
  assigned_count?: number;
  assignees?: any[];
};

type LearningPathAssignment = {
  employee_id: string;
  employee_name: string;
  path_name: string;
  progress_pct: number;
};

type TrainingCompletionRow = {
  employee_id: string;
  employee_name: string;
  department: string;
  completion_pct: number;
  status: string;
};

export default function TrainingLearningPage() {
  const { role } = useAuth();
  const router = useRouter();

  const [trainings, setTrainings] = useState<Training[]>([]);
  const [learningPaths, setLearningPaths] = useState<LearningPathAssignment[]>([]);
  const [completion, setCompletion] = useState<TrainingCompletionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");

  useEffect(() => {
    load();
  }, [role]);

  async function load() {
    if (!role) return;
    setLoading(true);

    // Each section falls back to demo mock data independently, so if only
    // some of the three backend endpoints exist yet, the ones that are
    // live are used and the rest still show demo data — no all-or-nothing
    // failure. Remove the try/catch + mock fallback per section once each
    // real endpoint ships.
    // Cast to `any` here only because these three methods don't exist on
    // lib/api.ts yet — this lets the page compile and run today, showing
    // mock data. Once you add real listTrainings/listLearningPaths/
    // trainingCompletion methods to lib/api.ts, remove the `as any` casts
    // and TypeScript will type-check them normally against MOCK_* shapes.
    const apiAny = api as any;
    const [trainingData, pathData, completionData] = await Promise.all([
      safeCall(apiAny.listTrainings, MOCK_TRAININGS),
      safeCall(apiAny.listLearningPaths, MOCK_LEARNING_PATHS),
      safeCall(apiAny.trainingCompletion, MOCK_COMPLETION),
    ]);

    setTrainings(trainingData.length ? trainingData : MOCK_TRAININGS);
    setLearningPaths(pathData.length ? pathData : MOCK_LEARNING_PATHS);
    setCompletion(completionData.length ? completionData : MOCK_COMPLETION);
    setLoading(false);
  }

  const departments = useMemo(() => {
    const unique = Array.from(
      new Set(
        [...trainings.map((t) => t.department), ...completion.map((c) => c.department)].filter(Boolean)
      )
    );
    return unique.sort();
  }, [trainings, completion]);

  const filteredTrainings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trainings.filter((t) => {
      const matchesDept = department === "all" || t.department === department;
      const matchesSearch = !q || [t.name, t.department].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [trainings, search, department]);

  const filteredPaths = useMemo(() => {
    const q = search.trim().toLowerCase();
    return learningPaths.filter((p) => {
      const matchesSearch = !q || [p.employee_name, p.path_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesSearch;
    });
  }, [learningPaths, search]);

  const filteredCompletion = useMemo(() => {
    const q = search.trim().toLowerCase();
    return completion.filter((c) => {
      const matchesDept = department === "all" || c.department === department;
      const matchesSearch = !q || [c.employee_name, c.department].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [completion, search, department]);

  return (
    <Sidebar>
      <div className="bg-[#FAFAF9] min-h-screen w-full p-6 flex-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653]">People Operations</p>
            <h2 className="mt-2 text-4xl font-bold text-[#14213D]">Training &amp; Learning</h2>
            <p className="mt-2 text-gray-500">
              Schedule mandatory trainings, assign learning paths, and track employee completion.
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
                placeholder="Search employees or trainings..."
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

          {/* ============ MANDATORY TRAININGS ============ */}
          <div className="flex items-center justify-between mb-3 mt-2">
            <h3 className="text-lg font-bold text-[#14213D]">Mandatory Trainings</h3>
            <button
              onClick={() => router.push("/training/schedule")}
              className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D9A653] transition"
            >
              + Schedule Training
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[34%]">Training</th>
                  <th className="p-3 w-[18%]">Due Date</th>
                  <th className="p-3 w-[18%]">Assigned</th>
                  <th className="p-3 w-[15%]">Status</th>
                  <th className="p-3 w-[15%]">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredTrainings.map((t, idx) => {
                  const status = getTrainingStatus(t);
                  return (
                    <tr
                      key={t.id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{t.name}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{t.due_date}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">
                        {getAssignedCount(t)} employee{getAssignedCount(t) === 1 ? "" : "s"}
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${TRAINING_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {TRAINING_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/training/${t.id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredTrainings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No trainings found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ LEARNING PATHS ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Learning Paths</h3>
            <button
              onClick={() => router.push("/training/assign-path")}
              className="rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#14213D] hover:bg-gray-50 transition"
            >
              + Assign Path
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[35%]">Employee</th>
                  <th className="p-3 w-[35%]">Learning Path</th>
                  <th className="p-3 w-[30%]">Progress</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredPaths.map((p, idx) => (
                  <tr
                    key={`${p.employee_id}-${p.path_name}`}
                    className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                  >
                    <td className="p-3 py-3.5 align-top">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14213D] text-white text-xs font-bold shrink-0">
                          {initials(p.employee_name)}
                        </div>
                        <div className="font-semibold text-[#14213D] truncate">{p.employee_name}</div>
                      </div>
                    </td>
                    <td className="p-3 py-3.5 align-top text-sm text-gray-700 truncate">{p.path_name}</td>
                    <td className="p-3 py-3.5 align-top">
                      <ProgressBar value={getProgressPct(p)} />
                    </td>
                  </tr>
                ))}

                {!loading && filteredPaths.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-gray-500">No learning paths assigned.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ TRAINING COMPLETION ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Training Completion</h3>
            <div className="whitespace-nowrap rounded-full bg-[#D9A653]/10 px-4 py-2.5 text-sm font-medium text-[#14213D]">
              {filteredCompletion.length} Employee{filteredCompletion.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[30%]">Employee</th>
                  <th className="p-3 w-[20%]">Department</th>
                  <th className="p-3 w-[25%]">Completion</th>
                  <th className="p-3 w-[15%]">Status</th>
                  <th className="p-3 w-[10%]">Profile</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredCompletion.map((c, idx) => {
                  const status = (c.status || "in_progress").toLowerCase();
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
                      <td className="p-3 py-3.5 align-top truncate">{c.department}</td>
                      <td className="p-3 py-3.5 align-top">
                        <ProgressBar value={getProgressPct(c)} />
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${TRAINING_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {TRAINING_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/employees/${c.employee_id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredCompletion.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No employees found.</td>
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
