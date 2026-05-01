import { useEffect, useState } from 'react';
import { api, Acta } from '../api';
import ActaDetalle from './ActaDetalle';

const ESTADOS = ['', 'VALIDADA', 'OBSERVADA', 'OFICIALIZADA', 'IMPORTADA', 'RECHAZADA'];
const PAGE_SIZE = 25;

const ESTADO_CLASS: Record<string, string> = {
  VALIDADA: 'pill-success',
  OFICIALIZADA: 'pill-info',
  OBSERVADA: 'pill-warning',
  RECHAZADA: 'pill-danger',
  IMPORTADA: 'pill-neutral',
  VALIDANDO: 'pill-neutral',
};

export default function ActasList() {
  const [data, setData] = useState<{ actas: Acta[]; total: number } | null>(null);
  const [page, setPage] = useState(0);
  const [estado, setEstado] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    api.getActas(PAGE_SIZE, page * PAGE_SIZE, estado || undefined)
      .then(d => { if (alive) { setData(d); setError(null); } })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [page, estado, reloadKey]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="actas-list">
      <div className="page-header">
        <div>
          <h2>Actas Oficiales</h2>
          <p className="muted">{data ? `${data.total} actas con el filtro actual` : 'Cargando…'}</p>
        </div>
        <div className="header-actions" style={{ gap: 8, display: 'flex' }}>
          {['VALIDADA', 'OBSERVADA', 'OFICIALIZADA', ''].map(s => (
            <button
              key={s || 'all'}
              className={`btn ${estado === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              onClick={() => { setEstado(s); setPage(0); }}
            >
              {s || 'Todas'}
            </button>
          ))}
          <select className="select" value={estado} onChange={e => { setEstado(e.target.value); setPage(0); }}>
            {ESTADOS.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      <div className="card no-padding">
        <table className="table">
          <thead>
            <tr>
              <th>Código Acta</th>
              <th>Mesa</th>
              <th>Recinto</th>
              <th>Estado</th>
              <th className="num">Válidos</th>
              <th className="num">Blancos</th>
              <th className="num">Nulos</th>
              <th className="num">Total</th>
              <th>Importado</th>
            </tr>
          </thead>
          <tbody>
            {data?.actas.map(a => (
              <tr key={a.id} onClick={() => setOpenId(a.id)} style={{ cursor: 'pointer' }}>
                <td><code>{a.codigo_acta}</code></td>
                <td>{a.numero_mesa}</td>
                <td><span className="muted">{a.codigo_recinto}</span> {a.recinto_nombre}</td>
                <td><span className={`pill ${ESTADO_CLASS[a.estado] || 'pill-neutral'}`}>{a.estado}</span></td>
                <td className="num">{a.votos_validos}</td>
                <td className="num">{a.votos_blancos}</td>
                <td className="num">{a.votos_nulos}</td>
                <td className="num"><strong>{a.total_votos}</strong></td>
                <td className="muted">{new Date(a.fecha_importacion).toLocaleString('es-BO')}</td>
              </tr>
            ))}
            {data?.actas.length === 0 && (
              <tr><td colSpan={9} className="empty">No hay actas con esos filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {openId !== null && (
        <ActaDetalle
          actaId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => setReloadKey(k => k + 1)}
        />
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Anterior</button>
          <span className="muted">Página {page + 1} de {totalPages}</span>
          <button className="btn btn-ghost btn-sm" disabled={page + 1 >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente →</button>
        </div>
      )}
    </div>
  );
}
