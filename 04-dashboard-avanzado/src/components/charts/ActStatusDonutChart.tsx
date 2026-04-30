import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from 'recharts';
import type { ActStatusCount } from '../../types/dashboard.types';
import { formatNumber, formatTooltipValue } from '../../utils/formatters';

type Props = {
  data: ActStatusCount[];
};

const COLORS = [
  '#38bdf8',
  '#22c55e',
  '#facc15',
  '#fb923c',
  '#ef4444',
  '#a855f7',
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#f87171',
  '#93c5fd',
  '#4ade80'
];

function getStatusLabel(item: ActStatusCount) {
  return `${item.fuente} · ${item.estado}`.replace(/_/g, ' ');
}

export default function ActStatusDonutChart({ data }: Props) {
  const total = data.reduce((sum, item) => sum + item.cantidad, 0);

  const chartData = data.map((item, index) => ({
    ...item,
    name: getStatusLabel(item),
    color: COLORS[index % COLORS.length]
  }));

  return (
    <div className="act-status-chart-shell">
      <div className="act-status-donut">
        <ResponsiveContainer width="100%" height={270}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="cantidad"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={72}
              outerRadius={108}
              paddingAngle={2}
              stroke="rgba(15, 23, 42, 0.95)"
              strokeWidth={3}
            >
              {chartData.map((entry) => (
                <Cell key={`${entry.fuente}-${entry.estado}`} fill={entry.color} />
              ))}
            </Pie>

            <Tooltip
              formatter={(value) => formatTooltipValue(value)}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '14px',
                color: '#f8fafc'
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="act-status-center">
          <strong>{formatNumber(total)}</strong>
          <span>Actas</span>
        </div>
      </div>

      <div className="act-status-legend">
        {chartData.map((item) => {
          const percentage = total > 0 ? (item.cantidad / total) * 100 : 0;

          return (
            <div className="act-status-legend-item" key={`${item.fuente}-${item.estado}`}>
              <div className="act-status-legend-main">
                <span
                  className="act-status-color"
                  style={{ backgroundColor: item.color }}
                />
                <span className="act-status-label">{item.name}</span>
              </div>

              <div className="act-status-legend-values">
                <strong>{formatNumber(item.cantidad)}</strong>
                <small>{percentage.toFixed(1)}%</small>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}