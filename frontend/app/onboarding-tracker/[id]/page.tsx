"use client";
import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import Sidebar from "../../components/Sidebar";

const STATUS_COLOR: Record<string, string> = {
  completed: "#16a34a", running: "#d97706", waiting: "#9ca3af",
  failed: "#dc2626", blocked: "#f97316",
};
const STATUS_LABEL: Record<string, string> = {
  completed: "Completed", running: "Running", waiting: "Waiting",
  failed: "Failed", blocked: "Blocked — awaiting employee documents",
};
const TASK_STATUS_ICON: Record<string, string> = {
  approved: "✅", rejected: "❌", pending: "⏳",
};
const TASK_STATUS_COLOR: Record<string, string> = {
  approved: "#16a34a", rejected: "#dc2626", pending: "#d97706",
};
const TASK_STATUS_BG: Record<string, string> = {
  approved: "#dcfce7", rejected: "#fee2e2", pending: "#fef3c7",
};
const TASK_STATUS_LABEL: Record<string, string> = {
  approved: "Approved", rejected: "Rejected", pending: "Pending",
};
const TRACK_STATUS_COLOR: Record<string, string> = {
  completed: "#16a34a", in_progress: "#ea580c", blocked: "#dc2626", not_started: "#9ca3af",
};
const TRACK_STATUS_BG: Record<string, string> = {
  completed: "#dcfce7", in_progress: "#ffedd5", blocked: "#fee2e2", not_started: "#f1f5f9",
};

// Security Track removed; Manager Track relabeled as Delivery Track (still maps
// to the "Manager" key from the API/tasksByTrack data — update if your backend
// key differs).
const TRACK_STEPS = ["HR Track", "IT Track", "Delivery Track"];
const STEP_TO_TRACK: Record<string, string> = {
  "HR Track": "HR", "IT Track": "IT", "Delivery Track": "Manager",
};
// Icon shown per step node. Plain inline SVG paths — no external icon
// library required. Swap for lucide-react etc. if already installed.
const STEP_ICON: Record<string, React.ReactNode> = {
  "Registered": <path d="M9 12l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
  "Validation": <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  "HR Track": <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  "IT Track": <path d="M4 16V6a2 2 0 012-2h12a2 2 0 012 2v10m-16 0h16m-16 0l-2 4h20l-2-4" />,
  // Changed from a delivery truck icon to a briefcase/manager icon,
  // since "Delivery Track" maps to the Manager track under the hood.
  "Delivery Track": <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M4 7h16v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7zM4 12h16" />,
};

const POLL_INTERVAL_MS = 3000;

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString();
}

function getEmployeeCode(e: any): string {
  return e.employeeId ?? e.employee_id ?? e.empId ?? e.emp_id ?? e.employeeCode ?? e.employee_code ?? e.code ?? e.id ?? "—";
}

function formatDocumentSource(source: string): string {
  if (source === "hrms_sync") return "synced from HRMS";
  if (source === "email") return "via email";
  return source;
}

