import { Clock3, Menu, RadioTower } from 'lucide-react';
import { formatDateTime } from '../../utils/formatters';

interface HeaderProps {
  title: string;
  subtitle: string;
  lastUpdate: string;
  onMenuClick: () => void;
}

export default function Header({
  title,
  subtitle,
  lastUpdate,
  onMenuClick
}: HeaderProps) {
  return (
    <header className="dashboard-header">
      <button className="menu-button" type="button" onClick={onMenuClick}>
        <Menu size={22} />
      </button>

      <div className="header-copy">
        <span className="eyebrow">
          <RadioTower size={15} />
          Sistema Nacional de Cómputo Electoral
        </span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>

      <div className="last-update">
        <Clock3 size={17} />
        <div>
          <span>Última actualización</span>
          <strong>{formatDateTime(lastUpdate)}</strong>
        </div>
      </div>
    </header>
  );
}