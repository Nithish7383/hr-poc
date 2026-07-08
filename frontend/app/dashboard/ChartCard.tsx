import { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

export default function ChartCard({
  title,
  children,
}: Props) {
  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm">

      <h3 className="font-semibold mb-5">
        {title}
      </h3>

      {children}

    </div>
  );
}