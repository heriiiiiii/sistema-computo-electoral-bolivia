import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';

interface KpiCardProps {
  title: string;
  value: string | number;
  description: string;
  variation?: number;
  status?: 'POSITIVO' | 'NEUTRO' | 'ALERTA' | 'CRITICO';
  icon?: ReactNode;
}

export default function KpiCard({
  title,
  value,
  description,
  variation,
  status = 'NEUTRO',
  icon
}: KpiCardProps) {
  const isPositive = typeof variation === 'number' && variation > 0;
  const isNegative = typeof variation === 'number' && variation < 0;

  return (
    <article className={`kpi-card kpi-${status.toLowerCase()}`}>
      <div className="kpi-top">
        <div>
          <span>{title}</span>
          <strong>{value}</strong>
        </div>

        {icon && <div className="kpi-icon">{icon}</div>}
      </div>

      <p>{description}</p>

      {typeof variation === 'number' && (
        <div className={`kpi-variation ${isPositive ? 'up' : ''} ${isNegative ? 'down' : ''}`}>
          {isPositive && <ArrowUpRight size={16} />}
          {isNegative && <ArrowDownRight size={16} />}
          {!isPositive && !isNegative && <Minus size={16} />}
          <span>{Math.abs(variation).toFixed(1)}% vs corte anterior</span>
        </div>
      )}
    </article>
  );
}