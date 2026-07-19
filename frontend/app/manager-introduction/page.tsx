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

const INTRO_STATUS_STYLES: Record<string, string> = {
  not_scheduled: "bg-amber-100 text-amber-700",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

const INTRO_STATUS_LABEL: Record<string, string> = {
  not_scheduled: "Not Scheduled",
  scheduled: "Scheduled",
  completed: "Completed",
};

const AVAILABILITY_STATUS_STYLES: Record<string, string> = {
  slots_found: "bg-green-100 text-green-700",
  no_overlap: "bg-red-100 text-red-700",
  confirmed: "bg-green-100 text-green-700",
};

const AVAILABILITY_STATUS_LABEL: Record<string, string> = {
  slots_found: "Slots Found",
  no_overlap: "No Overlap Found",
  confirmed: "Confirmed",
};

const ATTENDANCE_STYLES: Record<string, string> = {
  attended: "bg-green-100 text-green-700",
  not_yet_happened: "bg-gray-100 text-gray-600",
  no_show: "bg-red-100 text-red-700",
};

const ATTENDANCE_LABEL: Record<string, string> = {
  attended: "Attended",
  not_yet_happened: "Not Yet Happened",
  no_show: "Manager No-Show",
};

const MEETING_STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  upcoming: "bg-blue-100 text-blue-700",
  needs_reschedule: "bg-red-100 text-red-700",
};

