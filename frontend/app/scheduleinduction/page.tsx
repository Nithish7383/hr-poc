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

const SESSION_STATUS_STYLES: Record<string, string> = {
  not_scheduled: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

const SESSION_STATUS_LABEL: Record<string, string> = {
  not_scheduled: "Not Scheduled",
  scheduled: "Scheduled",
  completed: "Completed",
};

const TRIGGER_STYLES: Record<string, string> = {
  auto_scheduled: "bg-violet-100 text-violet-700",
  manual_required: "bg-gray-100 text-gray-600",
};

const TRIGGER_LABEL: Record<string, string> = {
  auto_scheduled: "Auto-scheduled",
  manual_required: "Manual Required",
};

const MEETING_STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  pending_confirmation: "bg-blue-100 text-blue-700",
  no_slot_found: "bg-red-100 text-red-700",
};

const MEETING_STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending_confirmation: "Pending Confirmation",
  no_slot_found: "No Slot Found",
};

const FACILITATOR_STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

const FACILITATOR_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  scheduled: "Scheduled",
  completed: "Completed",
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

// ---------------------------------------------------------------------------
// NOTE ON API SHAPES:
// api.listInductionSessions / api.listAutoScheduledMeetings / api.listFacilitatorAssignments
// are assumed method names — NOT confirmed against your actual lib/api.ts.
// Update these three calls (and field names in the types below) once your
// backend endpoints exist. Until then this page runs on the DEMO MOCK DATA
// below.
// ---------------------------------------------------------------------------

type InductionSession = {
  employee_id: string;
  employee_name: string;
  department: string;
  preferred_date?: string;
  status: string; // "not_scheduled" | "scheduled" | "completed"
};

type AutoScheduledMeeting = {
  employee_id: string;
  employee_name: string;
  meeting_slot?: string;
  invite_sent: boolean;
  trigger: string; // "auto_scheduled" | "manual_required"
  status: string; // "confirmed" | "pending_confirmation" | "no_slot_found"
};

type FacilitatorAssignment = {
  employee_id: string;
  employee_name: string;
  facilitator_name?: string;
  topics?: string;
  status: string; // "pending" | "scheduled" | "completed"
};

// ---------------------------------------------------------------------------
// DEMO MOCK DATA
// Fallback used only when the api.* calls aren't implemented yet or fail.
// Employee names/departments mirror the real Employee Directory. Delete
// this block once real api.* endpoints are live — nothing else needs to
// change.
// ---------------------------------------------------------------------------

const MOCK_SESSIONS: InductionSession[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", department: "Legal", preferred_date: "2026-07-13", status: "completed" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", department: "Marketing", preferred_date: "2026-07-23", status: "scheduled" },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", department: "Compliance", status: "not_scheduled" },
];

const MOCK_MEETINGS: AutoScheduledMeeting[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", meeting_slot: "2026-07-13 · 10:00 AM", invite_sent: true, trigger: "auto_scheduled", status: "confirmed" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", meeting_slot: "2026-07-23 · 11:30 AM", invite_sent: true, trigger: "auto_scheduled", status: "pending_confirmation" },
  { employee_id: "emp-1003", employee_name: "Karthik Subramaniam", invite_sent: false, trigger: "manual_required", status: "no_slot_found" },
];

const MOCK_FACILITATORS: FacilitatorAssignment[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", facilitator_name: "Priya Nair", topics: "Policies, Benefits, Culture", status: "completed" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", facilitator_name: "Rina Nathan", topics: "Policies, Benefits, Culture", status: "scheduled" },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", status: "pending" },
];

