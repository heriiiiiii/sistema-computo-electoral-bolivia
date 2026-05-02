import { useEffect, useState } from 'react';
import { Crown, Search, Trophy, Vote } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import type { GanadorResponse, GanadorScope } from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';

const SCOPE_OPTIONS: { value: GanadorScope; label: string; placeholder: string }[] = [
  { value: 'nacional',     label: 'Nacional',     placeholder: '' },
  { value: 'departamento', label: 'Departamento', placeholder: 'Código de departamento (ej. 02)' },
  { value: 'municipio',    label: 'Municipio',    placeholder: 'Código de municipio' },
  { value: 'recinto',      label: 'Recinto',      placeholder: 'Código de recinto' },
  { value: 'mesa',         label: 'Mesa',         placeholder: 'Código de mesa (ej. 10101001001)' }
];

export default function GanadorPage() {
  const [scope, setScope] = useState<GanadorScope>('nacional');
  const [codigo, setCodigo] = useState<string>('');
  const [data, setData] = useState<GanadorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carga automatica del nacional al entrar
  useEffect(() => {
    fetchGanador('nacional', '');
  }, []);

  async function fetchGanador(s: GanadorScope, c: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.getGanador(s, c || undefined);
      setData(result);
    } catch (e) {
      const err = e as Error & { codigoError?: string };
      setData(null);
      if (err.codigoError === 'SIN_DATOS') {
        setError(`Sin actas computadas para ${s}=${c}.`);
      } else {
        setError(err.message || 'Error consultando el ganador');
      }
    } finally {
      setLoading(false);
    }
  }

  const handleBuscar = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (scope !== 'nacional' && !codigo.trim()) {
      setError('Ingresa un código para buscar.');
      return;
    }
    fetchGanador(scope, codigo.trim());
  };

  const currentScopeOption = SCOPE_OPTIONS.find((o) => o.value === scope)!;

  return (
    <section className="page page-enter">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">
            <Trophy size={15} />
            Búsqueda de ganador
          </span>
          <h2>Ganador por alcance territorial</h2>
          <p>
            Consulta el ganador oficial a nivel nacional, departamento, municipio,
            recinto o mesa, en base a las actas oficialmente computadas
            (estados VALIDADA, OBSERVADA y OFICIALIZADA).
          </p>
        </div>
      </div>

      <article className="panel-card">
        <form onSubmit={handleBuscar} className="ganador-form" style={{
          display: 'grid',
          gridTemplateColumns: '180px 1fr auto',
          gap: '12px',
          alignItems: 'end'
        }}>
          <label>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Alcance</span>
            <select
              value={scope}
              onChange={(e) => {
                const next = e.target.value as GanadorScope;
                setScope(next);
                if (next === 'nacional') setCodigo('');
              }}
              style={{ width: '100%', padding: '8px', borderRadius: 8 }}
            >
              {SCOPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <label>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Código</span>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              disabled={scope === 'nacional'}
              placeholder={currentScopeOption.placeholder}
              style={{ width: '100%', padding: '8px', borderRadius: 8 }}
            />
          </label>

          <button type="submit" disabled={loading} style={{
            padding: '10px 18px',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}>
            <Search size={16} />
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </form>
      </article>

      {error && (
        <article className="panel-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <p style={{ margin: 0 }}>{error}</p>
        </article>
      )}

      {data && (
        <article className="panel-card">
          <div className="section-header">
            <div>
              <h3>
                Ganador {data.scope}
                {data.nombre ? ` — ${data.nombre}` : ''}
                {data.codigo ? ` (${data.codigo})` : ''}
              </h3>
              <p>{formatNumber(data.actasComputadas)} actas computadas · {formatNumber(data.totalVotos)} votos totales</p>
            </div>
          </div>

          {data.ganador.partido ? (
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '12px 0' }}>
              <div style={{
                width: 88,
                height: 88,
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(34,197,94,0.15)'
              }}>
                <Crown size={48} />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>
                  {data.ganador.partido} — {data.ganador.nombre}
                </div>
                <div style={{ marginTop: 6, opacity: 0.85 }}>
                  {formatNumber(data.ganador.votos)} votos
                  {' · '}
                  {data.ganador.porcentaje.toFixed(1)}% del total
                </div>
                <div style={{ marginTop: 4, opacity: 0.7, fontSize: 13 }}>
                  Margen: {formatNumber(data.ganador.margenVotos)} votos
                  {' · '}
                  {data.ganador.margenPorcentual.toFixed(1)} pts
                  {data.ganador.empate && (
                    <span style={{ marginLeft: 8, color: '#f59e0b' }}>
                      ⚠ Empate técnico
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p style={{ opacity: 0.7 }}>No hay votos suficientes para determinar un ganador.</p>
          )}

          <h4 style={{ marginTop: 24 }}>
            <Vote size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Votos por partido
          </h4>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.75, fontSize: 12 }}>
                <th style={{ padding: '6px 0' }}>Partido</th>
                <th style={{ padding: '6px 0' }}>Nombre</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>Votos</th>
                <th style={{ padding: '6px 0', textAlign: 'right' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {data.partidos.map((p) => {
                const pct = data.totalVotos > 0
                  ? (p.votos / data.totalVotos) * 100
                  : 0;
                return (
                  <tr key={p.codigo} style={{ borderTop: '1px solid rgba(148,163,184,0.15)' }}>
                    <td style={{ padding: '8px 0' }}>
                      <span style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: p.color,
                        marginRight: 8
                      }} />
                      {p.codigo}
                    </td>
                    <td style={{ padding: '8px 0' }}>{p.nombre}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{formatNumber(p.votos)}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right' }}>{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}
