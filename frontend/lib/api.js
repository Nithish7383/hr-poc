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
  updateEmailDraft: (id, subject, body) =>
    request(`/onboarding/${id}/documents/email-draft`, {
      method: "PATCH", body: JSON.stringify({ subject, body }),
    }),
  checkInbox: (id) => request(`/onboarding/${id}/documents/check-inbox`, { method: "POST" }),
  onboardingTasks: (id) => request(`/onboarding/${id}/tasks`),
  decideTask: (id, taskId, status) =>
    request(`/onboarding/${id}/tasks/${taskId}/decide`, { method: "POST", body: JSON.stringify({ status }) }),
  updateTaskSelection: (id, taskId, selectedOptions) =>
    request(`/onboarding/${id}/tasks/${taskId}/selection`, {
      method: "PATCH", body: JSON.stringify({ selected_options: selectedOptions }),
    }),
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
  auditTrail: (id) => request(`/audit/${id}`),
  dashboardSummary: () => request("/dashboard/summary"),
};