export default function DashboardHeader() {
  return (
    <div className="flex justify-between items-start">

      <div>
        <p className="text-xs uppercase tracking-widest text-orange-400">
          Executive Dashboard
        </p>

        <h1 className="text-4xl font-bold text-slate-900">
          Workforce Overview
        </h1>

        <p className="text-gray-500 mt-2">
          Monitor employee lifecycle and organizational health.
        </p>
      </div>

      <button className="border rounded-lg px-4 py-2 text-sm bg-white shadow-sm">
        Logged in as HR
      </button>

    </div>
  );
}