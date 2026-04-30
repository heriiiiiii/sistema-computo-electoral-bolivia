import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';

const PAGE_COPY: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Dashboard nacional',
    subtitle: 'Monitoreo integral de actas, votos, inconsistencias y estado técnico'
  },
  '/comparacion': {
    title: 'Comparación RRV vs Oficial',
    subtitle: 'Análisis de diferencias absolutas, porcentuales y estado de comparación'
  },
  '/actas': {
    title: 'Seguimiento de actas',
    subtitle: 'Control visual de estados, fuentes y trazabilidad de actas digitalizadas'
  },
  '/inconsistencias': {
    title: 'Inconsistencias',
    subtitle: 'Panel de observaciones, severidad, origen y estado operativo'
  },
  '/geografico': {
    title: 'Análisis geográfico',
    subtitle: 'Resultados por departamento, provincia, municipio y recinto'
  },
  '/tecnico': {
    title: 'Monitoreo técnico',
    subtitle: 'Métricas de disponibilidad, latencia, throughput y clústeres'
  }
};

export default function DashboardLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const [lastUpdate, setLastUpdate] = useState(() => new Date().toISOString());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLastUpdate(new Date().toISOString());
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const page = useMemo(() => {
    return PAGE_COPY[location.pathname] ?? PAGE_COPY['/'];
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <Sidebar isOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {mobileOpen && (
        <button
          className="mobile-backdrop"
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="dashboard-frame">
        <Header
          title={page.title}
          subtitle={page.subtitle}
          lastUpdate={lastUpdate}
          onMenuClick={() => setMobileOpen(true)}
        />

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}