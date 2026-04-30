import type { ReactNode } from 'react';

interface SummaryCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: ReactNode;
  status?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
}

export default function SummaryCard({
  title,
  value,
  description,
  icon,
  status = 'neutral'
}: SummaryCardProps) {
  return (
    <article className={`summary-card summary-card-${status}`}>
      <div className="summary-icon">{icon}</div>

      <div>
        <span>{title}</span>
        <strong>{value}</strong>
        {description && <small>{description}</small>}
      </div>
    </article>
  );
}