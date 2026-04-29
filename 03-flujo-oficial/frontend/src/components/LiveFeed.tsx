import { useEffect, useRef, useState } from 'react';
import { api, Acta } from '../api';

const POLL_MS = 2000;

const ESTADO_CLASS: Record<string, string> = {
  VALIDADA: 'pill-success',
  OFICIALIZADA: 'pill-info',
  OBSERVADA: 'pill-warning',
  RECHAZADA: 'pill-danger',
  IMPORTADA: 'pill-neutral',
  VALIDANDO: 'pill-neutral',
};

export default function LiveFeed() {
  const [actas, setActas] = useState<Acta[]>([]);
  const [counter, setCounter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const seenIds = useRef<Set<number>>(new Set());
  const newIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.getActas(8, 0);
        if (!alive) return;
        const fresh: number[] = [];
        for (const a of r.actas) {
          if (!seenIds.current.has(a.id)) {
            fresh.push(a.id);
            seenIds.current.add(a.id);
          }
        }
        if (fresh.length > 0) {
          newIds.current = new Set(fresh);
          setCounter(c => c + fresh.length);
          setTimeout(() => { newIds.current = new Set(); }, 1500);
        }
        setActas(r.actas);
        setError(null);
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, [paused]);

  return (
    <div className="card card-wide">
      <div className="card-header">
        <h2>
          Actas en Vivo
          <span className="live-counter">{counter} nuevas</span>
        </h2>
        <button className="btn btn-ghost btn-sm" onClick={() => setPaused(p => !p)}>
          {paused ? '▶ Reanudar' : '⏸ Pausar'}
        </button>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      <div className="feed">
        {actas.length === 0 && !error && <p className="muted">Esperando actas…</p>}
        {actas.map(a => {
          const isNew = newIds.current.has(a.id);
          return (
            <div key={a.id} className={`feed-row ${isNew ? 'feed-row-new' : ''}`}>
              <div className="feed-left">
                <span className={`pill ${ESTADO_CLASS[a.estado] || 'pill-neutral'}`}>{a.estado}</span>
                <code className="feed-code">{a.codigo_acta}</code>
                <span className="muted">Mesa {a.numero_mesa} · {a.codigo_recinto}</span>
              </div>
              <div className="feed-right">
                <span className="feed-stat"><span className="muted">Válidos</span><strong>{a.votos_validos}</strong></span>
                <span className="feed-stat"><span className="muted">Blancos</span><strong>{a.votos_blancos}</strong></span>
                <span className="feed-stat"><span className="muted">Nulos</span><strong>{a.votos_nulos}</strong></span>
                <span className="feed-stat"><span className="muted">Total</span><strong>{a.total_votos}</strong></span>
                <span className="muted feed-time">{new Date(a.fecha_importacion).toLocaleTimeString('es-BO')}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
