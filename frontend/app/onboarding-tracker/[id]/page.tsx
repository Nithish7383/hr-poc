"use client";
import { useEffect, useState, useRef } from "react";
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

// Security Track removed; Manager Track relabeled as Delivery Track (still maps
// to the "Manager" key from the API/tasksByTrack data — update if your backend
// key differs).
const TRACK_STEPS = ["HR Track", "IT Track", "Delivery Track"];
const STEP_TO_TRACK: Record<string, string> = {
  "HR Track": "HR", "IT Track": "IT", "Delivery Track": "Manager",
};

const POLL_INTERVAL_MS = 3000;

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString();
}

function getEmployeeCode(e: any): string {
  return e.employeeId ?? e.employee_id ?? e.empId ?? e.emp_id ?? e.employeeCode ?? e.employee_code ?? e.code ?? e.id ?? "—";
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

  // Default the selected step to the first non-completed one (i.e. "where things are at"),
  // falling back to the last step if everything is done.
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

  // Badge color: if this is a track step that's still live in_progress (or blocked / not_started),
  // color the badge by that live track status instead of the raw step status (which may say
  // "completed" from the last snapshot while the live track is actually still running).
  const badgeColor =
    activeIsTrackStep && activeLiveTrackStatus
      ? TRACK_STATUS_COLOR[activeLiveTrackStatus] || "#475569"
      : STATUS_COLOR[activeStep?.status] || "#475569";

  return (
    <Sidebar collapsed>
      <style>{`
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(217,119,6,0.35); }
          70% { box-shadow: 0 0 0 10px rgba(217,119,6,0); }
          100% { box-shadow: 0 0 0 0 rgba(217,119,6,0); }
        }
        @keyframes pulseRingOrange {
          0% { box-shadow: 0 0 0 0 rgba(234,88,12,0.35); }
          70% { box-shadow: 0 0 0 10px rgba(234,88,12,0); }
          100% { box-shadow: 0 0 0 0 rgba(234,88,12,0); }
        }
        .tracker-node { transition: transform 0.15s ease; }
        .tracker-node:hover { transform: translateY(-2px); }
      `}</style>

      <main style={{ padding: "28px 40px 60px", maxWidth: 1000, margin: "0 auto" }}>
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1.5, color: "#d97706", textTransform: "uppercase" }}>
              People Operations
            </div>
            <h1 style={{ margin: "6px 0 4px", fontSize: 32, fontWeight: 800, color: "#0f172a", letterSpacing: -0.5 }}>
              {employee ? employee.name : "Onboarding Tracker"}
            </h1>
            {employee && (
              <p style={{ fontSize: 15, color: "#475569", fontWeight: 600, marginTop: 2 }}>
                {getEmployeeCode(employee)} — {employee.department}
              </p>
            )}
          </div>
        </div>
        <p style={{ fontSize: 14.5, color: "#64748b", fontWeight: 500, marginTop: 4, marginBottom: 28 }}>
          Task approvals happen in the Approval Dashboard — this screen only displays progress.
        </p>

        {loading && <p>Loading...</p>}

        {/* Horizontal tracker */}
        {!loading && orderedSteps.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #eef0f2",
              borderRadius: 16,
              boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
              padding: "32px 28px 24px",
              marginBottom: 20,
            }}
          >
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

                return (
                  <div key={s.step} style={{ display: "flex", alignItems: "center", flex: i < orderedSteps.length - 1 ? 1 : "0 0 auto" }}>
                    <div
                      onClick={() => setSelectedStep(s.step)}
                      className="tracker-node"
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", width: 108 }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 18,
                          fontWeight: 700,
                          background: showAsCompleted ? "#16a34a" : isTrouble ? "#fee2e2" : "#fff",
                          color: showAsCompleted ? "#fff" : isTrouble ? "#dc2626" : isTrackStepInProgress ? "#ea580c" : isWaiting ? "#9ca3af" : "#d97706",
                          border: showAsCompleted ? "none" : `2px solid ${isTrouble ? "#dc2626" : isTrackStepInProgress ? "#ea580c" : isWaiting ? "#d1d5db" : "#d97706"}`,
                          boxShadow: isSelected ? `0 0 0 4px ${showAsCompleted ? "rgba(22,163,74,0.15)" : isTrackStepInProgress ? "rgba(234,88,12,0.15)" : isWaiting ? "rgba(148,163,184,0.15)" : "rgba(217,119,6,0.15)"}` : "none",
                          animation: isTrackStepInProgress ? "pulseRingOrange 2s infinite" : isRunning ? "pulseRing 2s infinite" : "none",
                          opacity: isWaiting ? 0.7 : 1,
                        }}
                      >
                        {showAsCompleted ? "✓" : isTrouble ? "!" : i + 1}
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
                      <div style={{ flex: 1, height: 3, borderRadius: 2, background: lineFilled ? "#16a34a" : "#e5e7eb", marginTop: -30 }} />
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
              <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>{activeStep.step}</div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: badgeColor,
                  background: `${badgeColor}1a`,
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
                <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 6, fontSize: 13, color: "#0f172a" }}>{activeStep.step} Tasks</div>
                {activeTrackTasks.length === 0 && <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No tasks yet.</div>}
                {activeTrackTasks.map((t: any, idx: number) => {
                  const tColor = TASK_STATUS_COLOR[t.status] || "#0f172a";
                  const tBg = TASK_STATUS_BG[t.status] || "#f1f5f9";
                  return (
                    <div key={idx} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: idx < activeTrackTasks.length - 1 ? "1px solid #f1f1f1" : "none" }}>
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
                      {t.ai_recommendation && (
                        <div style={{ fontSize: 13, color: "#666", marginTop: 4, fontStyle: "italic" }}>
                          {t.is_ai_generated ? "🤖 " : ""}{t.ai_recommendation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {!loading && orderedSteps.length === 0 && <p>No onboarding activity for this employee yet.</p>}
      </main>
    </Sidebar>
  );
}