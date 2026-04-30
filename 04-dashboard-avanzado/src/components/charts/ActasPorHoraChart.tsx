import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { ActasPorHora } from '../../types/dashboard.types';
import { formatTooltipValue } from '../../utils/formatters';

interface ActasPorHoraChartProps {
  data: ActasPorHora[];
}

export default function ActasPorHoraChart({ data }: ActasPorHoraChartProps) {
  if (data.length === 0) {
    return (
      <div className="chart-box chart-empty">
        No hay datos disponibles para el flujo de actas.
      </div>
    );
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 18, right: 24, left: 0, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148, 163, 184, 0.18)"
            vertical={false}
          />

          <XAxis
            dataKey="hora"
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.35)' }}
          />

          <YAxis
            stroke="#94a3b8"
            tick={{ fill: '#94a3b8', fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: 'rgba(148, 163, 184, 0.35)' }}
            tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
          />

          <Tooltip
            formatter={(value) => formatTooltipValue(value)}
            labelStyle={{ color: '#e5e7eb' }}
            contentStyle={{
              background: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '14px',
              color: '#e5e7eb'
            }}
          />

          <Legend
            verticalAlign="bottom"
            height={34}
            iconType="circle"
            wrapperStyle={{
              color: '#cbd5e1',
              paddingTop: '10px'
            }}
          />

          <Line
            type="monotone"
            dataKey="recibidas"
            name="Recibidas"
            stroke="#38bdf8"
            strokeWidth={3}
            dot={{ r: 3, fill: '#38bdf8', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />

          <Line
            type="monotone"
            dataKey="procesadas"
            name="Procesadas"
            stroke="#facc15"
            strokeWidth={3}
            dot={{ r: 3, fill: '#facc15', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />

          <Line
            type="monotone"
            dataKey="validadas"
            name="Validadas"
            stroke="#22c55e"
            strokeWidth={3}
            dot={{ r: 3, fill: '#22c55e', strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}