import { useState } from 'react';
import { api } from '../api';

export default function CsvUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.uploadCsv(file);
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="csv-upload">
      <div className="page-header">
        <div>
          <h2>Cargar CSV Oficial</h2>
          <p className="muted">Sube un archivo CSV con la transcripción oficial de actas. El backend lo valida fila por fila.</p>
        </div>
      </div>

      <div
        className={`dropzone ${dragOver ? 'dropzone-over' : ''} ${file ? 'dropzone-filled' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) setFile(f);
        }}
      >
        <div className="dropzone-icon">↥</div>
        {file ? (
          <>
            <p className="dropzone-title">{file.name}</p>
            <p className="muted">{(file.size / 1024).toFixed(1)} KB</p>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>Cambiar archivo</button>
          </>
        ) : (
          <>
            <p className="dropzone-title">Arrastra el CSV aquí o haz clic</p>
            <p className="muted">Formato esperado: columnas CodigoRecinto, NroMesa, P1…P4, VotosBlancos, etc.</p>
            <label className="btn btn-primary">
              Seleccionar archivo
              <input
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
            </label>
          </>
        )}
      </div>

      {file && (
        <div className="dropzone-actions">
          <button className="btn btn-primary btn-large" onClick={submit} disabled={submitting}>
            {submitting ? 'Procesando…' : 'Importar al sistema'}
          </button>
        </div>
      )}

      {error && <div className="error-box">⚠ {error}</div>}
      {result && (
        <div className="success-box">
          <strong>✓ Importación completada</strong>
          <div className="result-grid">
            <div><span>Total filas</span><strong>{result.total}</strong></div>
            <div><span>Validadas</span><strong className="text-success">{result.validadas}</strong></div>
            <div><span>Observadas</span><strong className="text-warning">{result.observadas}</strong></div>
            <div><span>Errores críticos</span><strong className="text-danger">{result.erroresCriticos}</strong></div>
            <div><span>ID importación</span><strong>{result.importacionId}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
}