function StepIcon({ step, color, size = 18 }: { step: string; color: string; size?: number }) {
  const path = STEP_ICON[step];
  if (!path) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

export default function OnboardingTrackerDetailPage() {
  useAuth();
  const router = useRouter();
  const params = useParams();
  const employeeId = params?.id as string;

  const [employee, setEmployee] = useState<any>(null);
  const [rawSteps, setRawSteps] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [documentInfo, setDocumentInfo] = useState<any>(null);
  const [tasksByTrack, setTasksByTrack] = useState<any>({});
  const [trackStatus, setTrackStatus] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);
  const pollRef = useRef<any>(null);

  useEffect(() => {
    if (!employeeId) return;
    loadEmployee();
    loadTrackerData(true);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadTrackerData(false), POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [employeeId]);

  async function loadEmployee() {
    const all = await api.listEmployees();
    const match = all.find((e: any) => e.id === employeeId);
    setEmployee(match || null);
  }

  async function loadTrackerData(showLoading: boolean) {
    if (showLoading) setLoading(true);
    const [steps, audit, docs, taskData] = await Promise.all([
      api.onboardingStatus(employeeId),
      api.auditTrail(employeeId),
      api.onboardingDocuments(employeeId),
      api.onboardingTasks(employeeId),
    ]);
    setRawSteps(steps);
    setAuditLog(audit);
    setDocumentInfo(docs);
    setTasksByTrack(taskData.tasks || {});
    setTrackStatus(taskData.track_status || {});
    if (showLoading) setLoading(false);
  }

  async function handleMarkReceived() {
    setResuming(true);
    try {
      await api.markDocumentsReceived(employeeId);
      await loadTrackerData(true);
      await loadEmployee();
    } finally {
      setResuming(false);
    }
  }

  // Security Track removed; Manager Track renamed to Delivery Track
  const ALL_STEPS = ["Registered", "Validation", "HR Track", "IT Track", "Delivery Track"];

  const latestByStep = new Map<string, any>();
  rawSteps.forEach((s) => latestByStep.set(s.step, s));
  const orderedSteps = ALL_STEPS.map(
    (step) => latestByStep.get(step) || { step, status: "waiting" }
  );

  // Default the selected step to the first non-completed one
  useEffect(() => {
    if (selectedStep || orderedSteps.length === 0) return;
    const current = orderedSteps.find((s) => s.status !== "completed") || orderedSteps[orderedSteps.length - 1];
    setSelectedStep(current.step);
  }, [orderedSteps, selectedStep]);

  function getStepHistory(step: string) {
    return rawSteps.filter((s) => s.step === step);
  }

  const pendingDocs = documentInfo?.documents?.filter((d: any) => d.status === "pending") || [];
  const isBlocked = orderedSteps.some((s) => s.step === "Validation" && s.status === "blocked");

  const activeStep = orderedSteps.find((s) => s.step === selectedStep) || null;
  const activeHistory = selectedStep ? getStepHistory(selectedStep) : [];
  const activeIsTrackStep = selectedStep ? TRACK_STEPS.includes(selectedStep) : false;
  const activeTrackName = selectedStep ? STEP_TO_TRACK[selectedStep] : null;
  const activeTrackTasks = activeIsTrackStep && activeTrackName ? (tasksByTrack[activeTrackName] || []) : [];
  const activeLiveTrackStatus = activeIsTrackStep && activeTrackName ? trackStatus[activeTrackName] : null;
  const activeValidationEntries = selectedStep === "Validation"
    ? auditLog.filter((a: any) => a.agent === "Validation Agent")
    : [];

  // Badge color logic
  const badgeColor =
    activeIsTrackStep && activeLiveTrackStatus
      ? TRACK_STATUS_COLOR[activeLiveTrackStatus] || "#475569"
      : STATUS_COLOR[activeStep?.status] || "#475569";
  const badgeBg =
    activeIsTrackStep && activeLiveTrackStatus
      ? TRACK_STATUS_BG[activeLiveTrackStatus] || "#f1f5f9"
      : `${badgeColor}1a`;

  const completedCount = orderedSteps.filter((s) => s.status === "completed").length;

  return (
    <Sidebar collapsed>
      <style>{`
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(217,119,6,0.35); }
          70% { box-shadow: 0 0 0 10px rgba(217,119,6,0); }
          100% { box-shadow: 0 0 0 0 rgba(217,119,6,0); }
        }
        .tracker-node { transition: transform 0.15s ease; }
        .tracker-node:hover { transform: translateY(-2px); }
      `}</style>

      <main style={{ padding: "28px 40px 60px", width: "100%", background: "#fdfcfa" }}>
        <button
          onClick={() => router.push("/onboarding-tracker")}
          style={{
            background: "none",
            border: "none",
            color: "#6b7280",
            fontSize: 14,
            cursor: "pointer",
            padding: 0,
            marginBottom: 20,
          }}
        >
          ← Back to Onboarding Tracker
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "#fef3c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                fontWeight: 700,
                color: "#d97706",
                flexShrink: 0,
              }}
            >
              {employee?.name ? employee.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("") : "?"}
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#0f172a", letterSpacing: -0.3 }}>
                {employee ? employee.name : "Onboarding Tracker"}
              </h1>
              {employee && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", background: "#f1f5f9", padding: "3px 10px", borderRadius: 999 }}>
                    {getEmployeeCode(employee)}
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", background: "#f1f5f9", padding: "3px 10px", borderRadius: 999 }}>
                    {employee.department}
                  </span>
                </div>
              )}
            </div>
          </div>
          {!loading && orderedSteps.length > 0 && (
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#166534", background: "#dcfce7", padding: "5px 12px", borderRadius: 999, flexShrink: 0 }}>
              {completedCount} of {orderedSteps.length} stages complete
            </span>
          )}
        </div>
        <p style={{ fontSize: 13.5, color: "#94a3b8", fontWeight: 500, marginTop: -12, marginBottom: 24 }}>
          Task approvals happen in the Approval Dashboard — this screen only displays progress.
        </p>

        {loading && <p>Loading...</p>}

        {/* Horizontal tracker: segmented progress bar + icon stepper */}
        {!loading && orderedSteps.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #eef0f2",
              borderRadius: 16,
              boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              padding: "28px 28px 24px",
              marginBottom: 20,
            }}
          >
            {/* Icon stepper */}
            <div style={{ display: "flex", alignItems: "flex-start" }}>
              {orderedSteps.map((s, i) => {
                const isSelected = selectedStep === s.step;
                const isCompleted = s.status === "completed";
                const isTrouble = s.status === "blocked" || s.status === "failed";
                const isWaiting = s.status === "waiting";
                const isRunning = s.status === "running";
                const isTrackStep = TRACK_STEPS.includes(s.step);
                const trackName = STEP_TO_TRACK[s.step];
                const liveTrackStatus = isTrackStep ? trackStatus[trackName] : null;
                const isTrackStepInProgress = isTrackStep && liveTrackStatus === "in_progress";
                const showAsCompleted = isCompleted && !isTrackStepInProgress;
                const lineFilled = showAsCompleted;
                const isCurrent = isSelected && !showAsCompleted && !isWaiting;

                const nodeSize = isCurrent ? 48 : 40;
                const iconColor = showAsCompleted ? "#fff" : isTrouble ? "#dc2626" : isWaiting ? "#9ca3af" : "#d97706";

                return (
                  <div key={s.step} style={{ display: "flex", alignItems: "center", flex: i < orderedSteps.length - 1 ? 1 : "0 0 auto" }}>
                    <div
                      onClick={() => setSelectedStep(s.step)}
                      className="tracker-node"
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", width: 108 }}
                    >
                      <div
                        style={{
                          width: nodeSize,
                          height: nodeSize,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: showAsCompleted ? "#16a34a" : isTrouble ? "#fee2e2" : "#fff",
                          border: showAsCompleted ? "none" : `2px solid ${isTrouble ? "#dc2626" : isTrackStepInProgress ? "#d97706" : isWaiting ? "#d1d5db" : "#d97706"}`,
                          boxShadow: isCurrent ? "0 0 0 5px rgba(217,119,6,0.15)" : "none",
                          animation: isTrackStepInProgress || isRunning ? "pulseRing 2s infinite" : "none",
                          opacity: isWaiting ? 0.7 : 1,
                          marginTop: isCurrent ? -4 : 0,
                        }}
                      >
                        {isTrouble ? (
                          <span style={{ fontSize: 18, fontWeight: 700, color: "#dc2626" }}>!</span>
                        ) : (
                          <StepIcon step={s.step} color={iconColor} size={isCurrent ? 20 : 18} />
                        )}
                      </div>
                      <div
                        style={{
                          marginTop: 10,
                          fontSize: 14,
                          fontWeight: isSelected ? 700 : 600,
                          color: isSelected ? "#0f172a" : isWaiting ? "#94a3b8" : "#334155",
                          textAlign: "center",
                          lineHeight: 1.3,
                        }}
                      >
                        {s.step}
                      </div>
                      {isTrackStep && liveTrackStatus && !isWaiting && (
                        <div style={{ fontSize: 12, marginTop: 3, color: TRACK_STATUS_COLOR[liveTrackStatus], fontWeight: 700 }}>
                          {liveTrackStatus.replace("_", " ")}
                        </div>
                      )}
                      {isWaiting && (
                        <div style={{ fontSize: 12, marginTop: 3, color: "#94a3b8", fontWeight: 700, letterSpacing: 0.2 }}>
                          not started
                        </div>
                      )}
                    </div>

                    {i < orderedSteps.length - 1 && (
                      <div style={{ flex: 1, height: 2, borderRadius: 2, background: lineFilled ? "#16a34a" : "#e5e7eb", marginTop: -30 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Detail panel for the selected step */}
        {!loading && activeStep && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #eef0f2",
              borderRadius: 16,
              boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {STEP_ICON[activeStep.step] && <StepIcon step={activeStep.step} color="#d97706" size={18} />}
                <span style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>{activeStep.step}</span>
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: badgeColor,
                  background: badgeBg,
                  padding: "4px 12px",
                  borderRadius: 999,
                }}
              >
                {STATUS_LABEL[activeStep.status] || activeStep.status}
                {activeIsTrackStep && activeLiveTrackStatus ? ` · ${activeLiveTrackStatus.replace("_", " ")}` : ""}
              </span>
            </div>

            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: "#0f172a" }}>Timeline</div>
            {activeHistory.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No history yet.</div>}
            {activeHistory.map((h, idx) => (
              <div key={idx} style={{ fontSize: 13, color: "#555" }}>{STATUS_LABEL[h.status]} at {formatTime(h.timestamp)}</div>
            ))}

            {selectedStep === "Validation" && documentInfo?.documents?.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 6, fontSize: 13, color: "#0f172a" }}>Documents</div>
                {documentInfo.documents.map((d: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 13, color: d.status === "received" ? "#16a34a" : "#c2410c" }}>
                    {d.status === "received" ? "✅" : "⏳"} {d.document_name} — {d.status}
                    {d.source && (
                      <span style={{ color: "#6b7280", marginLeft: 6 }}>
                        ({formatDocumentSource(d.source)}
                        {d.confidence ? `, confidence: ${d.confidence}` : ""})
                      </span>
                    )}
                  </div>
                ))}
              </>
            )}

            {selectedStep === "Validation" && activeValidationEntries.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 6, fontSize: 13, color: "#0f172a" }}>AI Reasoning</div>
                {activeValidationEntries.map((a: any, idx: number) => (
                  <div key={idx} style={{ fontSize: 13, color: "#555", marginBottom: 4 }}><strong>{a.action}</strong> — {a.detail}</div>
                ))}
              </>
            )}

            {activeIsTrackStep && (
              <>
                <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 10, fontSize: 13, color: "#0f172a" }}>{activeStep.step} Tasks</div>
                {activeTrackTasks.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No tasks yet.</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {activeTrackTasks.map((t: any, idx: number) => {
                    const tColor = TASK_STATUS_COLOR[t.status] || "#0f172a";
                    const tBg = TASK_STATUS_BG[t.status] || "#f1f5f9";
                    return (
                      <div
                        key={idx}
                        style={{
                          border: "1px solid #eef0f2",
                          borderRadius: 10,
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                          <span>{TASK_STATUS_ICON[t.status]}</span>
                          <span style={{ color: t.status === "pending" ? "#0f172a" : tColor, fontWeight: t.status === "pending" ? 600 : 500 }}>
                            {t.task_name}
                          </span>
                          {!t.is_mandatory && <span style={{ fontSize: 11, color: "#999" }}>(optional)</span>}
                          <span
                            style={{
                              marginLeft: "auto",
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.3,
                              textTransform: "uppercase",
                              color: tColor,
                              background: tBg,
                              padding: "2px 9px",
                              borderRadius: 999,
                            }}
                          >
                            {TASK_STATUS_LABEL[t.status] || t.status}
                          </span>
                        </div>

                        {/* AI-generated recommendations shown as a footnote inside the
                            task card, separated by a hairline divider. */}
                        {t.ai_recommendation && (
                          <div
                            style={{
                              marginTop: 8,
                              paddingTop: 8,
                              borderTop: "1px solid #f1f5f9",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 6,
                            }}
                          >
                            {t.is_ai_generated && (
                              <span style={{ fontSize: 13, color: "#6D4FC7", flexShrink: 0, lineHeight: "18px" }} aria-hidden="true">
                                ✦
                              </span>
                            )}
                            <div style={{ fontSize: 12.5, color: "#666", lineHeight: 1.5 }}>
                              {t.is_ai_generated && (
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", color: "#6D4FC7", marginRight: 6 }}>
                                  AI recommended
                                </span>
                              )}
                              <span style={{ fontStyle: "italic" }}>{t.ai_recommendation}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {!loading && orderedSteps.length === 0 && <p>No onboarding activity for this employee yet.</p>}
      </main>
    </Sidebar>
  );
}