const MEETING_STATUS_LABEL: Record<string, string> = {
  completed: "Completed",
  upcoming: "Upcoming",
  needs_reschedule: "Needs Reschedule",
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

function SlotList({ slots }: { slots: { time: string; busy: boolean }[] }) {
  if (!slots || slots.length === 0) {
    return <span className="text-gray-400 text-sm">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {slots.map((s, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 text-[13px] ${s.busy ? "text-gray-400 line-through" : "text-gray-700"}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${s.busy ? "bg-red-500" : "bg-green-500"}`} />
          {s.time}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NOTE ON API SHAPES:
// api.listManagerIntroductions / api.listCalendarAvailability / api.listManagerAttendance
// are assumed method names — NOT confirmed against your actual lib/api.ts.
// Update these three calls (and field names in the types below) once your
// backend endpoints exist. Until then this page runs on the DEMO MOCK DATA
// below.
// ---------------------------------------------------------------------------

type ManagerIntroduction = {
  employee_id: string;
  employee_name: string;
  manager: string;
  department: string;
  status: string; // "not_scheduled" | "scheduled" | "completed"
};

type CalendarAvailability = {
  employee_id: string;
  employee_name: string;
  manager: string;
  slots: { time: string; busy: boolean }[];
  status: string; // "slots_found" | "no_overlap" | "confirmed"
  note?: string;
};

type ManagerAttendance = {
  employee_id: string;
  employee_name: string;
  manager: string;
  meeting_datetime: string;
  attendance: string; // "attended" | "not_yet_happened" | "no_show"
  status: string; // "completed" | "upcoming" | "needs_reschedule"
};

// ---------------------------------------------------------------------------
// DEMO MOCK DATA
// Fallback used only when the api.* calls aren't implemented yet or fail.
// Employee names/departments mirror the real Employee Directory. Delete
// this block once real api.* endpoints are live — nothing else needs to
// change.
// ---------------------------------------------------------------------------

const MOCK_INTRODUCTIONS: ManagerIntroduction[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", manager: "David Klein", department: "Legal", status: "completed" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", manager: "Arjun Kapoor", department: "Marketing", status: "scheduled" },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", manager: "Priya Nair", department: "Compliance", status: "not_scheduled" },
];

const MOCK_AVAILABILITY: CalendarAvailability[] = [
  {
    employee_id: "emp-1004",
    employee_name: "Divya Menon",
    manager: "Arjun Kapoor",
    slots: [
      { time: "Jul 23, 11:30 AM", busy: false },
      { time: "Jul 23, 2:00 PM", busy: true },
      { time: "Jul 24, 9:00 AM", busy: false },
    ],
    status: "slots_found",
  },
  {
    employee_id: "emp-1006",
    employee_name: "Fatima Noor",
    manager: "Priya Nair",
    slots: [
      { time: "Jul 25, 10:00 AM", busy: true },
      { time: "Jul 25, 1:00 PM", busy: true },
    ],
    status: "no_overlap",
  },
  {
    employee_id: "emp-1001",
    employee_name: "Ananya Sharma",
    manager: "David Klein",
    slots: [],
    status: "confirmed",
    note: "Meeting already confirmed",
  },
];

const MOCK_ATTENDANCE: ManagerAttendance[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", manager: "David Klein", meeting_datetime: "2026-07-11 · 9:30 AM", attendance: "attended", status: "completed" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", manager: "Arjun Kapoor", meeting_datetime: "2026-07-23 · 11:30 AM", attendance: "not_yet_happened", status: "upcoming" },
  { employee_id: "emp-1003", employee_name: "Karthik Subramaniam", manager: "Divya Rao", meeting_datetime: "2026-07-09 · 3:00 PM", attendance: "no_show", status: "needs_reschedule" },
];

export default function ManagerIntroductionPage() {
  const { role } = useAuth();
  const router = useRouter();

  const [introductions, setIntroductions] = useState<ManagerIntroduction[]>([]);
  const [availability, setAvailability] = useState<CalendarAvailability[]>([]);
  const [attendance, setAttendance] = useState<ManagerAttendance[]>([]);

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
    const [introData, availabilityData, attendanceData] = await Promise.all([
      safeCall(apiAny.listManagerIntroductions, MOCK_INTRODUCTIONS),
      safeCall(apiAny.listCalendarAvailability, MOCK_AVAILABILITY),
      safeCall(apiAny.listManagerAttendance, MOCK_ATTENDANCE),
    ]);

    setIntroductions(introData.length ? introData : MOCK_INTRODUCTIONS);
    setAvailability(availabilityData.length ? availabilityData : MOCK_AVAILABILITY);
    setAttendance(attendanceData.length ? attendanceData : MOCK_ATTENDANCE);
    setLoading(false);
  }

  const departments = useMemo(() => {
    const unique = Array.from(new Set(introductions.map((i) => i.department).filter(Boolean)));
    return unique.sort();
  }, [introductions]);

  const filteredIntroductions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return introductions.filter((i) => {
      const matchesDept = department === "all" || i.department === department;
      const matchesSearch = !q || [i.employee_name, i.manager, i.department].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [introductions, search, department]);

  const filteredAvailability = useMemo(() => {
    const q = search.trim().toLowerCase();
    return availability.filter((a) => !q || [a.employee_name, a.manager].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [availability, search]);

  const filteredAttendance = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attendance.filter((a) => !q || [a.employee_name, a.manager].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [attendance, search]);

  return (
    <Sidebar>
      <div className="bg-[#FAFAF9] min-h-screen w-full p-6 flex-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653]">People Operations</p>
            <h2 className="mt-2 text-4xl font-bold text-[#14213D]">Manager Introduction</h2>
            <p className="mt-2 text-gray-500">
              Schedule a manager introduction, find a slot that works for both, and confirm attendance.
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
                placeholder="Search employees or managers..."
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

          {/* ============ MANAGER INTRODUCTIONS ============ */}
          <div className="flex items-center justify-between mb-3 mt-2">
            <h3 className="text-lg font-bold text-[#14213D]">Manager Introductions</h3>
            <button
              onClick={() => router.push("/manager-introduction/schedule")}
              className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D9A653] transition"
            >
              + Schedule Manager Introduction
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[28%]">New Hire</th>
                  <th className="p-3 w-[22%]">Manager</th>
                  <th className="p-3 w-[18%]">Department</th>
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

                {!loading && filteredIntroductions.map((i, idx) => {
                  const status = (i.status || "not_scheduled").toLowerCase();
                  return (
                    <tr
                      key={i.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top">
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#14213D] text-white text-xs font-bold shrink-0">
                            {initials(i.employee_name)}
                          </div>
                          <div className="font-semibold text-[#14213D] truncate">{i.employee_name}</div>
                        </div>
                      </td>
                      <td className="p-3 py-3.5 align-top truncate">{i.manager}</td>
                      <td className="p-3 py-3.5 align-top truncate">{i.department}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${INTRO_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {INTRO_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/manager-introduction/${i.employee_id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          {status === "not_scheduled" ? "Schedule" : "View"}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredIntroductions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No new hires found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ CALENDAR AVAILABILITY ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Calendar Availability</h3>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[22%]">New Hire</th>
                  <th className="p-3 w-[22%]">Manager</th>
                  <th className="p-3 w-[36%]">Suggested Slots</th>
                  <th className="p-3 w-[20%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredAvailability.map((a, idx) => {
                  const status = (a.status || "no_overlap").toLowerCase();
                  return (
                    <tr
                      key={a.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{a.employee_name}</td>
                      <td className="p-3 py-3.5 align-top truncate">{a.manager}</td>
                      <td className="p-3 py-3.5 align-top">
                        {a.note ? <span className="text-gray-400 text-sm">{a.note}</span> : <SlotList slots={a.slots} />}
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${AVAILABILITY_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {status === "slots_found" ? `${a.slots.filter((s) => !s.busy).length} Slots Found` : (AVAILABILITY_STATUS_LABEL[status] ?? status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredAvailability.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-gray-500">No availability data found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ MANAGER ATTENDANCE ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Manager Attendance</h3>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[22%]">New Hire</th>
                  <th className="p-3 w-[18%]">Manager</th>
                  <th className="p-3 w-[20%]">Meeting Date</th>
                  <th className="p-3 w-[20%]">Manager Attendance</th>
                  <th className="p-3 w-[20%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredAttendance.map((a, idx) => {
                  const attendanceKey = (a.attendance || "not_yet_happened").toLowerCase();
                  const status = (a.status || "upcoming").toLowerCase();
                  return (
                    <tr
                      key={a.employee_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{a.employee_name}</td>
                      <td className="p-3 py-3.5 align-top truncate">{a.manager}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{a.meeting_datetime}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${ATTENDANCE_STYLES[attendanceKey] ?? "bg-gray-100 text-gray-600"}`}>
                          {ATTENDANCE_LABEL[attendanceKey] ?? attendanceKey}
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

                {!loading && filteredAttendance.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">No attendance records found.</td>
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
