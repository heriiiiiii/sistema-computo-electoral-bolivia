import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileCheck2,
  FileX2,
  Layers3,
  RefreshCw
} from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import ActStatusDonutChart from '../components/charts/ActStatusDonutChart';
import FiltersPanel from '../components/filters/FiltersPanel';
import ActasTable from '../components/tables/ActasTable';
import type {
  ActStatusCount,
  ActaDigitalizada,
  DashboardResumen,
  FilterOption
} from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';
import '../styles/actas.css';

const ALL_OPTION: FilterOption = { label: 'Todos', value: 'TODOS' };

const FUENTE_OPTIONS: FilterOption[] = [
  ALL_OPTION,
  { label: 'RRV', value: 'RRV' },
  { label: 'OFICIAL', value: 'OFICIAL' }
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

export default function ActasPage() {
  const [actas, setActas] = useState<ActaDigitalizada[]>([]);
  const [estadoActas, setEstadoActas] = useState<ActStatusCount[]>([]);
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);

  const [estado, setEstado] = useState('TODOS');
  const [fuente, setFuente] = useState('TODOS');
  const [departamento, setDepartamento] = useState('TODOS');
  const [municipio, setMunicipio] = useState('TODOS');
  const [mesa, setMesa] = useState('');

  const [loading, setLoading] = useState(true);
  const [erroresCarga, setErroresCarga] = useState<string[]>([]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);

    const [actasResult, estadoResult, resumenResult] = await Promise.allSettled([
      dashboardApi.getActasDigitalizadas(),
      dashboardApi.getEstadoActas(),
      dashboardApi.getResumen()
    ]);

    const errores: string[] = [];

    if (actasResult.status === 'fulfilled') {
      setActas(actasResult.value);
    } else {
      console.error('Error cargando actas digitalizadas:', actasResult.reason);
      setActas([]);
      errores.push('No se pudo cargar el listado de actas digitalizadas.');
    }

    if (estadoResult.status === 'fulfilled') {
      setEstadoActas(estadoResult.value);
    } else {
      console.error('Error cargando estado de actas:', estadoResult.reason);
      setEstadoActas([]);
      errores.push('No se pudo cargar el estado de actas.');
    }

    if (resumenResult.status === 'fulfilled') {
      setResumen(resumenResult.value);
    } else {
      console.error('Error cargando resumen de actas:', resumenResult.reason);
      setResumen(null);
      errores.push('No se pudo cargar el resumen RRV/Oficial.');
    }

    setErroresCarga(errores);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const estadoOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(actas.map((acta) => acta.estado));
  }, [actas]);

  const departamentoOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(actas.map((acta) => acta.departamento));
  }, [actas]);

  const municipioOptions = useMemo<FilterOption[]>(() => {
    const source =
      departamento === 'TODOS'
        ? actas
        : actas.filter((acta) => acta.departamento === departamento);

    return buildFilterOptions(source.map((acta) => acta.municipio));
  }, [actas, departamento]);

  useEffect(() => {
    if (estado === 'TODOS') return;

    const estadoExiste = estadoOptions.some(
      (option) => option.value === estado
    );

    if (!estadoExiste) {
      setEstado('TODOS');
    }
  }, [estado, estadoOptions]);

  useEffect(() => {
    if (municipio === 'TODOS') return;

    const municipioExiste = municipioOptions.some(
      (option) => option.value === municipio
    );

    if (!municipioExiste) {
      setMunicipio('TODOS');
    }
  }, [municipio, municipioOptions]);

  const filteredActas = useMemo(() => {
    return actas.filter((acta) => {
      const matchEstado = estado === 'TODOS' || acta.estado === estado;
      const matchFuente = fuente === 'TODOS' || acta.fuente === fuente;

      const matchDepartamento =
        departamento === 'TODOS' || acta.departamento === departamento;

      const matchMunicipio =
        municipio === 'TODOS' || acta.municipio === municipio;

      const matchMesa =
        mesa.trim() === '' ||
        acta.codigoMesa.toLowerCase().includes(mesa.trim().toLowerCase());

      return (
        matchEstado &&
        matchFuente &&
        matchDepartamento &&
        matchMunicipio &&
        matchMesa
      );
    });
  }, [actas, estado, fuente, departamento, municipio, mesa]);

  if (loading) {
    return <div className="loading-card">Cargando seguimiento de actas...</div>;
  }

  return (
    <section className="page page-enter actas-page">
      {erroresCarga.length > 0 && (
        <div className="loading-card">
          {erroresCarga.map((error) => (
            <p key={error}>{error}</p>
          ))}

          <button
            type="button"
            className="button primary"
            onClick={cargarDatos}
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      )}

      <div className="kpi-grid actas-kpi-grid">
        <KpiCard
          title="Actas RRV recibidas"
          value={formatNumber(resumen?.rrv.actasRecibidas ?? 0)}
          description="Total reportado por backend RRV"
          status="NEUTRO"
          icon={<Layers3 />}
        />

        <KpiCard
          title="Actas RRV validadas"
          value={formatNumber(resumen?.rrv.actasValidadas ?? 0)}
          description="Actas habilitadas por validación RRV"
          status="POSITIVO"
          icon={<CheckCircle2 />}
        />

        <KpiCard
          title="Actas RRV con alerta"
          value={formatNumber(resumen?.rrv.actasSospechosas ?? 0)}
          description="Sospechosas, duplicadas o en revisión según backend"
          status="ALERTA"
          icon={<AlertTriangle />}
        />

        <KpiCard
          title="Actas RRV rechazadas"
          value={formatNumber(resumen?.rrv.actasRechazadas ?? 0)}
          description="Rechazos determinados por backend RRV"
          status="ALERTA"
          icon={<FileX2 />}
        />

        <KpiCard
          title="Actas oficiales importadas"
          value={formatNumber(resumen?.oficial.actasImportadas ?? 0)}
          description="Total reportado por API oficial"
          status="NEUTRO"
          icon={<Database />}
        />

        <KpiCard
          title="Actas oficiales validadas"
          value={formatNumber(resumen?.oficial.actasValidadas ?? 0)}
          description="Actas computables según backend oficial"
          status="POSITIVO"
          icon={<FileCheck2 />}
        />

        <KpiCard
          title="Actas oficiales observadas"
          value={formatNumber(resumen?.oficial.actasObservadas ?? 0)}
          description="Observaciones determinadas por backend oficial"
          status="ALERTA"
          icon={<AlertTriangle />}
        />

        <KpiCard
          title="Actas oficiales rechazadas"
          value={formatNumber(resumen?.oficial.actasRechazadas ?? 0)}
          description="Rechazos determinados por backend oficial"
          status="ALERTA"
          icon={<FileX2 />}
        />
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros de actas</h3>
            <p>
              Filtra la información recibida desde los backends por estado,
              fuente, departamento, municipio y mesa.
            </p>
          </div>
        </div>

        <FiltersPanel
          filters={[
            {
              id: 'estado',
              label: 'Estado',
              value: estado,
              options: estadoOptions,
              onChange: setEstado
            },
            {
              id: 'fuente',
              label: 'Fuente',
              value: fuente,
              options: FUENTE_OPTIONS,
              onChange: setFuente
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
            }
          ]}
        />

        <label className="search-field">
          <span>Código de mesa</span>
          <input
            type="search"
            value={mesa}
            placeholder="Ej. 1010200001003"
            onChange={(event) => setMesa(event.target.value)}
          />
        </label>
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Estados de actas</h3>
            <p>
              Distribución por fuente y estado. Los conteos provienen de los
              endpoints RRV y Oficial.
            </p>
          </div>
        </div>

        <ActStatusDonutChart data={estadoActas} />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla de actas</h3>
            <p>
              {formatNumber(filteredActas.length)} actas coinciden con los filtros
              aplicados. El filtrado es solo visual.
            </p>
          </div>
        </div>

        <ActasTable data={filteredActas} />
      </article>
    </section>
  );
}