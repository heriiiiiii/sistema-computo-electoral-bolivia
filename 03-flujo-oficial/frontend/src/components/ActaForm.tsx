import { useMemo, useState } from 'react';
import { api } from '../api';

type Row = {
  codigoRecinto: string;
  nroMesa: string;
  votantesHabilitados: string;
  papeletasAnfora: string;
  papeletasNoUtilizadas: string;
  p1: string; p2: string; p3: string; p4: string;
  votosBlancos: string;
  votosNulos: string;
  observaciones: string;
};

const empty: Row = {
  codigoRecinto: '', nroMesa: '', votantesHabilitados: '', papeletasAnfora: '',
  papeletasNoUtilizadas: '', p1: '', p2: '', p3: '', p4: '',
  votosBlancos: '', votosNulos: '', observaciones: '',
};

const n = (v: string) => Number(v) || 0;

export default function ActaForm() {
  const [rows, setRows] = useState<Row[]>([{ ...empty }]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [usuarioCarga, setUsuarioCarga] = useState<string>(
    () => localStorage.getItem('oep:usuarioCarga') || ''
  );

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows(rs => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows(rs => [...rs, { ...empty }]);
  const removeRow = (i: number) => setRows(rs => rs.filter((_, idx) => idx !== i));

  const summary = useMemo(() => {
    return rows.map(r => {
      const validos = n(r.p1) + n(r.p2) + n(r.p3) + n(r.p4);
      const total = validos + n(r.votosBlancos) + n(r.votosNulos);
      const habilitados = n(r.votantesHabilitados);
      const exceedsHabilitados = habilitados > 0 && total > habilitados;
      const negativos = ['p1', 'p2', 'p3', 'p4'].some(k => n(r[k as keyof Row] as string) < 0);
      return { validos, total, exceedsHabilitados, negativos };
    });
  }, [rows]);

  const submit = async () => {
    if (!usuarioCarga.trim()) {
      setError('Ingresa el nombre del usuario que registra el acta antes de enviar.');
      return;
    }
    localStorage.setItem('oep:usuarioCarga', usuarioCarga.trim());
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const payload = rows.map(r => ({
        codigoRecinto: r.codigoRecinto.trim(),
        nroMesa: n(r.nroMesa),
        votantesHabilitados: n(r.votantesHabilitados),
        papeletasAnfora: n(r.papeletasAnfora),
        papeletasNoUtilizadas: n(r.papeletasNoUtilizadas),
        p1: n(r.p1), p2: n(r.p2), p3: n(r.p3), p4: n(r.p4),
        votosValidos: n(r.p1) + n(r.p2) + n(r.p3) + n(r.p4),
        votosBlancos: n(r.votosBlancos),
        votosNulos: n(r.votosNulos),
        observaciones: r.observaciones,
      }));
      const r = await api.bulkActas(payload, usuarioCarga.trim());
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="acta-form">
      <div className="page-header">
        <div>
          <h2>Registrar Actas</h2>
          <p className="muted">Carga manual de transcripciones oficiales. Las actas se validan al enviar.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={addRow}>+ Agregar otra acta</button>
          <button className="btn btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Enviando…' : `Enviar ${rows.length} acta${rows.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      <div className="card form-card">
        <label className="field field-full">
          <span className="field-label">Usuario que registra el acta *</span>
          <input
            type="text"
            value={usuarioCarga}
            onChange={e => setUsuarioCarga(e.target.value)}
            placeholder="Ej: Juan Pérez (jurado mesa 12)"
          />
        </label>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}
      {result && (
        <div className="success-box">
          <strong>✓ Procesado:</strong> {result.validadas} validadas · {result.observadas} observadas · {result.erroresCriticos} errores críticos
          {result.errores?.length > 0 && (
            <ul className="error-list">
              {result.errores.slice(0, 5).map((e: any, i: number) => (
                <li key={i}><code>{e.row}</code>: {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rows.map((row, i) => {
        const s = summary[i];
        return (
          <div key={i} className="card form-card">
            <div className="form-card-header">
              <h3>Acta #{i + 1}</h3>
              {rows.length > 1 && (
                <button className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>Eliminar</button>
              )}
            </div>

            <div className="form-grid">
              <Field label="Código Recinto *" value={row.codigoRecinto} onChange={v => updateRow(i, { codigoRecinto: v })} placeholder="R0001" />
              <Field label="Nro. Mesa *" type="number" value={row.nroMesa} onChange={v => updateRow(i, { nroMesa: v })} />
              <Field label="Habilitados" type="number" value={row.votantesHabilitados} onChange={v => updateRow(i, { votantesHabilitados: v })} />
              <Field label="Papeletas Ánfora" type="number" value={row.papeletasAnfora} onChange={v => updateRow(i, { papeletasAnfora: v })} />
              <Field label="Papeletas No Usadas" type="number" value={row.papeletasNoUtilizadas} onChange={v => updateRow(i, { papeletasNoUtilizadas: v })} />
            </div>

            <h4 className="form-subtitle">Votos por Partido</h4>
            <div className="form-grid form-grid-4">
              <Field label="P1" type="number" value={row.p1} onChange={v => updateRow(i, { p1: v })} accent="#3b82f6" />
              <Field label="P2" type="number" value={row.p2} onChange={v => updateRow(i, { p2: v })} accent="#ef4444" />
              <Field label="P3" type="number" value={row.p3} onChange={v => updateRow(i, { p3: v })} accent="#10b981" />
              <Field label="P4" type="number" value={row.p4} onChange={v => updateRow(i, { p4: v })} accent="#f59e0b" />
            </div>

            <h4 className="form-subtitle">Otros Votos</h4>
            <div className="form-grid form-grid-2">
              <Field label="Blancos" type="number" value={row.votosBlancos} onChange={v => updateRow(i, { votosBlancos: v })} />
              <Field label="Nulos" type="number" value={row.votosNulos} onChange={v => updateRow(i, { votosNulos: v })} />
            </div>

            <Field label="Observaciones" value={row.observaciones} onChange={v => updateRow(i, { observaciones: v })} placeholder="Texto libre" full />

            <div className="form-summary">
              <div className="form-summary-item"><span>Válidos (P1+P2+P3+P4)</span><strong>{s.validos}</strong></div>
              <div className="form-summary-item"><span>Total Votos</span><strong>{s.total}</strong></div>
              {s.exceedsHabilitados && <div className="warning-chip">⚠ Total excede los habilitados</div>}
              {s.negativos && <div className="warning-chip">⚠ Hay votos negativos</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; full?: boolean; accent?: string;
}) {
  return (
    <label className={`field ${props.full ? 'field-full' : ''}`}>
      <span className="field-label" style={props.accent ? { color: props.accent } : undefined}>{props.label}</span>
      <input
        type={props.type || 'text'}
        value={props.value}
        onChange={e => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </label>
  );
}
