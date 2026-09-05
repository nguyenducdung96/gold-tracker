import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from "recharts";
import type { VNQuote } from "../types";

export function VietnamChart({
  selected,
  data
}: {
  selected: VNQuote | null;
  data: any[];
}) {
  return (
    <section className="card">
      <div className="sectionTitle">
        {selected
          ? `${selected.brand} · ${selected.productName}`
          : "Biểu đồ giá vàng Việt Nam"}
      </div>

      <div className="chart">
        {!selected || data.length < 2 ? (
          <div className="empty">
            Chọn một dòng trong bảng. Chart dùng lịch sử backend đã tích lũy.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
              <XAxis
                dataKey="ts"
                tickFormatter={(x) =>
                  new Date(x).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit"
                  })
                }
                minTickGap={30}
              />
              <YAxis domain={["auto", "auto"]} width={88} />
              <Tooltip
                labelFormatter={(x) => new Date(x).toLocaleString("vi-VN")}
                formatter={(v: number) => [
                  `${Number(v).toLocaleString("vi-VN")} đ`,
                  ""
                ]}
              />
              <Legend />
              <Line dataKey="buy" name="Mua" dot={false} strokeWidth={2} />
              <Line dataKey="sell" name="Bán" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
