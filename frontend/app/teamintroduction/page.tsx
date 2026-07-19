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
};

const INTRO_STATUS_LABEL: Record<string, string> = {
  not_scheduled: "Not Scheduled",
  scheduled: "Scheduled",
};

const MEETING_STATUS_STYLES: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  upcoming: "bg-blue-100 text-blue-700",
};

const MEETING_STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  upcoming: "Upcoming",
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

function AvatarStack({ names }: { names: string[] }) {
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((n, i) => (
        <div
          key={i}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-[#14213D] text-white text-[11px] font-bold border-2 border-white -ml-2 first:ml-0 shrink-0"
        >
          {initials(n)}
        </div>
      ))}
      {extra > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[11px] font-bold border-2 border-white -ml-2 shrink-0">
          +{extra}
        </div>
      )}
    </div>
  );
}

function RsvpSummary({ yes, no, pending }: { yes: number; no: number; pending: number }) {
  return (
    <div className="text-sm space-y-1">
      {yes > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" /> {yes} Yes
        </div>
      )}
      {pending > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-gray-300 shrink-0" /> {pending} Pending
        </div>
      )}
      {no > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" /> {no} No
        </div>
      )}
      {yes === 0 && no === 0 && pending === 0 && (
        <span className="text-gray-400">—</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NOTE ON API SHAPES:
// api.listTeamIntroductions / api.listScheduledMeetings / api.listMeetingParticipation
// are assumed method names — NOT confirmed against your actual lib/api.ts.
// Update these three calls (and the getter functions above, if field names
// differ) once your backend endpoints exist. Until then this page runs on
// the DEMO MOCK DATA below.
// ---------------------------------------------------------------------------

type TeamIntroduction = {
  employee_id: string;
  employee_name: string;
  department: string;
  manager: string;
  status: string; // "not_scheduled" | "scheduled"
};

type ScheduledMeeting = {
  id: string;
  title: string;
  datetime: string;
  organizer: string;
  location: string;
  status: string; // "confirmed" | "cancelled" | "upcoming"
};

type MeetingParticipation = {
  meeting_id: string;
  meeting_title: string;
  invitees: string[];
  yes_count: number;
  no_count: number;
  pending_count: number;
  status: string;
};

// ---------------------------------------------------------------------------
// DEMO MOCK DATA
// Fallback used only when the api.* calls aren't implemented yet or fail.
// Employee names/departments mirror the real Employee Directory. Delete
// this block once real api.* endpoints are live — nothing else needs to
// change.
// ---------------------------------------------------------------------------

const MOCK_INTRODUCTIONS: TeamIntroduction[] = [
  { employee_id: "emp-1001", employee_name: "Ananya Sharma", department: "Legal", manager: "David Klein", status: "not_scheduled" },
  { employee_id: "emp-1004", employee_name: "Divya Menon", department: "Marketing", manager: "Arjun Kapoor", status: "scheduled" },
  { employee_id: "emp-1006", employee_name: "Fatima Noor", department: "Compliance", manager: "Priya Nair", status: "not_scheduled" },
];

const MOCK_MEETINGS: ScheduledMeeting[] = [
  { id: "mtg-1", title: "Divya Menon — Marketing Team Intro", datetime: "2026-07-22 · 10:00 AM", organizer: "Arjun Kapoor", location: "Conference Room B", status: "confirmed" },
  { id: "mtg-2", title: "Karthik Subramaniam — IT Team Intro", datetime: "2026-07-20 · 2:30 PM", organizer: "Divya Rao", location: "meet.hrplatform.com/it-intro", status: "confirmed" },
  { id: "mtg-3", title: "Rohan Mehta — Finance Team Intro", datetime: "2026-07-19 · 11:00 AM", organizer: "Priya Nair", location: "Conference Room A", status: "cancelled" },
];

const MOCK_PARTICIPATION: MeetingParticipation[] = [
  { meeting_id: "mtg-1", meeting_title: "Divya Menon — Marketing Team Intro", invitees: ["Arjun Kapoor", "Riya Sen", "Manoj Joshi", "Karan Vora", "Leela Iyer"], yes_count: 4, no_count: 0, pending_count: 1, status: "upcoming" },
  { meeting_id: "mtg-2", meeting_title: "Karthik Subramaniam — IT Team Intro", invitees: ["Divya Rao", "Sanjay Kumar", "Aisha Khan"], yes_count: 3, no_count: 0, pending_count: 0, status: "upcoming" },
  { meeting_id: "mtg-3", meeting_title: "Rohan Mehta — Finance Team Intro", invitees: ["Priya Nair", "Tara Lakshmi"], yes_count: 0, no_count: 2, pending_count: 0, status: "cancelled" },
];

export default function TeamIntroductionPage() {
  const { role } = useAuth();
  const router = useRouter();

  const [introductions, setIntroductions] = useState<TeamIntroduction[]>([]);
  const [meetings, setMeetings] = useState<ScheduledMeeting[]>([]);
  const [participation, setParticipation] = useState<MeetingParticipation[]>([]);

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
    const [introData, meetingData, participationData] = await Promise.all([
      safeCall(apiAny.listTeamIntroductions, MOCK_INTRODUCTIONS),
      safeCall(apiAny.listScheduledMeetings, MOCK_MEETINGS),
      safeCall(apiAny.listMeetingParticipation, MOCK_PARTICIPATION),
    ]);

    setIntroductions(introData.length ? introData : MOCK_INTRODUCTIONS);
    setMeetings(meetingData.length ? meetingData : MOCK_MEETINGS);
    setParticipation(participationData.length ? participationData : MOCK_PARTICIPATION);
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
      const matchesSearch = !q || [i.employee_name, i.department, i.manager].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
      return matchesDept && matchesSearch;
    });
  }, [introductions, search, department]);

  const filteredMeetings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings.filter((m) => !q || [m.title, m.organizer, m.location].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [meetings, search]);

  const filteredParticipation = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participation.filter((p) => !q || p.meeting_title.toLowerCase().includes(q));
  }, [participation, search]);

  return (
    <Sidebar>
      <div className="bg-[#FAFAF9] min-h-screen w-full p-6 flex-1">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653]">People Operations</p>
            <h2 className="mt-2 text-4xl font-bold text-[#14213D]">Team Introduction</h2>
            <p className="mt-2 text-gray-500">
              Schedule a team introduction, set the meeting, and track who's joining.
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
                placeholder="Search employees or meetings..."
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

          {/* ============ TEAM INTRODUCTIONS ============ */}
          <div className="flex items-center justify-between mb-3 mt-2">
            <h3 className="text-lg font-bold text-[#14213D]">Team Introductions</h3>
            <button
              onClick={() => router.push("/team-introduction/schedule")}
              className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#D9A653] transition"
            >
              + Schedule Team Introduction
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[28%]">New Hire</th>
                  <th className="p-3 w-[20%]">Department</th>
                  <th className="p-3 w-[20%]">Manager</th>
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
                      <td className="p-3 py-3.5 align-top truncate">{i.department}</td>
                      <td className="p-3 py-3.5 align-top truncate">{i.manager}</td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${INTRO_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {INTRO_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <button
                          onClick={() => router.push(`/team-introduction/${i.employee_id}`)}
                          className="rounded-lg bg-[#14213D] px-3 py-1.5 text-xs text-white hover:bg-[#243654] transition"
                        >
                          {status === "scheduled" ? "View" : "Schedule"}
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

          {/* ============ SCHEDULED MEETINGS ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Scheduled Meetings</h3>
            <button
              onClick={() => router.push("/team-introduction/schedule-meeting")}
              className="rounded-xl bg-white border border-gray-200 px-4 py-2.5 text-sm font-semibold text-[#14213D] hover:bg-gray-50 transition"
            >
              + Schedule Meeting
            </button>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm mb-10">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[32%]">Meeting</th>
                  <th className="p-3 w-[18%]">Date &amp; Time</th>
                  <th className="p-3 w-[18%]">Organizer</th>
                  <th className="p-3 w-[20%]">Location / Link</th>
                  <th className="p-3 w-[12%]">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredMeetings.map((m, idx) => {
                  const status = (m.status || "upcoming").toLowerCase();
                  return (
                    <tr
                      key={m.id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{m.title}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700">{m.datetime}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700 truncate">{m.organizer}</td>
                      <td className="p-3 py-3.5 align-top text-sm text-gray-700 truncate">{m.location}</td>
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
                    <td colSpan={5} className="p-10 text-center text-gray-500">No meetings scheduled.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ============ TEAM PARTICIPATION ============ */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-[#14213D]">Team Participation</h3>
          </div>

          <div className="w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full table-fixed">
              <thead className="bg-[#F4F1EC] border-b border-gray-200">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="p-3 w-[35%]">Meeting</th>
                  <th className="p-3 w-[25%]">Team Members Invited</th>
                  <th className="p-3 w-[25%]">RSVP</th>
                  <th className="p-3 w-[15%]">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-gray-500">Loading...</td>
                  </tr>
                )}

                {!loading && filteredParticipation.map((p, idx) => {
                  const status = (p.status || "upcoming").toLowerCase();
                  return (
                    <tr
                      key={p.meeting_id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition ${idx % 2 === 1 ? "bg-gray-50/50" : ""}`}
                    >
                      <td className="p-3 py-3.5 align-top font-semibold text-[#14213D] truncate">{p.meeting_title}</td>
                      <td className="p-3 py-3.5 align-top">
                        <AvatarStack names={p.invitees} />
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <RsvpSummary yes={p.yes_count} no={p.no_count} pending={p.pending_count} />
                      </td>
                      <td className="p-3 py-3.5 align-top">
                        <span className={`inline-block rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap ${MEETING_STATUS_STYLES[status] ?? "bg-gray-100 text-gray-600"}`}>
                          {MEETING_STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredParticipation.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-10 text-center text-gray-500">No participation data found.</td>
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