export default function ScheduleInductionPage() {
  const { role } = useAuth();
  const router = useRouter();

  const [sessions, setSessions] = useState<InductionSession[]>([]);
  const [meetings, setMeetings] = useState<AutoScheduledMeeting[]>([]);
  const [facilitators, setFacilitators] = useState<FacilitatorAssignment[]>([]);

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
    const [sessionData, meetingData, facilitatorData] = await Promise.all([
      safeCall(apiAny.listInductionSessions, MOCK_SESSIONS),
      safeCall(apiAny.listAutoScheduledMeetings, MOCK_MEETINGS),
      safeCall(apiAny.listFacilitatorAssignments, MOCK_FACILITATORS),
    ]);

    setSessions(sessionData.length ? sessionData : MOCK_SESSIONS);
    setMeetings(meetingData.length ? meetingData : MOCK_MEETINGS);
    setFacilitators(facilitatorData.length ? facilitatorData : MOCK_FACILITATORS);
    setLoading(false);
  }

  const departments = useMemo(() => {
    const unique = Array.from(new Set(sessions.map((s) => s.department).filter(Boolean)));
    return unique.sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchesDept = department === "all" || s.department === department;
      const matchesSearch = !q || [s.employee_name, s.department].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [sessions, search, department]);

  const filteredMeetings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => !q || m.employee_name.toLowerCase().includes(q));
  }, [meetings, search]);

  const filteredFacilitators = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilitators.filter((f) => !q || [f.employee_name, f.facilitator_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [facilitators, search]);

  return (
    <Sidebar>
      <div className="bg-[#FAFAF9] min-h-screen w-full p-6 flex-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653]">People Operations</p>
            <h2 className="mt-2 text-4xl font-bold text-[#14213D]">Schedule Induction</h2>
            <p className="mt-2 text-gray-500">
              Schedule induction sessions, let the system auto-book meetings, and assign an HR facilitator.
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
                placeholder="Search employees..."
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

          {/* ============ INDUCTION SESSIONS ============ */}
          <div className="flex items-center justify-between mb-3 mt-2">
            <h3 className="text-lg font-bold text-[#14213D]">Induction Sessions</h3>
            <button
              onClick={() => router.push("/schedule-induction/schedule")}
              className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D9A653] transition"
            >
              + Schedule Induction
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[28%]">New Hire</th>
                  <th className="p-3 w-[20%]">Department</th>
                  <th className="p-3 w-[20%]">Preferred Date</th>
                  <th className="p-3 w-[17%]">Status</th>
                  <th className="p-3 w-[15%]">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredSessions.map((s, idx) => {
                  const status = (s.status || "not_scheduled").toLowerCase();
                  return (
                    <tr
                      key={s.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14213D] text-white text-xs font-bold shrink-0">
                            {initials(s.employee_name)}
                          </div>
                          <div className="font-semibold text-[#14213D] truncate">{s.employee_name}</div>
                        </div>
                      </td>
                      <td className="p-3 py-3.5 align-top truncate">{s.department}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{s.preferred_date || "—"}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${SESSION_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {SESSION_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/schedule-induction/${s.employee_id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          {status === "not_scheduled" ? "Schedule" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredSessions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No new hires found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ AUTOMATIC MEETING SCHEDULING ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Automatic Meeting Scheduling</h3>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[22%]">New Hire</th>
                  <th className="p-3 w-[20%]">Meeting Slot</th>
                  <th className="p-3 w-[18%]">Calendar Invite</th>
                  <th className="p-3 w-[18%]">Trigger</th>
                  <th className="p-3 w-[22%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredMeetings.map((m, idx) => {
                  const trigger = (m.trigger || "manual_required").toLowerCase();
                  const status = (m.status || "no_slot_found").toLowerCase();
                  return (
                    <tr
                      key={m.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{m.employee_name}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{m.meeting_slot || "—"}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{m.invite_sent ? "Sent to attendees" : "—"}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${TRIGGER_STYLES[trigger] ?? "bg-gray-100 text-gray-600"}`}>
                          {TRIGGER_LABEL[trigger] ?? trigger}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${MEETING_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {MEETING_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredMeetings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No auto-scheduled meetings.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ HR FACILITATOR ASSIGNMENT ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">HR Facilitator Assignment</h3>
            <button
              onClick={() => router.push("/schedule-induction/assign-facilitator")}
              className="rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#14213D] hover:bg-gray-50 transition"
            >
              + Assign Facilitator
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[22%]">New Hire</th>
                  <th className="p-3 w-[22%]">HR Facilitator</th>
                  <th className="p-3 w-[26%]">Session Topics</th>
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

                {!loading && filteredFacilitators.map((f, idx) => {
                  const status = (f.status || "pending").toLowerCase();
                  const unassigned = !f.facilitator_name;
                  return (
                    <tr
                      key={f.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{f.employee_name}</td>
                      <td className="p-3 py-3.5 align-top">
                        {unassigned ? (
                          <span className="text-gray-400">Unassigned</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#D9A653] text-[#14213D] text-[11px] font-bold shrink-0">
                              {initials(f.facilitator_name!)}
                            </div>
                            <span className="truncate">{f.facilitator_name}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700 truncate">{f.topics || "—"}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${FACILITATOR_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {FACILITATOR_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/schedule-induction/facilitator/${f.employee_id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          {unassigned ? "Assign" : status === "completed" ? "View Notes" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredFacilitators.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No facilitator assignments found.</td>
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
