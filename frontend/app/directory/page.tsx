"use client";
 
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/useAuth";
import Sidebar from "../components/Sidebar";
 
export default function DirectoryPage() {
  const router = useRouter();
 
  const { role, logout } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
 
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
 
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) =>
      [e.name, e.department, e.role, e.employee_id, e.email]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [employees, search]);
 
  const statusClass = (s: string) => {
    switch (s?.toLowerCase()) {
      case "active":
        return "bg-green-100 text-green-700";
      case "onboarding":
        return "bg-amber-100 text-amber-700";
      case "inactive":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };
  return (
  <Sidebar>
    <div className="bg-[#FAFAF9] min-h-screen p-8">
 
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
 
        <div>
          <p className="uppercase tracking-[0.25em] text-xs text-[#D9A653]">
            Employee Management
          </p>
 
          <h2 className="mt-2 text-4xl font-bold text-[#14213D]">
            Employee Directory
          </h2>
 
          <p className="mt-2 text-gray-500">
            View and manage employee records.
          </p>
        </div>
 
        <div className="flex gap-3 items-center">
 
          <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
            Logged in as{" "}
            <span className="font-semibold capitalize">
              {role}
            </span>
          </div>
 
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-xl bg-[#14213D] px-5 py-3 text-white hover:bg-[#D9A653] disabled:opacity-60"
          >
            {syncing ? "Syncing..." : "Sync from HRMS"}
          </button>
 
        </div>
 
      </div>
 
      <div className="mt-8 rounded-2xl border bg-white shadow-sm">
 
        <div className="flex flex-col md:flex-row justify-between gap-4 border-b p-6">
 
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees..."
            className="w-full md:max-w-md rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-[#D9A653]"
          />
 
          <div className="self-center text-sm text-gray-500">
            {filtered.length} Employee(s)
          </div>
 
        </div>
 
        <div className="overflow-x-auto">
 
          <table className="min-w-full">
 
            <thead className="bg-gray-50">
 
              <tr className="text-left text-sm text-gray-600">
 
                <th className="p-4">Employee</th>
                <th className="p-4">Department</th>
                <th className="p-4">Role</th>
                <th className="p-4">Status</th>
                <th className="p-4">Profile</th>
 
              </tr>
 
            </thead>
 
            <tbody>
 
              {filtered.map((e) => (
 
                <tr key={e.id} className="border-t hover:bg-gray-50">
 
                  <td className="p-4">
 
                    <div className="flex items-center gap-3">
 
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#14213D] font-bold text-white">
                        {e.name?.split(" ").map((x: string) => x[0]).join("").slice(0, 2)}
                      </div>
 
                      <div>
 
                        <div className="font-semibold text-[#14213D]">
                          {e.name}
                        </div>
 
                        <div className="text-xs text-gray-500">
                          {e.employee_id}
                        </div>
 
                        <div className="text-xs text-gray-500">
                          {e.email}
                        </div>
 
                      </div>
 
                    </div>
 
                  </td>
 
                  <td className="p-4">
 
                    <div>{e.department}</div>
 
                    <div className="text-xs text-gray-500">
                      {e.office}
                    </div>
 
                  </td>
 
                  <td className="p-4">
                    {e.role || "—"}
                  </td>
 
                  <td className="p-4">
 
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                        e.status
                      )}`}
                    >
                      {e.status}
                    </span>
 
                  </td>
 
                <td className="p-4">
  <button
    onClick={() => router.push(`/directory/${e.id}`)}
    className="rounded-lg bg-[#14213D] px-4 py-2 text-sm font-medium text-white hover:bg-[#243654] transition"
  >
    View
  </button>
</td>
 
                </tr>
 
              ))}
 
              {filtered.length === 0 && (
 
                <tr>
 
                  <td
                    colSpan={5}
                    className="p-10 text-center text-gray-500"
                  >
                    No employees found.
                  </td>
 
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