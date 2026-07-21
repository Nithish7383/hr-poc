"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, API_BASE } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";

function initials(name: string) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function parseMissingDocsFromRecommendation(rec: string): string[] {
  if (!rec) return [];
  const match = rec.match(/missing:\s*([^.]+)\./i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDefaultEmailDraft(task: any, employeeName?: string | null) {
  const docs = parseMissingDocsFromRecommendation(task.ai_recommendation || "");
  const subject = "Action Required: Missing Onboarding Documents";
  const bulletList = docs.length > 0 ? docs.map((d) => `- ${d}`).join("\n") : "- (see task details)";
  const body =
    `Hi ${employeeName || "there"},\n\n` +
    `To complete your onboarding, we still need the following document(s) from you:\n` +
    `${bulletList}\n\n` +
    `Please reply directly to this email with the document(s) attached (PDF or image) at your earliest convenience.\n\n` +
    `Thanks,\nHR Team`;
  return { subject, body };
}

// Per the OpenAPI spec, task_type "email_draft" covers three distinct kinds
// that use different backend endpoints: Welcome Email (outbound only, no
// reply expected), Missing Document Request Email (checked via
// /documents/check-inbox), and Onboarding Feedback Request (checked via the
// separate /feedback/check-inbox). Routed by task_name since that's the only
// signal we have to distinguish them.
function getEmailTaskKind(task: any): "welcome" | "missing_docs" | "feedback" | "other" {
  const name = (task.task_name || "").toLowerCase();
  if (name.includes("feedback")) return "feedback";
  if (name.includes("missing") || name.includes("document")) return "missing_docs";
  if (name.includes("welcome")) return "welcome";
  return "other";
}

function normalizeTasks(rawTasks: any): any[] {
  if (Array.isArray(rawTasks)) return rawTasks;
  if (rawTasks && typeof rawTasks === "object") {
    return Object.entries(rawTasks).flatMap(([group, list]) =>
      Array.isArray(list) ? list.map((t: any) => ({ ...t, _roleGroup: group })) : []
    );
  }
  return [];
}

type StageKey = "hr" | "it" | "delivery";
type WorkflowType = "onboarding" | "offboarding";

function classifyStage(t: any): StageKey {
  const group = (t._roleGroup || "").toLowerCase();
  // "security" tasks (Assign Security Groups, Ethical Wall Assignment,
  // Privileged Access Review) are folded into the IT stage. See ROLE_STAGE_MAP
  // below for the matching permission fix that lets a Security-role user
  // actually edit them.
  if (group === "hr") return "hr";
  if (group === "it" || group === "security") return "it";
  if (group === "manager" || group === "delivery") return "delivery";

  if (t.task_type === "email_draft") return "hr";

  const explicit = (t.stage || t.category || "").toLowerCase();
  if (explicit) {
    if (explicit.includes("hr") || explicit.includes("document"))
      return "hr";
    if (explicit.includes("it") || explicit.includes("provision") || explicit.includes("system") || explicit.includes("tech") || explicit.includes("security") || explicit.includes("clearance"))
      return "it";
    if (explicit.includes("manager") || explicit.includes("team") || explicit.includes("delivery") || explicit.includes("project"))
      return "delivery";
  }

  if (typeof window !== "undefined") {
    console.warn(`[classifyStage] Unmatched task, defaulting to HR:`, t.task_name, t);
  }
  return "hr";
}

const STAGES: { key: StageKey; eyebrow: string; title: string }[] = [
  { key: "hr", eyebrow: "STAGE 1 · DOCUMENTATION", title: "HR Verification" },
  { key: "it", eyebrow: "STAGE 2 · PROVISIONING", title: "IT Provisioning" },
  { key: "delivery", eyebrow: "STAGE 3 · TEAM ASSIGNMENT", title: "Delivery Team" },
];

// IT stage is jointly approved by IT and Security.
const STAGE_APPROVER: Record<StageKey, string> = {
  hr: "HR", it: "IT/Security", delivery: "Manager",
};

type StageDisplay = {
  text: string;
  textColor: string;
  circleColor: string;
};

function getStageDisplay(
  stage: StageKey,
  status: "completed" | "pending" | "locked",
  role?: string | null
): StageDisplay {
  const r = (role || "").toLowerCase();
  const currentStage =
    (r === "hr" && stage === "hr") ||
    (r === "it" && stage === "it") ||
    (r === "security" && stage === "it") ||
    ((r === "manager" || r === "delivery") && stage === "delivery");

  // Stage selector NEVER shows "Locked" text - always shows approval status
  if (currentStage) {
    if (status === "completed") {
      return { text: "Approved", textColor: "text-green-600", circleColor: "bg-green-600 text-white" };
    }
    return { text: `Waiting for ${STAGE_APPROVER[stage]} Approval`, textColor: "text-red-600", circleColor: "bg-red-500 text-white" };
  }

  if (status === "completed") {
    return { text: "Approved", textColor: "text-green-600", circleColor: "bg-green-600 text-white" };
  }

  // For non-current stages: always show waiting text, never "Locked"
  return { text: `Waiting for ${STAGE_APPROVER[stage]} Approval`, textColor: "text-gray-400", circleColor: "bg-white border-2 border-gray-200 text-gray-400" };
}

function deriveOverallStatus(item: any): string {
  if (!item) return "Unknown";

  const directStatus = item.status || item.approval_status || item.employee_status || item.overall_status;
  if (typeof directStatus === "string" && directStatus.trim()) {
    return directStatus;
  }

  // item.tasks may be the raw grouped object from /onboarding|offboarding/{id}/tasks
  // (e.g. { HR: [...], IT: [...] }) rather than a flat array -- normalize first.
  const tasks = normalizeTasks(item.tasks);
  if (tasks.length === 0) return "Unknown";

  const allApproved = tasks.every((t: any) => t.status === "approved" || t.status === "verified");
  const allRejected = tasks.every((t: any) => t.status === "rejected");
  const anyPending = tasks.some((t: any) => t.status === "pending");

  if (allApproved) return "Cleared";
  if (allRejected) return "Rejected";
  if (anyPending) return "Pending";

  return "In Progress";
}

function getStatusBadgeStyle(status: string | undefined | null): { bg: string; text: string; label: string } {
  const s = (status || "Unknown").toLowerCase().trim();
  switch (s) {
    case "cleared":
    case "completed":
    case "approved":
      return { bg: "bg-green-100", text: "text-green-700", label: status! };
    case "in_progress":
    case "in progress":
      return { bg: "bg-blue-100", text: "text-blue-700", label: status! };
    case "pending":
      return { bg: "bg-amber-100", text: "text-amber-700", label: status! };
    case "not_started":
    case "not started":
      return { bg: "bg-gray-100", text: "text-gray-600", label: "Not Started" };
    case "rejected":
      return { bg: "bg-red-100", text: "text-red-700", label: status! };
    default:
      const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown";
      return { bg: "bg-amber-100", text: "text-amber-700", label };
  }
}

// "security" -> "it" so a Security-role user's stage lock resolves to the
// IT stage (where Security tasks now live) instead of falling through to
// null (which would lock every stage for them).
const ROLE_STAGE_MAP: Record<string, StageKey> = {
  hr: "hr", it: "it", security: "it", manager: "delivery", delivery: "delivery", "delivery team": "delivery",
};

function stageForRole(role?: string | null): StageKey | null {
  if (!role) return null;
  const r = role.toLowerCase();
  return ROLE_STAGE_MAP[r] ?? null;
}

function taskCardStyle(t: any) {
  const status = (t.status || "").toLowerCase();
  if (t.flag === "expired" || t.flag === "missing") {
    return { bg: "bg-red-50 border-red-100", checked: false };
  }
  if (status === "approved" || status === "verified" || status === "rejected") {
    return { bg: "bg-green-50 border-green-100", checked: true };
  }
  return { bg: "bg-white border-gray-100", checked: false };
}

function TaskListButton({
  task, isSelected, onSelect,
}: { task: any; isSelected: boolean; onSelect: () => void; }) {
  const { checked } = taskCardStyle(task);
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm font-semibold transition flex items-center justify-between gap-2 ${
        checked
          ? "bg-green-50 border-green-200 text-green-700"
          : isSelected
          ? "border-[#14213D] bg-white text-[#14213D] shadow-sm"
          : "border-gray-200 bg-white text-[#14213D] hover:border-gray-300"
      }`}
    >
      <span className="truncate">{task.task_name}</span>
      {checked ? (
        <span className="text-green-600 text-xs shrink-0">✓</span>
      ) : task.flag ? (
        <span className="text-[10px] font-semibold text-red-600 shrink-0 whitespace-nowrap">
          {task.flag === "expired" ? "Expired" : "Missing"}
        </span>
      ) : null}
    </button>
  );
}

function EmptyTaskPanel({ stageKey }: { stageKey: StageKey }) {
  const messages: Record<StageKey, { icon: string; title: string; desc: string }> = {
    hr: {
      icon: "📧",
      title: "Document Request Email",
      desc: "Select a task from the left to review AI recommendations, edit the email draft, and approve or reject.",
    },
    it: {
      icon: "💻",
      title: "IT Asset & Access Provisioning",
      desc: "Select a task from the left to review AI recommendations and approve or reject provisioning requests.",
    },
    delivery: {
      icon: "👥",
      title: "Team Assignment & Onboarding Track",
      desc: "Select a task from the left to review AI recommendations and approve or reject team assignments.",
    },
  };
  const msg = messages[stageKey];
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center h-full flex flex-col items-center justify-center min-h-[280px]">
      <div className="text-4xl mb-3">{msg.icon}</div>
      <h4 className="text-sm font-semibold text-[#14213D] mb-1">{msg.title}</h4>
      <p className="text-xs text-gray-400 max-w-[280px]">{msg.desc}</p>
    </div>
  );
}

function TaskDetailPanel({
  employeeId, employeeName, task, workflow, onChanged, roleLocked,
}: {
  employeeId: string; employeeName?: string | null; task: any;
  workflow: WorkflowType; onChanged: () => void; roleLocked?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [selection, setSelection] = useState<string[]>(task.selected_options || []);

  const isEmailDraft = task.task_type === "email_draft";
  const defaultDraft = isEmailDraft ? buildDefaultEmailDraft(task, employeeName) : null;
  const [emailSubject, setEmailSubject] = useState<string>(
    task.email_subject || defaultDraft?.subject || ""
  );
  const [emailBody, setEmailBody] = useState<string>(
    task.email_body || defaultDraft?.body || ""
  );
  const [emailSaving, setEmailSaving] = useState(false);
  const [checkingInbox, setCheckingInbox] = useState(false);
  const [inboxMessage, setInboxMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelection(task.selected_options || []);
    setEmailSubject(task.email_subject || defaultDraft?.subject || "");
    setEmailBody(task.email_body || defaultDraft?.body || "");
    setInboxMessage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const isEditable =
    !roleLocked &&
    task.status === "pending" &&
    (task.task_type === "multi_select" || task.task_type === "single_select");

  // Email actions are onboarding-only -- confirmed via the OpenAPI spec that
  // there's no /offboarding/.../email-draft or /offboarding/.../check-inbox
  // route. Task selection/decide DO exist for both workflows, so those stay
  // workflow-aware below.
  const emailSupported = workflow === "onboarding";
  const emailKind = isEmailDraft ? getEmailTaskKind(task) : null;
  // Welcome Email is outbound-only (no reply flow); Missing Document Request
  // Email and Onboarding Feedback Request each check a different inbox.
  const showCheckInbox =
    isEmailDraft && emailSupported && (emailKind === "missing_docs" || emailKind === "feedback");
  const emailEditable = !roleLocked && task.status === "pending" && emailSupported;
  const isDecided =
    task.status === "approved" || task.status === "rejected" || task.status === "verified";

  const updateSelection =
    workflow === "onboarding" ? api.updateTaskSelection : api.updateOffboardingTaskSelection;
  const decideTask = workflow === "onboarding" ? api.decideTask : api.decideOffboardingTask;

  async function saveSelection(next: string[]) {
    if (roleLocked) return;
    setSelection(next);
    setSaving(true);
    try {
      await updateSelection(employeeId, task.id, next);
    } finally {
      setSaving(false);
    }
  }

  function toggleOption(option: string) {
    if (roleLocked) return;
    if (task.task_type === "single_select") {
      saveSelection([option]);
    } else {
      const next = selection.includes(option)
        ? selection.filter((o) => o !== option)
        : [...selection, option];
      saveSelection(next);
    }
  }

  async function decide(status: "approved" | "rejected") {
    if (roleLocked) return;
    setSaving(true);
    try {
      await decideTask(employeeId, task.id, status);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEmailEdits() {
    if (!emailEditable) return;
    setEmailSaving(true);
    try {
      // Generic endpoint -- resolves through the task itself, so it's correct
      // for all three email_draft kinds (Welcome / Missing Docs / Feedback).
      await api.updateTaskEmailDraft(employeeId, task.id, emailSubject, emailBody);
      onChanged();
    } finally {
      setEmailSaving(false);
    }
  }

  async function handleCheckInbox() {
    if (roleLocked || !showCheckInbox) return;
    setCheckingInbox(true);
    setInboxMessage(null);
    try {
      const checkInboxFn = emailKind === "feedback" ? api.checkFeedbackInbox : api.checkInbox;
      const result = await checkInboxFn(employeeId);
      const replyFound = result?.replyFound ?? result?.reply_found ?? false;
      if (replyFound) {
        onChanged();
      } else {
        setInboxMessage("No reply found yet. Please check again later.");
      }
    } catch (err) {
      setInboxMessage("Something went wrong while checking the inbox.");
    } finally {
      setCheckingInbox(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F3F1FB] border border-[#D9CFF5] px-3 py-1 text-xs font-semibold text-[#6D4FC7]">
            <span>✦</span>
            <span className="uppercase tracking-wider">AI Recommended Access</span>
          </span>
        </div>
        {showCheckInbox && (
          <button
            onClick={handleCheckInbox}
            disabled={roleLocked || checkingInbox}
            className="rounded-lg border border-[#D9CFF5] bg-[#F3F1FB] px-3 py-1.5 text-xs font-semibold text-[#6D4FC7] hover:bg-[#EEE9FB] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {checkingInbox ? "Checking..." : "Check Inbox for Reply"}
          </button>
        )}
      </div>

      {task.ai_recommendation && (
        <div className="text-xs text-gray-500 mb-3">
          {task.is_ai_generated ? "✦ " : ""}
          {task.ai_recommendation}
        </div>
      )}
      {task.task_type === "document_validation" && task.document_id && (
  <a
    href={`${API_BASE}/onboarding/${employeeId}/documents/${task.document_id}/file`}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-block mt-1 text-xs font-semibold text-[#6D4FC7] hover:underline"
  >
    View Document
  </a>
)}

      {task.task_type === "single_select" && task.options && (
        <div className="mb-3">
          <select
            value={selection[0] || ""}
            disabled={!isEditable || saving}
            onChange={(e) => toggleOption(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-[#14213D] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <option value="" disabled>Select…</option>
            {task.options.map((opt: string) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      )}

      {task.task_type === "multi_select" && task.options && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {task.options.map((opt: string) => (
            <label
              key={opt}
              className={`text-xs rounded-md border px-2 py-1 ${
                isEditable ? "cursor-pointer" : "cursor-default"
              } ${
                selection.includes(opt)
                  ? "bg-[#EEE9FB] border-[#D9CFF5] text-[#6D4FC7]"
                  : "bg-white border-gray-200 text-[#14213D]"
              }`}
            >
              <input
                type="checkbox"
                checked={selection.includes(opt)}
                disabled={!isEditable || saving}
                onChange={() => toggleOption(opt)}
                className="mr-1.5 align-middle"
              />
              {opt}
            </label>
          ))}
        </div>
      )}

      {isEmailDraft && !emailSupported && (
        <p className="mb-3 text-xs text-amber-600">
          Email actions (editing, sending, checking replies) aren't available for offboarding tasks yet.
        </p>
      )}

      {isEmailDraft && (
        <div className="mb-3 space-y-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Subject
            </label>
            <input
              type="text"
              value={emailSubject}
              disabled={!emailEditable || emailSaving}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-[#14213D] disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Body
            </label>
            <textarea
              value={emailBody}
              disabled={!emailEditable || emailSaving}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-[#14213D] disabled:opacity-60 disabled:cursor-not-allowed resize-y"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSaveEmailEdits}
              disabled={!emailEditable || emailSaving}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#14213D] hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {emailSaving ? "Saving..." : "Save Edits"}
            </button>
          </div>
          {inboxMessage && <p className="text-xs text-amber-600">{inboxMessage}</p>}
        </div>
      )}

      {!roleLocked && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex gap-3">
          {task.status !== "rejected" && (
            <button
              onClick={() => decide("approved")}
              disabled={saving || isDecided}
              className={`rounded-lg px-5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${
                task.status === "approved"
                  ? "bg-green-600 text-white"
                  : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
              }`}
            >
              {task.status === "approved" ? "Approved" : saving ? "Saving..." : "Approve"}
            </button>
          )}
          {task.status !== "approved" && (
            <button
              onClick={() => decide("rejected")}
              disabled={saving || isDecided}
              className={`rounded-lg border px-5 py-2 text-xs font-semibold transition disabled:cursor-not-allowed ${
                task.status === "rejected"
                  ? "bg-red-600 text-white border-red-600"
                  : "border-gray-200 bg-white text-red-500 hover:bg-red-50 disabled:opacity-40"
              }`}
            >
              {task.status === "rejected" ? "Rejected" : "Reject"}
            </button>
          )}
        </div>
      )}

      {roleLocked && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-500 text-center">
            🔒 View only — You don't have permission to edit this stage
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeApprovalPage() {
  const { role } = useAuth();
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id as string;

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowType>("onboarding");
  const [selectedStage, setSelectedStage] = useState<StageKey | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const myStage = useMemo(() => stageForRole(role), [role]);

  function isStageLockedForRole(key: StageKey): boolean {
    if (myStage === null) return true;
    return myStage !== key;
  }

  // Fix #3: this page used to build its data by fetching
  // /approvals/pending/{role} for HR/IT/Manager and filtering client-side by
  // employee_id. That was lossy (no Security group -> fix #1) and wasteful
  // (pulled every employee's pending items just to find one). Now it fetches
  // this employee's full task set directly.
  async function load() {
    setLoading(true);
    try {
      const [employee, onboardingRes, offboardingRes] = await Promise.all([
        api.getEmployee(employeeId).catch(() => null),
        api.onboardingTasks(employeeId).catch(() => null),
        api.offboardingTasks(employeeId).catch(() => null),
      ]);

      // Confirmed against EmployeeOut in the spec: name, employee_id, email,
      // department, role, experience_level.
      const baseHeader = {
        employee_id: employeeId,
        employee_name: employee?.name,
        emp_id: employee?.employee_id,
        department: employee?.department,
        role: employee?.role,
        experience_level: employee?.experience_level,
        email: employee?.email,
      };

      const newItems: any[] = [];

      if (onboardingRes) {
        newItems.push({
          ...baseHeader,
          workflow_type: "onboarding",
          status: onboardingRes.status || onboardingRes.overall_status,
          tasks: onboardingRes.tasks, // grouped by role: HR / IT / Security / Manager
        });
      }
      if (offboardingRes) {
        newItems.push({
          ...baseHeader,
          workflow_type: "offboarding",
          status: offboardingRes.status || offboardingRes.overall_status,
          tasks: offboardingRes.tasks,
        });
      }

      setItems(newItems);
    } finally {
      setLoading(false);
    }
  }

  // No longer depends on `role` -- fetching is per-employee now, not
  // per-approver-role, so there's nothing to re-fetch when role changes.
  useEffect(() => { load(); }, [employeeId]);

  // Data is already scoped to this employee; kept as its own memo so the
  // rest of the component (which reads `employeeItems`) doesn't need to change.
  const employeeItems = useMemo(() => items, [items]);

  const availableWorkflows = useMemo(() => {
    const set = new Set<WorkflowType>(employeeItems.map((i: any) => i.workflow_type));
    return (["onboarding", "offboarding"] as WorkflowType[]).filter((w) => set.has(w));
  }, [employeeItems]);

  useEffect(() => {
    if (availableWorkflows.length > 0 && !availableWorkflows.includes(activeWorkflow)) {
      setActiveWorkflow(availableWorkflows[0]);
    }
  }, [availableWorkflows, activeWorkflow]);

  const allTasks = useMemo(() => {
    return employeeItems
      .filter((i: any) => i.workflow_type === activeWorkflow)
      .flatMap((i: any) => normalizeTasks(i.tasks).map((t: any) => ({ ...t, _workflow: activeWorkflow })));
  }, [employeeItems, activeWorkflow]);

  const tasksByStage = useMemo(() => {
    const grouped: Record<StageKey, any[]> = { hr: [], it: [], delivery: [] };
    allTasks.forEach((t: any) => grouped[classifyStage(t)].push(t));
    return grouped;
  }, [allTasks]);

 // Stage completion status based ONLY on that stage's tasks.
  // A stage stays "Waiting for Approval" until its own tasks are
  // actually approved/rejected — never auto-marked complete just
  // because it currently has zero tasks.
  const stageCompletionStatus = useMemo(() => {
    const result: Record<StageKey, boolean> = {
      hr: false,
      it: false,
      delivery: false,
    };

    // HR stage completion
    const hrTasks = tasksByStage.hr;
    if (hrTasks.length > 0) {
      result.hr = hrTasks.every(
        (t) => t.status === "approved" || t.status === "verified" || t.status === "rejected"
      );
    }

    // IT stage completion
    const itTasks = tasksByStage.it;
    if (itTasks.length > 0) {
      result.it = itTasks.every(
        (t) => t.status === "approved" || t.status === "verified" || t.status === "rejected"
      );
    }

    // Delivery stage completion
    const deliveryTasks = tasksByStage.delivery;
    if (deliveryTasks.length > 0) {
      result.delivery = deliveryTasks.every(
        (t) => t.status === "approved" || t.status === "verified" || t.status === "rejected"
      );
    }

    return result;
  }, [tasksByStage]);

  // Sequential lock: IT needs HR done, Delivery needs IT done
  function isStageSequentiallyLocked(key: StageKey): boolean {
    if (key === "hr") return false;
    if (key === "it") return !stageCompletionStatus.hr;
    if (key === "delivery") return !stageCompletionStatus.it;
    return false;
  }

  // Stage status for display: completed | pending (never locked for display)
  function stageDisplayStatus(key: StageKey): "completed" | "pending" {
    if (stageCompletionStatus[key]) return "completed";
    return "pending";
  }

  // Stage status for main panel badge: completed | pending | locked
  function stageBadgeStatus(key: StageKey): "completed" | "pending" | "locked" {
    if (stageCompletionStatus[key]) return "completed";
    if (isStageSequentiallyLocked(key)) return "locked";
    return "pending";
  }

  useEffect(() => { setSelectedStage(null); }, [activeWorkflow]);

  useEffect(() => {
    if (selectedStage || employeeItems.length === 0) return;
    // Auto-select first non-completed stage
    const current = STAGES.find((s) => !stageCompletionStatus[s.key]) || STAGES[STAGES.length - 1];
    setSelectedStage(current.key);
  }, [selectedStage, employeeItems, stageCompletionStatus]);

  useEffect(() => { setSelectedTaskId(null); }, [selectedStage, activeWorkflow]);

  const activeStageDef = selectedStage ? STAGES.find((s) => s.key === selectedStage) || null : null;
  const activeDisplayStatus = selectedStage ? stageDisplayStatus(selectedStage) : null;
  const activeBadgeStatus = selectedStage ? stageBadgeStatus(selectedStage) : null;
  const activeTasks = selectedStage ? tasksByStage[selectedStage] : [];
  const activeRoleLocked = selectedStage ? isStageLockedForRole(selectedStage) : false;
  const activeStageIndex = selectedStage ? STAGES.findIndex((s) => s.key === selectedStage) : -1;
  const activeSequentiallyLocked = selectedStage ? isStageSequentiallyLocked(selectedStage) : false;

  const selectedTask = useMemo(
    () => activeTasks.find((t: any) => t.id === selectedTaskId) || null,
    [activeTasks, selectedTaskId]
  );

  // Fix #4: header/overallStatus used to come from employeeItems[0]
  // regardless of which workflow tab was active, so the status badge could
  // be stuck showing the wrong workflow's status after switching tabs.
  const header = useMemo(
    () => employeeItems.find((i: any) => i.workflow_type === activeWorkflow) || employeeItems[0],
    [employeeItems, activeWorkflow]
  );
  const overallStatus = useMemo(() => deriveOverallStatus(header), [header]);
  const statusBadge = useMemo(() => getStatusBadgeStyle(overallStatus), [overallStatus]);

  return (
    <div className="bg-[#FAFAF9] min-h-screen w-full p-6 flex-1">
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653] font-semibold">
            Employee {activeWorkflow === "onboarding" ? "Onboarding" : "Offboarding"}
          </p>
          <h1 className="mt-2 text-4xl font-bold text-[#14213D]">Approval Dashboard</h1>
          <p className="mt-2 text-gray-500">
            Review, edit AI selections and approve or reject each task across HR, IT and Delivery Team.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#14213D]">
            Logged in as {role}
          </div>
          <button
            onClick={() => router.push("/approvals")}
            className="rounded-xl bg-[#14213D] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#243654] transition"
          >
            Back to Directory
          </button>
        </div>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {!loading && !header && (
        <p className="text-gray-500">No pending approvals found for this employee.</p>
      )}

      {!loading && header && (
        <>
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#14213D] text-white text-base font-bold shrink-0">
                {initials(header.employee_name)}
              </div>
              <div className="mr-auto">
                <div className="text-xl font-bold text-[#14213D]">{header.employee_name}</div>
                <div className="text-sm text-gray-500">
                  {header.emp_id ?? "—"}
                  {header.email ? ` · ${header.email}` : ""}
                </div>
              </div>
              <div className="flex gap-8 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Department</div>
                  <div className="font-semibold text-[#14213D]">{header.department || "—"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Role</div>
                  <div className="font-semibold text-[#14213D]">{header.role || "—"}</div>
                </div>
                {header.experience_level && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-400">Experience</div>
                    <div className="font-semibold text-[#14213D]">{header.experience_level}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs uppercase tracking-wide text-gray-400">Status</div>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                    {statusBadge.label}
                  </span>
                </div>
              </div>
            </div>

            {availableWorkflows.length > 1 && (
              <div className="flex gap-2 mt-5 border-t border-gray-100 pt-4">
                {availableWorkflows.map((w) => (
                  <button
                    key={w}
                    onClick={() => setActiveWorkflow(w)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      activeWorkflow === w
                        ? "bg-[#14213D] text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {w === "onboarding" ? "Onboarding" : "Offboarding"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stage selector - NEVER shows "Locked" text */}
          <div className="flex items-center mb-6 flex-wrap">
            {STAGES.map((s, idx) => {
              const displayStatus = stageDisplayStatus(s.key);
              const display = getStageDisplay(s.key, displayStatus, role);
              const roleLocked = isStageLockedForRole(s.key);
              const isActive = selectedStage === s.key;
              // Connector green if THIS stage is completed
              const thisStageCompleted = stageCompletionStatus[s.key];
              return (
                <div key={s.key} className="flex items-center">
                  <button
                    onClick={() => setSelectedStage(s.key)}
                    className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-left transition ${
                      isActive
                        ? "border-[#14213D] bg-white shadow-md"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shrink-0 ${display.circleColor}`}>
                      {displayStatus === "completed" ? "✓" : idx + 1}
                    </div>
                    <div>
                      <div className="font-semibold text-[#14213D] text-sm flex items-center gap-1.5 whitespace-nowrap">
                        {s.title}
                        {roleLocked && <span className="text-xs">🔒</span>}
                      </div>
                      <div className={`text-xs whitespace-nowrap ${display.textColor}`}>
                        {display.text}
                      </div>
                    </div>
                  </button>
                  {idx < STAGES.length - 1 && (
                    <div className={`h-0.5 w-8 md:w-16 mx-1.5 rounded-full shrink-0 ${
                      thisStageCompleted ? "bg-green-500" : "bg-gray-200"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Selected stage panel */}
          {activeStageDef && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-6 md:p-8">
              <p className="text-xs font-semibold tracking-wide text-[#D9A653] uppercase">
                {activeStageDef.eyebrow}
              </p>
              <div className="flex items-center justify-between mt-1 mb-4 flex-wrap gap-2">
                <h3 className="text-2xl font-bold text-[#14213D] flex items-center gap-2">
                  {activeStageDef.title}
                  {activeRoleLocked && (
                    <span
                      title={`Read-only — only ${activeStageDef.title} reviewers can edit this stage`}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500"
                    >
                      🔒 View only
                    </span>
                  )}
                </h3>
                {/* Main panel badge: shows Locked for sequentially locked stages */}
                <span className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                  activeBadgeStatus === "completed"
                    ? "bg-green-100 text-green-700"
                    : activeBadgeStatus === "locked"
                    ? "bg-gray-100 text-gray-500"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {activeBadgeStatus === "completed" ? "Completed" : activeBadgeStatus === "locked" ? "Locked" : "In Progress"}
                </span>
              </div>

              {/* Role-based lock message */}
              {activeRoleLocked && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  🔒 This stage is view-only for your role. Only <strong>{STAGE_APPROVER[activeStageDef.key]}</strong> can edit and approve tasks here.
                </div>
              )}

              {/* Sequential dependency lock message */}
              {!activeRoleLocked && activeSequentiallyLocked && (
                <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  {activeStageIndex === 0
                    ? "This stage will open once previous requirements are met."
                    : `This stage opens for editing once ${STAGES[activeStageIndex - 1]?.title} is completed. You can still review what's queued here.`}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
                <div className="space-y-2">
                  {activeTasks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                      <div className="text-3xl mb-2">📄</div>
                      <p className="text-sm text-gray-500">
                        {activeSequentiallyLocked && !activeRoleLocked
                          ? `This stage will unlock once ${STAGES[activeStageIndex - 1]?.title} is completed.`
                          : "No tasks yet for this stage."}
                      </p>
                    </div>
                  ) : (
                    activeTasks.map((t: any) => (
                      <TaskListButton
                        key={t.id}
                        task={t}
                        isSelected={selectedTaskId === t.id}
                        onSelect={() => setSelectedTaskId(t.id)}
                      />
                    ))
                  )}
                </div>

                <div>
                  {!selectedTask && activeStageDef && (
                    <EmptyTaskPanel stageKey={activeStageDef.key} />
                  )}
                  {selectedTask && (
                    <TaskDetailPanel
                      employeeId={employeeId}
                      employeeName={header.employee_name}
                      task={selectedTask}
                      workflow={selectedTask._workflow}
                      onChanged={load}
                      roleLocked={activeRoleLocked}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}