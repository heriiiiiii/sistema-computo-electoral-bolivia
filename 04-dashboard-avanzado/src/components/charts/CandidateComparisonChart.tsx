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
import type { CandidateResult } from '../../types/dashboard.types';
import { formatNumber, formatTooltipValue } from '../../utils/formatters';

interface CandidateComparisonChartProps {
  data: CandidateResult[];
}

export default function CandidateComparisonChart({
  data
}: CandidateComparisonChartProps) {
  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 16, right: 24, left: 12, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.18)" />
          <XAxis dataKey="partido" stroke="#94a3b8" />
          <YAxis
            stroke="#94a3b8"
            tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
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
          <Bar
            dataKey="votosRRV"
            name="Votos RRV"
            fill="#38bdf8"
            radius={[8, 8, 0, 0]}
          />
          <Bar
            dataKey="votosOficial"
            name="Votos Oficial"
            fill="#22c55e"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}