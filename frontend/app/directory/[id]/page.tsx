"use client";
 
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "../../components/Sidebar";
import { api } from "../../../lib/api";
 
export default function EmployeeProfile() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
 
  const [employee, setEmployee] = useState<any>(null);
  const profileFields = [
  employee?.employee_id,
  employee?.name,
  employee?.email,
  employee?.department,
  employee?.role,
  employee?.office,
  employee?.status,
  employee?.phone,
  employee?.joining_date,
  employee?.profile_image,
];
 
const completedFields = profileFields.filter(
  (field) => field !== null && field !== undefined && field !== ""
).length;
 
const profileCompletion = Math.round(
  (completedFields / profileFields.length) * 100
);
 
  useEffect(() => {
    if (!id) return;
 
    api.getEmployee(id).then(setEmployee);
  }, [id]);
 
  if (!employee) {
    return (
      <Sidebar>
        <div className="p-8">Loading...</div>
      </Sidebar>
    );
  }
 
  return (
    <Sidebar>
      <div className="p-8">
 
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/directory")}
            className="rounded-lg border border-[#14213D] px-4 py-2 text-sm font-medium text-[#14213D] hover:bg-[#14213D] hover:text-white transition"
          >
            ← Back to Employee Directory
          </button>
        </div>
 
        <h1 className="text-3xl font-bold text-[#14213D] mb-6">
          Employee Profile
        </h1>
 <div className="mb-6 rounded-xl border bg-white p-6 shadow">
 
  <div className="flex justify-between items-center mb-3">
    <h2 className="text-lg font-semibold text-[#14213D]">
      Profile Completion
    </h2>
 
    <span className="font-bold text-[#14213D]">
      {profileCompletion}%
    </span>
  </div>
 
  <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden">
    <div
      className="h-3 rounded-full bg-green-500 transition-all"
      style={{
        width: `${profileCompletion}%`
      }}
    />
  </div>
 
  <p className="mt-3 text-sm text-gray-500">
    {completedFields} of {profileFields.length} fields completed
  </p>
 
</div>
 
        <div className="bg-white rounded-xl shadow border p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 
            <div>
              <p className="text-gray-500 text-sm">Employee ID</p>
              <h3 className="font-semibold">{employee.employee_id}</h3>
            </div>
 
            <div>
              <p className="text-gray-500 text-sm">Name</p>
              <h3 className="font-semibold">{employee.name}</h3>
            </div>
 
            <div>
              <p className="text-gray-500 text-sm">Email</p>
              <h3 className="font-semibold">{employee.email}</h3>
            </div>
 
            <div>
              <p className="text-gray-500 text-sm">Department</p>
              <h3 className="font-semibold">{employee.department}</h3>
            </div>
 c
            <div>
              <p className="text-gray-500 text-sm">Role</p>
              <h3 className="font-semibold">{employee.role}</h3>
            </div>
 
            <div>
              <p className="text-gray-500 text-sm">Status</p>
              <h3 className="font-semibold">{employee.status}</h3>
            </div>
 
            <div>
              <p className="text-gray-500 text-sm">Office</p>
              <h3 className="font-semibold">{employee.office || "-"}</h3>
            </div>
            <div>
  <p className="text-gray-500 text-sm">Date of Joining</p>
  <h3 className="font-semibold">
    {employee.joining_date || "-"}
  </h3>
</div>
 
          </div>
        </div>
 
      </div>
    </Sidebar>
  );
}