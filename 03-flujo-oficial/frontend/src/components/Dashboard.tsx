import { useEffect, useState } from 'react';
import { api, Resumen } from '../api';
import LiveFeed from './LiveFeed';

const PARTY_COLORS: Record<string, string> = {
  P1: '#3b82f6',
  P2: '#ef4444',
  P3: '#10b981',
  P4: '#f59e0b',
};

const ESTADO_COLORS: Record<string, string> = {
  VALIDADA: '#10b981',
  OFICIALIZADA: '#06b6d4',
  OBSERVADA: '#f59e0b',
  RECHAZADA: '#ef4444',
  IMPORTADA: '#6366f1',
  VALIDANDO: '#a78bfa',
};

function formatNumber(n: number) {
  return new Intl.NumberFormat('es-BO').format(n);
}

export default function Dashboard() {
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await api.getResumen();
        if (!alive) return;
        setData(r);
        setError(null);
        setLastUpdate(new Date());
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (error) return <div className="error-box">⚠ {error}</div>;
  if (!data) return <div className="loading">Cargando datos…</div>;

  const totalVotosVal = data.votos.validos + data.votos.blancos + data.votos.nulos;
  const partidoTotal = data.porPartido.reduce((a, p) => a + Number(p.total_votos || 0), 0);
  const winning = [...data.porPartido].sort((a, b) => Number(b.total_votos) - Number(a.total_votos))[0];

  return (
    <div className="dashboard">
      <div className="live-indicator">
        <span className="dot"></span>
        EN VIVO · Última actualización: {lastUpdate?.toLocaleTimeString('es-BO')}
      </div>

      <section className="kpi-grid">
        <KpiCard label="Total Actas" value={formatNumber(data.actas.total)} hint="Procesadas en sistema" accent="#3b82f6" />
        <KpiCard label="Votos Válidos" value={formatNumber(data.votos.validos)} hint={`${pct(data.votos.validos, totalVotosVal)}% del total`} accent="#10b981" />
        <KpiCard label="Votos Blancos" value={formatNumber(data.votos.blancos)} hint={`${pct(data.votos.blancos, totalVotosVal)}%`} accent="#a78bfa" />
        <KpiCard label="Votos Nulos" value={formatNumber(data.votos.nulos)} hint={`${pct(data.votos.nulos, totalVotosVal)}%`} accent="#ef4444" />
      </section>

      <section className="card-grid">
        <LiveFeed />

        <div className="card card-wide">
          <div className="card-header">
            <h2>Resultados por Partido</h2>
            {winning && Number(winning.total_votos) > 0 && (
              <span className="badge badge-winner">
                Liderando: {winning.codigo} · {pct(Number(winning.total_votos), partidoTotal)}%
              </span>
            )}
          </div>
          <div className="party-list">
            {data.porPartido.map(p => {
              const v = Number(p.total_votos || 0);
              const percent = partidoTotal ? (v / partidoTotal) * 100 : 0;
              return (
                <div key={p.codigo} className="party-row">
                  <div className="party-label">
                    <span className="party-code" style={{ background: PARTY_COLORS[p.codigo] || '#64748b' }}>
                      {p.codigo}
                    </span>
                    <span>{p.nombre}</span>
                  </div>
                  <div className="party-bar-wrap">
                    <div
                      className="party-bar"
                      style={{ width: `${percent}%`, background: PARTY_COLORS[p.codigo] || '#64748b' }}
                    />
                  </div>
                  <div className="party-votes">
                    <strong>{formatNumber(v)}</strong>
                    <span className="muted">{percent.toFixed(2)}%</span>
                  </div>
                </div>
              );
            })}
            {data.porPartido.length === 0 && <p className="muted">Sin resultados aún.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Estado de Actas</h2></div>
          <div className="estado-list">
            {Object.entries(data.actas.porEstado).map(([estado, total]) => (
              <div key={estado} className="estado-row">
                <span className="estado-pill" style={{ background: ESTADO_COLORS[estado] || '#64748b' }}>
                  {estado}
                </span>
                <strong>{formatNumber(total)}</strong>
              </div>
            ))}
            {Object.keys(data.actas.porEstado).length === 0 && (
              <p className="muted">Aún no hay actas cargadas.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Importaciones CSV</h2></div>
          <div className="estado-list">
            {data.importaciones.map((i, idx) => (
              <div key={idx} className="estado-row">
                <span className="estado-pill estado-pill-soft">{i.estado}</span>
                <strong>{i.total}</strong>
              </div>
            ))}
            {data.importaciones.length === 0 && <p className="muted">No se han importado CSVs.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2>Inconsistencias</h2></div>
          <div className="estado-list">
            {data.inconsistencias.map((i, idx) => (
              <div key={idx} className="estado-row">
                <span className={`estado-pill sev-${i.severidad?.toLowerCase()}`}>{i.severidad}</span>
                <span className="muted">{i.estado}</span>
                <strong>{i.total}</strong>
              </div>
            ))}
            {data.inconsistencias.length === 0 && <p className="muted">Sin inconsistencias registradas.</p>}
          </div>
        </div>

        <div className="card card-wide">
          <div className="card-header"><h2>Estado del Cluster</h2></div>
          <div className="cluster-grid">
            {data.clusterStatus.map((c, idx) => (
              <div key={idx} className={`cluster-node cluster-${c.estado?.toLowerCase()}`}>
                <div className="cluster-top">
                  <strong>{c.nodo}</strong>
                  <span className="cluster-rol">{c.rol}</span>
                </div>
                <div className="cluster-meta">
                  <span>{c.motor}</span>
                  <span className={`cluster-status cluster-status-${c.estado?.toLowerCase()}`}>{c.estado}</span>
                </div>
              </div>
            ))}
            {data.clusterStatus.length === 0 && <p className="muted">No hay datos de cluster.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

function pct(n: number, total: number) {
  if (!total) return '0.0';
  return ((n / total) * 100).toFixed(1);
}

function KpiCard({ label, value, hint, accent }: { label: string; value: string; hint: string; accent: string }) {
  return (
    <div className="kpi-card" style={{ borderTopColor: accent }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-hint">{hint}</span>
    </div>
  );
}
