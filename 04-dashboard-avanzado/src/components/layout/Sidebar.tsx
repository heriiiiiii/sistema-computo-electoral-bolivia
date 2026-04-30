import {
  Activity,
  AlertTriangle,
  FileText,
  GitCompare,
  LayoutDashboard,
  MapPinned,
  ShieldCheck,
  X
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Inicio', icon: LayoutDashboard },
  { to: '/comparacion', label: 'Comparación', icon: GitCompare },
  { to: '/actas', label: 'Actas', icon: FileText },
  { to: '/inconsistencias', label: 'Inconsistencias', icon: AlertTriangle },
  { to: '/geografico', label: 'Geográfico', icon: MapPinned },
  { to: '/tecnico', label: 'Técnico', icon: Activity }
];

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="brand-icon">
          <ShieldCheck size={26} />
        </div>

        <div>
          <strong>SINCE Bolivia</strong>
          <span>Cómputo Electoral</span>
        </div>

        <button className="sidebar-close" type="button" onClick={onClose}>
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
              onClick={onClose}
            >
              <Icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav> 
    </aside>
  );
}