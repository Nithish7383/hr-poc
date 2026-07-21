// Single place all screens call through -- keeps the API base URL, auth
// token attachment, and fetch error handling consistent across every page.
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// --- token storage ---
export function setToken(token, role) {
  localStorage.setItem("access_token", token);
  localStorage.setItem("user_role", role);
}
export function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
}
export function getRole() {
  return typeof window !== "undefined" ? localStorage.getItem("user_role") : null;
}
export function clearToken() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("user_role");
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) clearToken(); // token expired/invalid -- force re-login
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export const api = {
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  listEmployees: () => request("/employees"),

  getEmployee: (id) => request(`/employees/${id}`),
  getProfile: (id) => request(`/employees/${id}/profile`),
  createEmployee: (payload) =>
    request("/employees", { method: "POST", body: JSON.stringify(payload) }),
  syncHrmsNewHires: () => request("/hrms/sync/new-hires", { method: "POST" }),
  syncHrmsExits: () => request("/hrms/sync/exits", { method: "POST" }),
  onboardingStatus: (id) => request(`/onboarding/${id}/status`),
  onboardingDocuments: (id) => request(`/onboarding/${id}/documents`),
  markDocumentsReceived: (id) => request(`/onboarding/${id}/documents/mark-received`, { method: "POST" }),
  // Legacy endpoint -- per the OpenAPI description this "assum[es]
  // DocumentRequestEmail" specifically, so it's only correct for the
  // Missing Document Request Email task. Kept for back-compat; page.tsx
  // now uses updateTaskEmailDraft (below) instead, which is generic.
  updateEmailDraft: (id, subject, body) =>
    request(`/onboarding/${id}/documents/email-draft`, {
      method: "PATCH", body: JSON.stringify({ subject, body }),
    }),
  // Generic version confirmed in the spec: PATCH /onboarding/{id}/tasks/{task_id}/email-draft
  // -- explicitly covers all three email_draft task kinds (Welcome Email /
  // Onboarding Feedback Request / Missing Document Request Email) by
  // resolving through the task itself. Use this one for new code.
  updateTaskEmailDraft: (id, taskId, subject, body) =>
    request(`/onboarding/${id}/tasks/${taskId}/email-draft`, {
      method: "PATCH", body: JSON.stringify({ subject, body }),
    }),
  // Checks for replies to a "Missing Document Request Email" task specifically.
  checkInbox: (id) => request(`/onboarding/${id}/documents/check-inbox`, { method: "POST" }),
  // Checks for replies to an "Onboarding Feedback Request" task specifically
  // -- a separate endpoint per the spec, not the same inbox as checkInbox above.
  checkFeedbackInbox: (id) => request(`/onboarding/${id}/feedback/check-inbox`, { method: "POST" }),
  onboardingTasks: (id) => request(`/onboarding/${id}/tasks`),
  decideTask: (id, taskId, status) =>
    request(`/onboarding/${id}/tasks/${taskId}/decide`, { method: "POST", body: JSON.stringify({ status }) }),
  updateTaskSelection: (id, taskId, selectedOptions) =>
    request(`/onboarding/${id}/tasks/${taskId}/selection`, {
      method: "PATCH", body: JSON.stringify({ selected_options: selectedOptions }),
    }),

  // NOTE: approvalsForEmployee is left here in case other screens (e.g. the
  // /approvals directory list) still use it, but the employee detail page
  // (approvals/[id]/page.tsx) no longer calls this -- see fix #3/#1: it was
  // missing the "Security" role group entirely, which made Security-stage
  // tasks (Assign Security Groups, Ethical Wall Assignment, Privileged
  // Access Review) invisible and unapprovable on that page.
  approvalsForEmployee: async (employeeId) => {
    const ROLE_TO_GROUP = { HR: "hr", IT: "it", Manager: "manager", Security: "security" };

    const results = await Promise.all(
      Object.entries(ROLE_TO_GROUP).map(async ([roleParam, group]) => {
        try {
          const data = await request(`/approvals/pending/${roleParam}`);
          const list = Array.isArray(data) ? data : data ? [data] : [];
          return list.map((item) => ({
            ...item,
            tasks: Array.isArray(item.tasks)
              ? item.tasks.map((t) => ({ ...t, _roleGroup: t._roleGroup || group }))
              : item.tasks,
          }));
        } catch (err) {
          console.warn(`approvalsForEmployee: failed to fetch role "${roleParam}"`, err);
          return [];
        }
      })
    );

    const merged = results.flat().filter(Boolean);
    return employeeId
      ? merged.filter((item) => item.employee_id === employeeId)
      : merged;
  },

  approvalsForRole: (role) => request(`/approvals/pending/${role}`),
  insightsSummary: () => request("/insights/summary"),
  employeeDecisions: (id) => request(`/employees/${id}/decisions`),
  complianceSummary: () => request("/compliance/summary"),
  generateReport: (id, reportType) => request(`/reports/${id}?report_type=${reportType}`),
  offboardingStatus: (id) => request(`/offboarding/${id}/status`),
  offboardingTasks: (id) => request(`/offboarding/${id}/tasks`),
  decideOffboardingTask: (id, taskId, status) =>
    request(`/offboarding/${id}/tasks/${taskId}/decide`, { method: "POST", body: JSON.stringify({ status }) }),
  updateOffboardingTaskSelection: (id, taskId, selectedOptions) =>
    request(`/offboarding/${id}/tasks/${taskId}/selection`, {
      method: "PATCH", body: JSON.stringify({ selected_options: selectedOptions }),
    }),
  // No offboarding email-draft / check-inbox methods here -- confirmed via the
  // OpenAPI spec that the backend has no such routes under /offboarding/.
  // Email actions (Save Edits, Check Inbox) are onboarding-only for now;
  // see TaskDetailPanel in page.tsx.

  auditTrail: (id) => request(`/audit/${id}`),
  dashboardSummary: () => request("/dashboard/summary"),
};