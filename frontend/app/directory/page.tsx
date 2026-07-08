"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/useAuth";
import Sidebar from "../components/Sidebar";

export default function DirectoryPage() {
  useAuth();
  const router = useRouter();
  const [employees, setEmployees] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  const [nameFilter, setNameFilter] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  async function load() {
    setEmployees(await api.listEmployees());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      await api.syncHrmsNewHires();
      await load();
    } finally {
      setSyncing(false);
    }
  }

  const departments = Array.from(new Set(employees.map((e) => e.department))).sort();
  const roles = Array.from(new Set(employees.map((e) => e.role).filter(Boolean))).sort();
  const offices = Array.from(new Set(employees.map((e) => e.office).filter(Boolean))).sort();
  const statuses = Array.from(new Set(employees.map((e) => e.status))).sort();

  const filtered = employees.filter((e) => {
    if (nameFilter && !e.name.toLowerCase().includes(nameFilter.toLowerCase())) return false;
    if (idFilter && !e.employee_id.toLowerCase().includes(idFilter.toLowerCase())) return false;
    if (deptFilter && e.department !== deptFilter) return false;
    if (roleFilter && e.role !== roleFilter) return false;
    if (officeFilter && e.office !== officeFilter) return false;
    if (statusFilter && e.status !== statusFilter) return false;
    return true;
  });

  const selectStyle = { padding: 6, fontSize: 13 };
  const inputStyle = { padding: 6, fontSize: 13, width: 140 };

  return (
    <Sidebar>
      <main style={{ padding: 32, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1>Employee Directory</h1>
          <button onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync from HRMS"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
          <input style={inputStyle} placeholder="Name" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
          <input style={inputStyle} placeholder="Employee ID" value={idFilter} onChange={(e) => setIdFilter(e.target.value)} />
          <select style={selectStyle} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select style={selectStyle} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select style={selectStyle} value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)}>
            <option value="">All Offices</option>
            {offices.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select style={selectStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <p style={{ fontSize: 13, color: "#666" }}>{filtered.length} of {employees.length} employees</p>

        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
              <th>Name</th><th>Department</th><th>Role</th><th>Manager</th>
              <th>Status</th><th>Progress</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: "8px 0" }}>{e.name}</td>
                <td>{e.department}</td>
                <td>{e.role || "—"}</td>
                <td>{e.manager || "—"}</td>
                <td>{e.status}</td>
                <td>{e.completion_pct}%</td>
                <td>
                  <button onClick={() => router.push(`/profile/${e.id}`)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </Sidebar>
  );
}
