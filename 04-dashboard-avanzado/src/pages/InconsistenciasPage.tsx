import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Filter, RefreshCw } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import FiltersPanel from '../components/filters/FiltersPanel';
import InconsistenciasTable from '../components/tables/InconsistenciasTable';
import type {
  FilterOption,
  Inconsistencia,
  OrigenInconsistencia,
  SeveridadInconsistencia,
  EstadoInconsistencia
} from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';
import '../styles/inconsistencias.css';

const ALL_OPTION: FilterOption = { label: 'Todos', value: 'TODOS' };

const ORIGEN_OPTIONS: FilterOption[] = [
  ALL_OPTION,
  { label: 'RRV', value: 'RRV' },
  { label: 'OFICIAL', value: 'OFICIAL' },
  { label: 'COMPARACION', value: 'COMPARACION' },
  { label: 'SMS', value: 'SMS' },
  { label: 'OCR', value: 'OCR' },
  { label: 'CSV', value: 'CSV' },
  { label: 'SISTEMA', value: 'SISTEMA' }
];

const SEVERIDAD_OPTIONS: FilterOption[] = [
  ALL_OPTION,
  { label: 'BAJA', value: 'BAJA' },
  { label: 'MEDIA', value: 'MEDIA' },
  { label: 'ALTA', value: 'ALTA' },
  { label: 'CRITICA', value: 'CRITICA' }
];

const ESTADO_OPTIONS: FilterOption[] = [
  ALL_OPTION,
  { label: 'ABIERTA', value: 'ABIERTA' },
  { label: 'EN_REVISION', value: 'EN_REVISION' },
  { label: 'RESUELTA', value: 'RESUELTA' },
  { label: 'DESCARTADA', value: 'DESCARTADA' }
];

export default function InconsistenciasPage() {
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [origen, setOrigen] = useState('TODOS');
  const [severidad, setSeveridad] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');

  const cargarDatos = useCallback(() => {
    setLoading(true);
    setError(null);

    dashboardApi
      .getInconsistencias()
      .then((response) => {
        setInconsistencias(response);
        setError(null);
      })
      .catch((err) => {
        console.error('Error cargando inconsistencias:', err);
        setInconsistencias([]);
        setError('No se pudieron cargar las inconsistencias desde los endpoints.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const filtered = useMemo(() => {
    const search = busqueda.trim().toLowerCase();

    return inconsistencias.filter((item) => {
      const matchOrigen =
        origen === 'TODOS' || item.origen === (origen as OrigenInconsistencia);

      const matchSeveridad =
        severidad === 'TODOS' ||
        item.severidad === (severidad as SeveridadInconsistencia);

      const matchEstado =
        estado === 'TODOS' || item.estado === (estado as EstadoInconsistencia);

      const searchableText = [
        item.id,
        item.codigoMesa,
        item.departamento,
        item.municipio,
        item.descripcion,
        item.tipo,
        item.origen,
        item.severidad,
        item.estado
      ]
        .join(' ')
        .toLowerCase();

      const matchBusqueda = search === '' || searchableText.includes(search);

      return matchOrigen && matchSeveridad && matchEstado && matchBusqueda;
    });
  }, [inconsistencias, origen, severidad, estado, busqueda]);

  if (loading) {
    return <div className="loading-card">Cargando inconsistencias...</div>;
  }

  return (
    <section className="page page-enter inconsistencias-page">
      {error && (
        <div className="loading-card">
          <p>{error}</p>
          <button type="button" className="button primary" onClick={cargarDatos}>
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      )}

      <div className="section-header elevated">
        <div>
          <span className="eyebrow">
            <AlertTriangle size={15} />
            Control de inconsistencias
          </span>
          <h2>Inconsistencias reportadas</h2>
          <p>
            Vista de lectura de inconsistencias recibidas desde los backends.
            El dashboard no valida ni recalcula inconsistencias.
          </p>
        </div>
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros de inconsistencias</h3>
            <p>
              Filtrado visual por origen, severidad, estado, código de mesa o descripción.
            </p>
          </div>

          <Filter size={22} />
        </div>

        <FiltersPanel
          filters={[
            {
              id: 'origen',
              label: 'Origen',
              value: origen,
              options: ORIGEN_OPTIONS,
              onChange: setOrigen
            },
            {
              id: 'severidad',
              label: 'Severidad',
              value: severidad,
              options: SEVERIDAD_OPTIONS,
              onChange: setSeveridad
            },
            {
              id: 'estado',
              label: 'Estado',
              value: estado,
              options: ESTADO_OPTIONS,
              onChange: setEstado
            }
          ]}
        />

        <label className="search-field">
          <span>Buscar</span>
          <input
            type="search"
            value={busqueda}
            placeholder="Ej. mesa, municipio, TOTAL_INCOHERENTE..."
            onChange={(event) => setBusqueda(event.target.value)}
          />
        </label>
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla de inconsistencias</h3>
            <p>
              {formatNumber(filtered.length)} registros coinciden con los filtros.
              El filtrado es solo visual.
            </p>
          </div>
        </div>

        <InconsistenciasTable data={filtered} />
      </article>
    </section>
  );
}