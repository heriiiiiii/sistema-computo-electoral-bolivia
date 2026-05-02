import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Database, Filter, RefreshCw } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import { DASHBOARD_ENDPOINTS } from '../api/endpoints';
import FiltersPanel from '../components/filters/FiltersPanel';
import InconsistenciasTable from '../components/tables/InconsistenciasTable';
import type { FilterOption, Inconsistencia } from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';
import '../styles/inconsistencias.css';

const ALL_OPTION: FilterOption = { label: 'Todos', value: 'TODOS' };

interface OficialResumenInconsistencia {
  id: string;
  origen: 'OFICIAL';
  severidad: string;
  estado: string;
  total: string | number;
}

interface OficialResumenResponse {
  success: boolean;
  data?: {
    inconsistencias?: Array<{
      severidad?: string;
      estado?: string;
      total?: string | number;
    }>;
  };
}

function isValidFilterValue(value: string | null | undefined): value is string {
  if (!value) return false;

  const trimmed = value.trim();

  return trimmed !== '' && trimmed !== '-' && trimmed !== 'No especificado';
}

function buildFilterOptions(values: Array<string | null | undefined>): FilterOption[] {
  const uniqueValues = Array.from(new Set(values.filter(isValidFilterValue))).sort(
    (a, b) => a.localeCompare(b)
  );

  return [
    ALL_OPTION,
    ...uniqueValues.map((value) => ({
      label: value,
      value
    }))
  ];
}

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function buildApiUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  const baseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  return `${baseUrl}${normalizedEndpoint}`;
}

async function getResumenOficialInconsistencias(): Promise<
  OficialResumenInconsistencia[]
> {
  const response = await fetch(buildApiUrl(DASHBOARD_ENDPOINTS.resumenOficial), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error('No se pudo cargar el resumen oficial.');
  }

  const payload = (await response.json()) as OficialResumenResponse;

  return (payload.data?.inconsistencias || []).map((item, index) => ({
    id: `OF-INC-${index + 1}`,
    origen: 'OFICIAL',
    severidad: item.severidad || 'Sin dato',
    estado: item.estado || 'Sin dato',
    total: item.total ?? '0'
  }));
}

export default function InconsistenciasPage() {
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [resumenOficial, setResumenOficial] = useState<
    OficialResumenInconsistencia[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oficialError, setOficialError] = useState<string | null>(null);

  const [origen, setOrigen] = useState('TODOS');
  const [severidad, setSeveridad] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOficialError(null);

    const [rrvResult, oficialResult] = await Promise.allSettled([
      dashboardApi.getInconsistencias(),
      getResumenOficialInconsistencias()
    ]);

    if (rrvResult.status === 'fulfilled') {
      setInconsistencias(rrvResult.value);
      setError(null);
    } else {
      console.error('Error cargando inconsistencias RRV:', rrvResult.reason);
      setInconsistencias([]);
      setError('No se pudieron cargar las inconsistencias desde RRV.');
    }

    if (oficialResult.status === 'fulfilled') {
      setResumenOficial(oficialResult.value);
      setOficialError(null);
    } else {
      console.error(
        'Error cargando resumen agregado oficial:',
        oficialResult.reason
      );
      setResumenOficial([]);
      setOficialError(
        'No se pudo cargar el resumen agregado de inconsistencias oficiales.'
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const origenOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(inconsistencias.map((item) => item.origen));
  }, [inconsistencias]);

  const severidadOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(inconsistencias.map((item) => item.severidad));
  }, [inconsistencias]);

  const estadoOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(inconsistencias.map((item) => item.estado));
  }, [inconsistencias]);

  useEffect(() => {
    if (origen === 'TODOS') return;

    const existe = origenOptions.some((option) => option.value === origen);

    if (!existe) {
      setOrigen('TODOS');
    }
  }, [origen, origenOptions]);

  useEffect(() => {
    if (severidad === 'TODOS') return;

    const existe = severidadOptions.some((option) => option.value === severidad);

    if (!existe) {
      setSeveridad('TODOS');
    }
  }, [severidad, severidadOptions]);

  useEffect(() => {
    if (estado === 'TODOS') return;

    const existe = estadoOptions.some((option) => option.value === estado);

    if (!existe) {
      setEstado('TODOS');
    }
  }, [estado, estadoOptions]);

  const filtered = useMemo(() => {
    const search = normalizeSearch(busqueda);

    return inconsistencias.filter((item) => {
      const matchOrigen = origen === 'TODOS' || item.origen === origen;
      const matchSeveridad = severidad === 'TODOS' || item.severidad === severidad;
      const matchEstado = estado === 'TODOS' || item.estado === estado;

      const searchableText = normalizeSearch(
        [
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
          .filter(Boolean)
          .join(' ')
      );

      const matchBusqueda = search === '' || searchableText.includes(search);

      return matchOrigen && matchSeveridad && matchEstado && matchBusqueda;
    });
  }, [inconsistencias, origen, severidad, estado, busqueda]);

  if (loading) {
    return <div className="loading-card">Cargando inconsistencias...</div>;
  }

  return (
    <section className="page page-enter inconsistencias-page">
      {(error || oficialError) && (
        <div className="loading-card">
          {error && <p>{error}</p>}
          {oficialError && <p>{oficialError}</p>}

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
            La tabla principal muestra inconsistencias detalladas. El resumen
            oficial agregado se muestra separado porque el backend oficial no
            entrega detalle por mesa.
          </p>
        </div>
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros de inconsistencias</h3>

            <p>
              Filtrado visual por origen, severidad, estado, código de mesa o
              descripción. Las opciones se generan únicamente con los datos
              detallados recibidos.
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
              options: origenOptions,
              onChange: setOrigen
            },
            {
              id: 'severidad',
              label: 'Severidad',
              value: severidad,
              options: severidadOptions,
              onChange: setSeveridad
            },
            {
              id: 'estado',
              label: 'Estado',
              value: estado,
              options: estadoOptions,
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
            <h3>Resumen oficial agregado</h3>

            <p>
              Información recibida desde el resumen oficial. No se mezcla con la
              tabla principal porque no incluye mesa, municipio, regla ni
              descripción individual.
            </p>
          </div>

          <Database size={22} />
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Origen</th>
                <th>Severidad</th>
                <th>Estado</th>
                <th>Total reportado</th>
              </tr>
            </thead>

            <tbody>
              {resumenOficial.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    No existe resumen oficial agregado disponible.
                  </td>
                </tr>
              ) : (
                resumenOficial.map((item) => (
                  <tr key={item.id}>
                    <td>{item.origen}</td>
                    <td>{item.severidad}</td>
                    <td>{item.estado}</td>
                    <td>{String(item.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla de inconsistencias detalladas</h3>

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