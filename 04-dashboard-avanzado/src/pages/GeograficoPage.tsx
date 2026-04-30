import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Route, UsersRound, X } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import BoliviaMap from '../components/maps/BoliviaMap';
import GeographicBarChart from '../components/charts/GeographicBarChart';
import FiltersPanel from '../components/filters/FiltersPanel';
import type {
  FilterOption,
  FuenteDatos,
  GeograficoItem,
  NivelGeografico
} from '../types/dashboard.types';
import { formatNumber, formatPercent, getStatusClass } from '../utils/formatters';
import '../styles/geografico.css';

const ALL_OPTION: FilterOption = { label: 'Todos', value: 'TODOS' };

const FUENTE_OPTIONS: FilterOption[] = [
  { label: 'AMBOS', value: 'AMBOS' },
  { label: 'RRV', value: 'RRV' },
  { label: 'OFICIAL', value: 'OFICIAL' }
];

const NIVEL_OPTIONS: FilterOption[] = [
  { label: 'DEPARTAMENTO', value: 'DEPARTAMENTO' },
  { label: 'PROVINCIA', value: 'PROVINCIA' },
  { label: 'MUNICIPIO', value: 'MUNICIPIO' },
  { label: 'RECINTO', value: 'RECINTO' }
];

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

function getFilteredVotes(item: GeograficoItem, fuente: FuenteDatos): number {
  if (fuente === 'RRV') return item.votosRRV;
  if (fuente === 'OFICIAL') return item.votosOficial;

  return item.votosRRV + item.votosOficial;
}

export default function GeograficoPage() {
  const [data, setData] = useState<GeograficoItem[]>([]);
  const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);
  const [fuente, setFuente] = useState<FuenteDatos>('AMBOS');
  const [nivel, setNivel] = useState<NivelGeografico>('DEPARTAMENTO');
  const [departamento, setDepartamento] = useState('TODOS');

  useEffect(() => {
  let mounted = true;

  dashboardApi
    .getGeografico()
    .then((response) => {
      if (!mounted) return;
      setData(response);
      setError(null);
    })
    .catch((err) => {
      console.error('Error cargando datos geográficos:', err);
      if (!mounted) return;
      setError('No se pudo cargar el análisis geográfico. Verifica el endpoint RRV geográfico.');
    })
    .finally(() => {
      if (mounted) {
        setLoading(false);
      }
    });

  return () => {
    mounted = false;
  };
}, []);

  const departamentoOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(data.map((item) => item.departamento));
  }, [data]);

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchNivel = item.nivel === nivel;

      const matchDepartamento =
        departamento === 'TODOS' || item.departamento === departamento;

      return matchNivel && matchDepartamento;
    });
  }, [data, nivel, departamento]);

  const mapData = useMemo(() => {
    return data.filter((item) => item.nivel === 'DEPARTAMENTO');
  }, [data]);

  const totalRRV = filtered.reduce((acc, item) => acc + item.votosRRV, 0);
  const totalOficial = filtered.reduce((acc, item) => acc + item.votosOficial, 0);
  const totalFuente = filtered.reduce(
    (acc, item) => acc + getFilteredVotes(item, fuente),
    0
  );

  const actasProcesadas = filtered.reduce(
    (acc, item) => acc + item.actasProcesadas,
    0
  );

  const participacionPromedio =
    filtered.length === 0
      ? 0
      : filtered.reduce((acc, item) => acc + item.participacion, 0) /
        filtered.length;

  function handleDepartmentSelect(selected: string) {
    setDepartamento((current) => (current === selected ? 'TODOS' : selected));
  }
  
if (loading) {
  return <div className="loading-card">Cargando análisis geográfico...</div>;
}

if (error) {
  return (
    <section className="page page-enter geographic-page">
      <div className="loading-card">{error}</div>
    </section>
  );
}

  return (
    <section className="page page-enter geographic-page">
      {data.length === 0 && (
  <div className="loading-card">
    No existen datos geográficos disponibles. El dashboard no está usando mocks.
  </div>
)}
      <div className="kpi-grid geographic-kpi-grid">
        <KpiCard
          title="Votos RRV"
          value={formatNumber(totalRRV)}
          description={`Total territorial para nivel ${nivel}`}
          status="POSITIVO"
          icon={<UsersRound />}
        />

        <KpiCard
          title="Votos Oficial"
          value={formatNumber(totalOficial)}
          description="Total territorial oficial"
          status="POSITIVO"
          icon={<MapPinned />}
        />

        <KpiCard
          title={`Total ${fuente}`}
          value={formatNumber(totalFuente)}
          description="Total según fuente seleccionada"
          status="NEUTRO"
          icon={<Route />}
        />

        <KpiCard
          title="Participación promedio"
          value={formatPercent(participacionPromedio)}
          description="Promedio de participación del nivel seleccionado"
          status="POSITIVO"
          icon={<UsersRound />}
        />
      </div>

      <article className="panel-card bolivia-map-panel">
        <div className="section-header">
          <div>
            <h3>Mapa de Bolivia por departamento</h3>
            <p>
              Pasa el mouse para ver datos y haz click sobre un departamento para
              filtrar el gráfico y la tabla.
            </p>
          </div>

          {departamento !== 'TODOS' && (
            <button
              type="button"
              className="geo-clear-selection"
              onClick={() => setDepartamento('TODOS')}
            >
              <X size={16} />
              Limpiar: {departamento}
            </button>
          )}
        </div>

        <BoliviaMap
          data={mapData}
          selectedDepartamento={departamento}
          onDepartmentSelect={handleDepartmentSelect}
        />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros territoriales</h3>
            <p>Selecciona fuente, nivel y departamento de análisis geográfico.</p>
          </div>
        </div>

        <FiltersPanel
          filters={[
            {
              id: 'fuente',
              label: 'Fuente',
              value: fuente,
              options: FUENTE_OPTIONS,
              onChange: (value) => setFuente(value as FuenteDatos)
            },
            {
              id: 'nivel',
              label: 'Nivel',
              value: nivel,
              options: NIVEL_OPTIONS,
              onChange: (value) => setNivel(value as NivelGeografico)
            },
            {
              id: 'departamento',
              label: 'Departamento',
              value: departamento,
              options: departamentoOptions,
              onChange: setDepartamento
            }
          ]}
        />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Gráfico territorial</h3>
            <p>
              Resultados por {nivel.toLowerCase()}
              {departamento !== 'TODOS' ? ` en ${departamento}` : ''}.
            </p>
          </div>
        </div>

        <GeographicBarChart data={filtered} fuente={fuente} />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla territorial</h3>
            <p>
              {formatNumber(filtered.length)} registros encontrados
              {departamento !== 'TODOS' ? ` para ${departamento}` : ''}.
            </p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nivel</th>
                <th>Nombre</th>
                <th>Departamento</th>
                <th>Provincia</th>
                <th>Municipio</th>
                <th>Votos RRV</th>
                <th>Votos Oficial</th>
                <th>Actas procesadas</th>
                <th>Participación</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>{item.nivel}</td>
                  <td>{item.nombre}</td>
                  <td>{item.departamento}</td>
                  <td>{item.provincia ?? '—'}</td>
                  <td>{item.municipio ?? '—'}</td>
                  <td>{formatNumber(item.votosRRV)}</td>
                  <td>{formatNumber(item.votosOficial)}</td>
                  <td>{formatNumber(item.actasProcesadas)}</td>
                  <td>{formatPercent(item.participacion)}</td>
                  <td>
                    <span className={getStatusClass(item.estadoComparacion)}>
                      {item.estadoComparacion}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}