"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import Sidebar from "../../components/Sidebar";

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ActivityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function AppsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function AssetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  onboarding: "bg-amber-100 text-amber-700",
  documents_pending: "bg-blue-100 text-blue-700",
  inactive: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  onboarding: "Onboarding",
  documents_pending: "Documents Pending",
  inactive: "Inactive",
};

const TRACK_STATUS_STYLES: Record<string, string> = {
  completed: "bg-green-100 text-green-700",
  in_progress: "bg-amber-100 text-amber-700",
  blocked: "bg-red-100 text-red-700",
  not_started: "bg-gray-100 text-gray-500",
};

const TRACK_STATUS_LABELS: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  blocked: "Blocked",
  not_started: "Not Started",
};

const TIMELINE_DOT_STYLES: Record<string, string> = {
  completed: "bg-green-500",
  running: "bg-amber-500",
  waiting: "bg-gray-300",
  failed: "bg-red-500",
  blocked: "bg-orange-500",
};

const COMPLIANCE_ICON_STYLES: Record<string, string> = {
  approved: "bg-green-100 text-green-600",
  rejected: "bg-red-100 text-red-600",
  pending: "border-2 border-gray-300 bg-white",
};

export default function ProfilePage() {
  useAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (id) api.getProfile(id).then(setProfile);
  }, [id]);

  if (!profile) {
    return (
      <Sidebar>
        <main className="min-h-screen w-full bg-[#FAFAF9] p-8 text-gray-500">
          Loading...
        </main>
      </Sidebar>
    );
  }

  const { personal_information: p, employment_details: e } = profile;
  const tracks = Object.keys(profile.onboarding_tasks || {});
  const offboardingTracks = Object.keys(profile.offboarding_tasks || {});

  const initials = p.name
    ?.split(" ")
    .map((x: string) => x[0])
    .join("")
    .slice(0, 2);

  return (
    <Sidebar>
      <main className="min-h-screen w-full bg-[#FAFAF9] p-6">
        <div className="mx-auto max-w-6xl">

          {/* Back Button */}
          <button
            onClick={() => router.push("/directory")}
            className="mb-5 flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-[#14213D] transition"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Employee Directory
          </button>

          {/* Header */}
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#14213D] text-xl font-bold text-white">
              {initials}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-[#14213D]">{p.name}</h1>

                {e.experience_level && (
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                      e.experience_level === "fresher"
                        ? "bg-sky-100 text-sky-700"
                        : "bg-violet-100 text-violet-700"
                    }`}
                  >
                    {e.experience_level}
                  </span>
                )}

                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                    STATUS_STYLES[e.status?.toLowerCase()] || "bg-gray-100 text-gray-700"
                  }`}
                >
                  {STATUS_LABELS[e.status?.toLowerCase()] || e.status}
                </span>
              </div>

              <p className="mt-1 text-sm text-gray-500">
                {p.employee_id} &middot; {e.department} &middot; {e.role || "Unclassified"}
              </p>
            </div>
          </div>

          {/* Info Cards */}
          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-xs font-bold uppercase tracking-wide text-gray-700">
                Personal Information
              </p>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Email</dt>
                  <dd className="break-all text-right font-medium text-[#14213D]">{p.email || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Office</dt>
                  <dd className="font-medium text-[#14213D]">{p.office || "—"}</dd>
                </div>
              </dl>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <p className="mb-4 text-xs font-bold uppercase tracking-wide text-gray-700">
                Employment Details
              </p>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Title</dt>
                  <dd className="font-medium text-[#14213D]">{e.title || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Manager</dt>
                  <dd className="font-medium text-[#14213D]">{e.manager || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Joining Date</dt>
                  <dd className="font-medium text-[#14213D]">{e.joining_date || "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Source</dt>
                  <dd className="font-medium text-[#14213D]">{e.sync_source || "—"}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Profile Completion */}
          <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                Profile Completion
              </h2>
              <span className="font-bold text-[#14213D]">{profile.profile_completion_pct}%</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-[#D9A653] transition-all"
                style={{ width: `${profile.profile_completion_pct}%` }}
              />
            </div>
          </div>

          {/* Applications / Security Groups / Assets */}
          <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#14213D]/5 text-[#14213D]">
                  <AppsIcon className="h-4 w-4" />
                </span>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
                  Applications
                </p>
              </div>
              {profile.applications?.length > 0 ? (
                <ul>
                  {profile.applications.map((a: string, idx: number) => (
                    <li
                      key={a}
                      className={`flex items-center gap-2.5 py-2 text-sm text-[#14213D] ${
                        idx !== profile.applications.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#D9A653]" />
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No applications assigned yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#14213D]/5 text-[#14213D]">
                  <ShieldIcon className="h-4 w-4" />
                </span>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
                  Security Groups
                </p>
              </div>
              {profile.security_groups?.length > 0 ? (
                <ul>
                  {profile.security_groups.map((g: string, idx: number) => (
                    <li
                      key={g}
                      className={`flex items-center gap-2.5 py-2 text-sm text-[#14213D] ${
                        idx !== profile.security_groups.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#D9A653]" />
                      {g}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No security groups assigned yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#14213D]/5 text-[#14213D]">
                  <AssetIcon className="h-4 w-4" />
                </span>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-700">
                  Assets
                </p>
              </div>
              {profile.assets?.length > 0 ? (
                <ul>
                  {profile.assets.map((a: string, idx: number) => (
                    <li
                      key={a}
                      className={`flex items-center gap-2.5 py-2 text-sm text-[#14213D] ${
                        idx !== profile.assets.length - 1 ? "border-b border-gray-100" : ""
                      }`}
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[#D9A653]" />
                      {a}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-400">No assets assigned yet.</p>
              )}
            </div>
          </div>

          {/* Compliance */}
          {profile.compliance_tasks?.length > 0 && (
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-700">
                Compliance
              </h2>
              <div className="space-y-2">
                {profile.compliance_tasks.map((t: any) => (
                  <div key={t.task_name} className="flex items-center gap-2 text-sm">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                        COMPLIANCE_ICON_STYLES[t.status] || "border-2 border-gray-300 bg-white"
                      }`}
                    >
                      {t.status === "approved" && <CheckIcon className="h-3 w-3" />}
                      {t.status === "rejected" && <XIcon className="h-3 w-3" />}
                      {t.status === "pending" && <span className="h-0.5 w-2 rounded-full bg-gray-300" />}
                    </span>
                    <span className={t.status === "approved" ? "text-gray-400 line-through" : "text-[#14213D]"}>
                      {t.task_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Onboarding Tasks by Track */}
          {tracks.length > 0 && (
            <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-[#F4F1EC] px-6 py-4">
                <h2 className="text-base font-bold text-[#14213D]">
                  Onboarding Tasks by Track
                </h2>
              </div>

              {tracks.every((track) => (profile.onboarding_tasks[track] || []).length === 0) ? (
                <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    <ClockIcon className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold text-[#14213D]">
                    Task lists haven&apos;t been generated yet
                  </p>
                  <p className="max-w-sm text-xs text-gray-500">
                    {e.status?.toLowerCase() === "documents_pending"
                      ? "Onboarding tasks are generated automatically once submitted documents are verified."
                      : "Onboarding tasks will appear here once assigned by HR, IT, Security, and Manager tracks."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                  {tracks.map((track) => {
                    const tasks = profile.onboarding_tasks[track] || [];
                    const status = profile.onboarding_track_status?.[track];
                    if (tasks.length === 0) return null;

                    const completedCount = tasks.filter((t: any) => t.status === "approved").length;

                    return (
                      <div
                        key={track}
                        className="rounded-xl border border-gray-200 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="font-semibold text-[#14213D]">{track}</span>
                          {status && (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                                TRACK_STATUS_STYLES[status] || "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {status === "in_progress"
                                ? `${completedCount}/${tasks.length} Done`
                                : TRACK_STATUS_LABELS[status] || status}
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {tasks.map((t: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm">
                              <span
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                  t.status === "approved"
                                    ? "bg-green-100 text-green-600"
                                    : t.status === "rejected"
                                    ? "bg-red-100 text-red-600"
                                    : "border-2 border-gray-300 bg-white"
                                }`}
                              >
                                {t.status === "approved" && <CheckIcon className="h-3 w-3" />}
                                {t.status === "rejected" && <XIcon className="h-3 w-3" />}
                                {t.status === "pending" && <span className="h-0.5 w-2 rounded-full bg-gray-300" />}
                              </span>

                              <span className={t.status === "approved" ? "text-gray-400 line-through" : "text-[#14213D]"}>
                                {t.task_name}
                              </span>

                              {!t.is_mandatory && (
                                <span className="text-xs text-gray-400">(optional)</span>
                              )}
                            </div>
                          ))}
                        </div>

                        <p className="mt-3 text-xs text-gray-400">
                          {status !== "in_progress" && `${completedCount} of ${tasks.length} tasks complete`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Offboarding Tasks by Track */}
          {offboardingTracks.length > 0 && (
            <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 bg-[#F4F1EC] px-6 py-4">
                <h2 className="text-base font-bold text-[#14213D]">
                  Offboarding Tasks by Track
                </h2>
              </div>

              <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
                {offboardingTracks.map((track) => {
                  const tasks = profile.offboarding_tasks[track] || [];
                  const status = profile.offboarding_track_status?.[track];
                  if (tasks.length === 0) return null;

                  const completedCount = tasks.filter((t: any) => t.status === "approved").length;

                  return (
                    <div
                      key={track}
                      className="rounded-xl border border-gray-200 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-semibold text-[#14213D]">{track}</span>
                        {status && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                              TRACK_STATUS_STYLES[status] || "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {status === "in_progress"
                              ? `${completedCount}/${tasks.length} Done`
                              : TRACK_STATUS_LABELS[status] || status}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {tasks.map((t: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-2 text-sm">
                            <span
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                                t.status === "approved"
                                  ? "bg-green-100 text-green-600"
                                  : t.status === "rejected"
                                  ? "bg-red-100 text-red-600"
                                  : "border-2 border-gray-300 bg-white"
                              }`}
                            >
                              {t.status === "approved" && <CheckIcon className="h-3 w-3" />}
                              {t.status === "rejected" && <XIcon className="h-3 w-3" />}
                              {t.status === "pending" && <span className="h-0.5 w-2 rounded-full bg-gray-300" />}
                            </span>

                            <span className={t.status === "approved" ? "text-gray-400 line-through" : "text-[#14213D]"}>
                              {t.task_name}
                            </span>

                            {!t.is_mandatory && (
                              <span className="text-xs text-gray-400">(optional)</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <p className="mt-3 text-xs text-gray-400">
                        {status !== "in_progress" && `${completedCount} of ${tasks.length} tasks complete`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Offboarding Approvals */}
          {profile.offboarding_approvals?.length > 0 && (
            <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-700">
                Offboarding Approvals
              </h2>
              <div className="space-y-2">
                {profile.offboarding_approvals.map((a: any) => (
                  <div key={a.approver_role} className="flex items-center justify-between text-sm">
                    <span className="text-[#14213D]">{a.approver_role}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        a.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : a.status === "rejected"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Employee Timeline */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-[#F4F1EC] px-6 py-4">
              <h2 className="text-base font-bold text-[#14213D]">
                Employee Timeline
              </h2>
            </div>

            <ol className="relative p-6">
              {profile.timeline.map((t: any, i: number) => {
                const isLast = i === profile.timeline.length - 1;
                return (
                  <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                    {!isLast && (
                      <span
                        className="absolute left-[7px] top-4 h-full w-0.5 bg-gray-200"
                        aria-hidden="true"
                      />
                    )}

                    <span
                      className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full ${
                        TIMELINE_DOT_STYLES[t.status] || "bg-gray-300"
                      }`}
                    />

                    <div>
                      <p className="text-sm font-semibold text-[#14213D]">
                        {t.step}
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            t.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : t.status === "running"
                              ? "bg-amber-100 text-amber-700"
                              : t.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : t.status === "blocked"
                              ? "bg-orange-100 text-orange-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {t.status}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs capitalize text-gray-400">{t.flow} flow</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Recent Activity */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-700">
              Recent Activity
            </h2>

            <div className="space-y-4">
              {profile.recent_activity.map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#14213D]/5 text-[#14213D]">
                    <ActivityIcon className="h-3.5 w-3.5" />
                  </span>
                  <p className="text-sm text-[#14213D]">
                    <span className="font-semibold">{a.agent}</span>{" "}
                    <span className="text-gray-500">— {a.action}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>
    </Sidebar>
  );
}