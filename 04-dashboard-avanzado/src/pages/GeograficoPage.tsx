import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Search, Trophy, X } from 'lucide-react';
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

const NIVEL_OPTIONS_BASE: FilterOption[] = [
  { label: 'DEPARTAMENTO', value: 'DEPARTAMENTO' },
  { label: 'PROVINCIA', value: 'PROVINCIA' },
  { label: 'MUNICIPIO', value: 'MUNICIPIO' },
  { label: 'RECINTO / COLEGIO', value: 'RECINTO' },
  { label: 'MESA', value: 'MESA' }
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

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function getGanadorLabel(item: GeograficoItem, fuente: FuenteDatos): string {
  if (fuente === 'RRV') {
    return item.ganadorRRV || 'Sin dato';
  }

  if (fuente === 'OFICIAL') {
    return item.ganadorOficial || 'Sin dato';
  }

  if (item.ganadorRRV && item.ganadorOficial) {
    if (item.ganadorRRV === item.ganadorOficial) {
      return item.ganadorRRV;
    }

    return `RRV: ${item.ganadorRRV} / Oficial: ${item.ganadorOficial}`;
  }

  return item.ganadorRRV || item.ganadorOficial || 'Sin dato';
}

function getVotosGanadorLabel(item: GeograficoItem, fuente: FuenteDatos): string {
  if (fuente === 'RRV') {
    return item.votosGanadorRRV ? formatNumber(item.votosGanadorRRV) : 'Sin dato';
  }

  if (fuente === 'OFICIAL') {
    return item.votosGanadorOficial
      ? formatNumber(item.votosGanadorOficial)
      : 'Sin dato';
  }

  const rrv = item.votosGanadorRRV
    ? `RRV: ${formatNumber(item.votosGanadorRRV)}`
    : '';

  const oficial = item.votosGanadorOficial
    ? `Oficial: ${formatNumber(item.votosGanadorOficial)}`
    : '';

  return [rrv, oficial].filter(Boolean).join(' / ') || 'Sin dato';
}

function getNombreTerritorio(item: GeograficoItem): string {
  if (item.nivel === 'MESA') {
    return item.codigoMesa ? `Mesa ${item.codigoMesa}` : item.nombre;
  }

  if (item.nivel === 'RECINTO') {
    return item.recinto || item.nombre;
  }

  return item.nombre;
}

export default function GeograficoPage() {
  const [data, setData] = useState<GeograficoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fuente, setFuente] = useState<FuenteDatos>('AMBOS');
  const [nivel, setNivel] = useState<NivelGeografico>('DEPARTAMENTO');
  const [departamento, setDepartamento] = useState('TODOS');
  const [municipio, setMunicipio] = useState('TODOS');
  const [recinto, setRecinto] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');

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
        setError(
          'No se pudo cargar el análisis geográfico. Verifica el endpoint RRV geográfico.'
        );
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

  const nivelOptions = useMemo<FilterOption[]>(() => {
    const nivelesDisponibles = new Set(data.map((item) => item.nivel));

    const options = NIVEL_OPTIONS_BASE.filter((option) =>
      nivelesDisponibles.has(option.value as NivelGeografico)
    );

    return options.length > 0 ? options : NIVEL_OPTIONS_BASE;
  }, [data]);

  useEffect(() => {
    if (data.length === 0) return;

    const nivelExiste = nivelOptions.some((option) => option.value === nivel);

    if (!nivelExiste) {
      setNivel((nivelOptions[0]?.value as NivelGeografico) || 'DEPARTAMENTO');
    }
  }, [data.length, nivel, nivelOptions]);

  const departamentoOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(data.map((item) => item.departamento));
  }, [data]);

  const municipioOptions = useMemo<FilterOption[]>(() => {
    const source =
      departamento === 'TODOS'
        ? data
        : data.filter((item) => item.departamento === departamento);

    return buildFilterOptions(source.map((item) => item.municipio));
  }, [data, departamento]);

  const recintoOptions = useMemo<FilterOption[]>(() => {
    const source = data.filter((item) => {
      const matchDepartamento =
        departamento === 'TODOS' || item.departamento === departamento;

      const matchMunicipio =
        municipio === 'TODOS' || item.municipio === municipio;

      return matchDepartamento && matchMunicipio;
    });

    return buildFilterOptions(source.map((item) => item.recinto));
  }, [data, departamento, municipio]);

  useEffect(() => {
    if (municipio === 'TODOS') return;

    const municipioExiste = municipioOptions.some(
      (option) => option.value === municipio
    );

    if (!municipioExiste) {
      setMunicipio('TODOS');
    }
  }, [municipio, municipioOptions]);

  useEffect(() => {
    if (recinto === 'TODOS') return;

    const recintoExiste = recintoOptions.some((option) => option.value === recinto);

    if (!recintoExiste) {
      setRecinto('TODOS');
    }
  }, [recinto, recintoOptions]);

  const filtered = useMemo(() => {
    const search = normalizeSearch(busqueda);

    return data.filter((item) => {
      const matchNivel = item.nivel === nivel;

      const matchDepartamento =
        departamento === 'TODOS' || item.departamento === departamento;

      const matchMunicipio =
        municipio === 'TODOS' || item.municipio === municipio;

      const matchRecinto =
        recinto === 'TODOS' || item.recinto === recinto;

      const searchableText = normalizeSearch(
        [
          item.nombre,
          item.departamento,
          item.provincia,
          item.municipio,
          item.recinto,
          item.codigoMesa,
          item.ganadorRRV,
          item.ganadorOficial
        ]
          .filter(Boolean)
          .join(' ')
      );

      const matchBusqueda = search === '' || searchableText.includes(search);

      return (
        matchNivel &&
        matchDepartamento &&
        matchMunicipio &&
        matchRecinto &&
        matchBusqueda
      );
    });
  }, [data, nivel, departamento, municipio, recinto, busqueda]);

  const mapData = useMemo(() => {
    return data.filter((item) => item.nivel === 'DEPARTAMENTO');
  }, [data]);

  const territorioExacto = filtered.length === 1 ? filtered[0] : null;

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
          title="Registros geográficos"
          value={formatNumber(filtered.length)}
          description="Registros recibidos desde backend para el filtro actual"
          status="NEUTRO"
          icon={<MapPinned />}
        />

        <KpiCard
          title="Nivel seleccionado"
          value={nivel.replace(/_/g, ' ')}
          description="Nivel territorial disponible desde el backend"
          status="NEUTRO"
          icon={<Search />}
        />

        <KpiCard
          title="Ganador territorial"
          value={
            territorioExacto
              ? getGanadorLabel(territorioExacto, fuente)
              : 'Sin selección única'
          }
          description={
            territorioExacto
              ? `${getNombreTerritorio(territorioExacto)} — votos ganador: ${getVotosGanadorLabel(
                  territorioExacto,
                  fuente
                )}`
              : 'Filtra hasta dejar un solo territorio, recinto o mesa'
          }
          status={territorioExacto ? 'POSITIVO' : 'NEUTRO'}
          icon={<Trophy />}
        />

        <KpiCard
          title="Fuente de datos"
          value={fuente}
          description="Fuente seleccionada para lectura del ganador"
          status="NEUTRO"
          icon={<MapPinned />}
        />
      </div>

      <article className="panel-card bolivia-map-panel">
        <div className="section-header">
          <div>
            <h3>Mapa de Bolivia por departamento</h3>
            <p>
              Pasa el mouse para ver datos recibidos desde backend y haz click
              sobre un departamento para filtrar la tabla.
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
            <h3>Consulta territorial</h3>
            <p>
              Busca por departamento, municipio, colegio/recinto o mesa. El
              ganador se muestra únicamente si el backend lo entrega.
            </p>
          </div>
        </div>

        <label className="geo-search-box">
          <span>Buscar territorio, colegio o mesa</span>
          <input
            type="search"
            value={busqueda}
            placeholder="Ej. Cercado, Colegio Bolívar, Mesa 1010200001003..."
            onChange={(event) => setBusqueda(event.target.value)}
          />
        </label>
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros territoriales</h3>
            <p>
              Selecciona fuente, nivel, departamento, municipio y recinto. Los
              filtros no recalculan resultados electorales.
            </p>
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
              options: nivelOptions,
              onChange: (value) => setNivel(value as NivelGeografico)
            },
            {
              id: 'departamento',
              label: 'Departamento',
              value: departamento,
              options: departamentoOptions,
              onChange: setDepartamento
            },
            {
              id: 'municipio',
              label: 'Municipio',
              value: municipio,
              options: municipioOptions,
              onChange: setMunicipio
            },
            {
              id: 'recinto',
              label: 'Recinto / colegio',
              value: recinto,
              options: recintoOptions,
              onChange: setRecinto
            }
          ]}
        />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Gráfico territorial</h3>
            <p>
              Visualización de votos recibidos por backend para el nivel{' '}
              {nivel.toLowerCase()}
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
              {formatNumber(filtered.length)} registros encontrados. El filtrado
              es solamente visual.
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
                <th>Recinto / Colegio</th>
                <th>Mesa</th>
                <th>Ganador RRV</th>
                <th>Ganador Oficial</th>
                <th>Votos ganador</th>
                <th>Votos RRV</th>
                <th>Votos Oficial</th>
                <th>Actas procesadas</th>
                <th>Participación</th>
                <th>Estado</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={15}>
                    No existen registros para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id}>
                    <td>{item.nivel}</td>
                    <td>{item.nombre}</td>
                    <td>{item.departamento}</td>
                    <td>{item.provincia ?? '—'}</td>
                    <td>{item.municipio ?? '—'}</td>
                    <td>{item.recinto ?? '—'}</td>
                    <td>{item.codigoMesa ?? '—'}</td>
                    <td>{item.ganadorRRV ?? 'Sin dato'}</td>
                    <td>{item.ganadorOficial ?? 'Sin dato'}</td>
                    <td>{getVotosGanadorLabel(item, fuente)}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}