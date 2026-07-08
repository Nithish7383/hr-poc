import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface Props {
  title: string;
  data: {
    name: string;
    count: number;
  }[];
  color?: string;
}

export default function BarChartCard({
  title,
  data,
  color = "#6366f1",
}: Props) {
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">

      <h3 className="font-semibold mb-5">
        {title}
      </h3>

      <div className="h-64">

        <ResponsiveContainer width="100%" height="100%">

          <BarChart data={data}>

            <XAxis
              dataKey="name"
              angle={-30}
              textAnchor="end"
              height={60}
              tick={{ fontSize: 12 }}
            />

            <YAxis allowDecimals={false} />

            <Tooltip />

            <Bar
              dataKey="count"
              fill={color}
              radius={[4, 4, 0, 0]}
            />

          </BarChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}