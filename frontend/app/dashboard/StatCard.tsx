interface StatCardProps {
  label: string;
  value: string | number;
}

export default function StatCard({
  label,
  value,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 h-20">

      <p className="text-[11px] text-gray-500">
        {label}
      </p>

      <h2 className="text-1xl font-bold mt-1">
        {value}
      </h2>

    </div>
  );
}