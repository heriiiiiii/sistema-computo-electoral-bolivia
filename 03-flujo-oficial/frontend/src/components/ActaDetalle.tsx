import { useEffect, useState } from 'react';
import { api } from '../api';

type Props = { actaId: number; onClose: () => void; onChanged?: () => void };

export default function ActaDetalle({ actaId, onClose, onChanged }: Props) {
  const [acta, setActa] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const data = await api.getActaDetalle(actaId);
      setActa(data);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); }, [actaId]);

  async function recalcular() {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const r = await api.recalcularActa(actaId);
      setMsg(`OK · ${r.estadoAnterior} → ${r.estadoNuevo} · VotosValidos=${r.votosValidos} · Total=${r.totalVotos}`);
      await load();
      onChanged?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!acta && !err) return <div className="modal-back"><div className="modal">Cargando…</div></div>;

  const partidos = acta?.resultados || [];
  const sumaPartidos = partidos.reduce((s: number, r: any) => s + (Number(r.cantidad_votos) || 0), 0);
  const validos = Number(acta?.votos_validos) || 0;
  const desfase = sumaPartidos - validos;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>Acta {acta?.codigo_acta}</h2>
            <p>{acta?.recinto_nombre} · Mesa {acta?.numero_mesa} ({acta?.codigo_mesa})</p>
          </div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </header>

        {err && <div className="alert alert-err">{err}</div>}
        {msg && <div className="alert alert-ok">{msg}</div>}

        {acta && (
          <>
            <section className="kv-grid">
              <div><label>Estado</label><strong className={`badge badge-${acta.estado.toLowerCase()}`}>{acta.estado}</strong></div>
              <div><label>Fuente</label><strong>{acta.fuente}</strong></div>
              <div><label>Recalculado</label><strong>{acta.recalculado ? 'Sí' : 'No'}</strong></div>
              <div><label>Importado por</label><strong>{acta.usuario_importacion || '—'}</strong></div>
              <div><label>Fecha importación</label><strong>{acta.fecha_importacion ? new Date(acta.fecha_importacion).toLocaleString('es-BO') : '—'}</strong></div>
              <div><label>Validado por</label><strong>{acta.usuario_validacion || '—'}</strong></div>
              <div><label>Fecha validación</label><strong>{acta.fecha_validacion ? new Date(acta.fecha_validacion).toLocaleString('es-BO') : '—'}</strong></div>
              <div><label>Apertura</label><strong>{String(acta.apertura_hora ?? '-').padStart(2, '0')}:{String(acta.apertura_minutos ?? '-').padStart(2, '0')}</strong></div>
              <div><label>Cierre</label><strong>{String(acta.cierre_hora ?? '-').padStart(2, '0')}:{String(acta.cierre_minutos ?? '-').padStart(2, '0')}</strong></div>
            </section>

            {acta.observacion && (
              <div className="alert" style={{ background: 'rgba(255,201,122,.08)', color: '#ffc97a' }}>
                <strong>Observaciones del CSV:</strong> {acta.observacion}
              </div>
            )}

            <h3>Votos por partido</h3>
            <table className="tbl">
              <thead><tr><th>Partido</th><th>Nombre</th><th>Votos</th></tr></thead>
              <tbody>
                {partidos.map((p: any) => (
                  <tr key={p.partido}><td>{p.partido}</td><td>{p.partido_nombre}</td><td>{p.cantidad_votos}</td></tr>
                ))}
                <tr className="row-total"><td colSpan={2}>Suma P1..P4</td><td>{sumaPartidos}</td></tr>
              </tbody>
            </table>

            <h3>Totales</h3>
            <section className="kv-grid">
              <div><label>VotosValidos</label><strong>{validos}</strong></div>
              <div><label>VotosBlancos</label><strong>{acta.votos_blancos}</strong></div>
              <div><label>VotosNulos</label><strong>{acta.votos_nulos}</strong></div>
              <div><label>TotalVotos</label><strong>{acta.total_votos}</strong></div>
              <div><label>Papeletas ánfora</label><strong>{acta.papeletas_en_anfora}</strong></div>
              <div><label>Desfase (P1..P4 − VotosValidos)</label>
                <strong style={{ color: desfase === 0 ? 'var(--ok)' : 'var(--err)' }}>{desfase}</strong>
              </div>
            </section>

            {acta.estado === 'OBSERVADA' && (
              <div className="recalc-box">
                <p>
                  Esta acta está <strong>OBSERVADA</strong>. Si confías en P1+P2+P3+P4 como verdad,
                  recalcular fijará <code>VotosValidos = {sumaPartidos}</code> y reaplicará las reglas.
                  Si quedan todas en OK pasará a <strong>VALIDADA</strong>.
                </p>
                <button className="btn-primary" onClick={recalcular} disabled={busy}>
                  {busy ? 'Recalculando…' : 'Recalcular y validar'}
                </button>
              </div>
            )}

            {(() => {
              const fallidas = (acta.validaciones || []).filter((v: any) => v.resultado !== 'OK');
              if (fallidas.length === 0) {
                return <div className="alert alert-ok">✓ Todas las reglas pasaron sin observaciones.</div>;
              }
              // Dedup: misma regla puede haberse logueado varias veces si la acta fue re-validada
              const dedup = new Map<string, any>();
              for (const v of fallidas) if (!dedup.has(v.regla)) dedup.set(v.regla, v);
              const items = [...dedup.values()];
              const errors = items.filter((v: any) => v.resultado === 'ERROR');
              const warns  = items.filter((v: any) => v.resultado === 'WARNING');

              // Resumen ejecutivo: por qué la acta está en su estado actual.
              let resumen: { tono: 'err' | 'warn' | 'ok'; titulo: string; texto: string };
              if (acta.estado === 'OBSERVADA') {
                resumen = {
                  tono: 'err',
                  titulo: `OBSERVADA — ${errors.length} regla(s) rotas`,
                  texto: `El acta tiene errores en reglas numéricas (R1..R7), horarios (H1..H4) o causales reportadas en la columna Observaciones del CSV (Ley 026). Revisar el listado para ver el motivo exacto.`,
                };
              } else if (warns.length > 0) {
                resumen = {
                  tono: 'warn',
                  titulo: `VALIDADA con ${warns.length} advertencia(s)`,
                  texto: `Los números calzan y no hay causales graves del CSV. Las advertencias listadas son informativas (delegados ausentes, tolerancias horarias, falta de datos) y NO degradan el estado del acta.`,
                };
              } else {
                resumen = { tono: 'ok', titulo: 'Sin observaciones', texto: '' };
              }

              return (
                <>
                  <div className={`alert alert-${resumen.tono}`} style={{ marginTop: 16 }}>
                    <strong>{resumen.titulo}</strong>
                    {resumen.texto && <p style={{ margin: '6px 0 0' }}>{resumen.texto}</p>}
                  </div>
                  <h3>Reglas con observación ({items.length})</h3>
                  <table className="tbl">
                    <thead><tr><th>Regla</th><th>Tipo</th><th>Severidad</th><th>Por qué</th></tr></thead>
                    <tbody>
                      {items.map((v: any, i: number) => (
                        <tr key={i} className={`row-${v.resultado.toLowerCase()}`}>
                          <td><code>{v.regla}</code></td>
                          <td>{v.resultado === 'ERROR' ? '⛔ ERROR' : '⚠ WARNING'}</td>
                          <td>{v.severidad}</td>
                          <td>{v.mensaje}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
