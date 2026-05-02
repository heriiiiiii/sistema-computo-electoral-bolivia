import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { FuenteDatos, GeograficoItem } from '../../types/dashboard.types';
import { formatTooltipValue } from '../../utils/formatters';

interface GeographicBarChartProps {
  data: GeograficoItem[];
  fuente: FuenteDatos;
}

export default function GeographicBarChart({
  data,
  fuente
}: GeographicBarChartProps) {
  return (
    <div className="chart-box geographic-bar-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 16, right: 28, left: 130, bottom: 20 }}
          barCategoryGap={8}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(148, 163, 184, 0.18)"
          />

          <XAxis
            type="number"
            stroke="#94a3b8"
            tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
          />

          <YAxis
            dataKey="nombre"
            type="category"
            stroke="#94a3b8"
            width={180}
            tick={{ fontSize: 12 }}
            interval={0}
          />

          <Tooltip
            formatter={(value) => formatTooltipValue(value)}
            contentStyle={{
              background: '#0f172a',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              borderRadius: '14px',
              color: '#e5e7eb'
            }}
          />

          <Legend />

          {(fuente === 'RRV' || fuente === 'AMBOS') && (
            <Bar
              dataKey="votosRRV"
              name="RRV"
              fill="#38bdf8"
              radius={[0, 8, 8, 0]}
            />
          )}

          {(fuente === 'OFICIAL' || fuente === 'AMBOS') && (
            <Bar
              dataKey="votosOficial"
              name="Oficial"
              fill="#22c55e"
              radius={[0, 8, 8, 0]}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}