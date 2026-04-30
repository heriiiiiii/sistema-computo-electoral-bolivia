import { useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileClock, FileX2, Layers3 } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import ActStatusDonutChart from '../components/charts/ActStatusDonutChart';
import ActasPorHoraChart from '../components/charts/ActasPorHoraChart';
import FiltersPanel from '../components/filters/FiltersPanel';
import ActasTable from '../components/tables/ActasTable';
import type {
  ActStatusCount,
  ActaDigitalizada,
  FilterOption
} from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';
import '../styles/actas.css';

const ALL_OPTION: FilterOption = { label: 'Todos', value: 'TODOS' };

const ESTADO_OPTIONS: FilterOption[] = [
  ALL_OPTION,
  { label: 'RECIBIDA', value: 'RECIBIDA' },
  { label: 'PROCESANDO', value: 'PROCESANDO' },
  { label: 'VALIDADA', value: 'VALIDADA' },
  { label: 'SOSPECHOSA', value: 'SOSPECHOSA' },
  { label: 'RECHAZADA', value: 'RECHAZADA' },
  { label: 'PUBLICADA', value: 'PUBLICADA' },
  { label: 'PENDIENTE_REVISION', value: 'PENDIENTE_REVISION' },
  { label: 'IMPORTADA', value: 'IMPORTADA' },
  { label: 'VALIDANDO', value: 'VALIDANDO' },
  { label: 'OBSERVADA', value: 'OBSERVADA' },
  { label: 'OFICIALIZADA', value: 'OFICIALIZADA' }
];

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

function getHourLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  const hour = date.getHours().toString().padStart(2, '0');

  return `${hour}:00`;
}

export default function ActasPage() {
  const [actas, setActas] = useState<ActaDigitalizada[]>([]);
  const [estadoActas, setEstadoActas] = useState<ActStatusCount[]>([]);

  const [estado, setEstado] = useState('TODOS');
  const [fuente, setFuente] = useState('TODOS');
  const [departamento, setDepartamento] = useState('TODOS');
  const [municipio, setMunicipio] = useState('TODOS');
  const [mesa, setMesa] = useState('');

  useEffect(() => {
    Promise.all([
      dashboardApi.getActasDigitalizadas(),
      dashboardApi.getEstadoActas()
    ]).then(([actasData, estadoData]) => {
      setActas(actasData);
      setEstadoActas(estadoData);
    });
  }, []);

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
    if (municipio === 'TODOS') return;

    const municipioExiste = municipioOptions.some((option) => option.value === municipio);

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

  const actasPorHora = useMemo(() => {
    const buckets = new Map<
      string,
      {
        hora: string;
        recibidas: number;
        procesadas: number;
        validadas: number;
      }
    >();

    for (const acta of filteredActas) {
      const hora = getHourLabel(acta.fecha);

      if (!buckets.has(hora)) {
        buckets.set(hora, {
          hora,
          recibidas: 0,
          procesadas: 0,
          validadas: 0
        });
      }

      const bucket = buckets.get(hora)!;

      bucket.recibidas += 1;

      if (
        [
          'PROCESANDO',
          'VALIDADA',
          'SOSPECHOSA',
          'RECHAZADA',
          'OBSERVADA',
          'OFICIALIZADA',
          'IMPORTADA',
          'VALIDANDO',
          'PUBLICADA'
        ].includes(acta.estado)
      ) {
        bucket.procesadas += 1;
      }

      if (['VALIDADA', 'OFICIALIZADA'].includes(acta.estado)) {
        bucket.validadas += 1;
      }
    }

    const ordenadas = Array.from(buckets.values()).sort((a, b) =>
      a.hora.localeCompare(b.hora)
    );

    let acumuladoRecibidas = 0;
    let acumuladoProcesadas = 0;
    let acumuladoValidadas = 0;

    return ordenadas.map((item) => {
      acumuladoRecibidas += item.recibidas;
      acumuladoProcesadas += item.procesadas;
      acumuladoValidadas += item.validadas;

      return {
        hora: item.hora,
        recibidas: acumuladoRecibidas,
        procesadas: acumuladoProcesadas,
        validadas: acumuladoValidadas
      };
    });
  }, [filteredActas]);

  const totalRRV = actas.filter((acta) => acta.fuente === 'RRV').length;
  const totalOficial = actas.filter((acta) => acta.fuente === 'OFICIAL').length;

  const totalValidadas = actas.filter((acta) =>
    ['VALIDADA', 'OFICIALIZADA'].includes(acta.estado)
  ).length;

  const totalAlertas = actas.filter((acta) =>
    ['SOSPECHOSA', 'OBSERVADA', 'PENDIENTE_REVISION', 'RECHAZADA'].includes(
      acta.estado
    )
  ).length;

  return (
    <section className="page page-enter actas-page">
      <div className="kpi-grid actas-kpi-grid">        <KpiCard
          title="Actas RRV"
          value={formatNumber(totalRRV)}
          description="Actas digitalizadas provenientes de RRV"
          status="POSITIVO"
          icon={<Layers3 />}
        />

        <KpiCard
          title="Actas oficiales"
          value={formatNumber(totalOficial)}
          description="Actas importadas desde fuente oficial"
          status="NEUTRO"
          icon={<FileCheck2 />}
        />

        <KpiCard
          title="Validadas"
          value={formatNumber(totalValidadas)}
          description="Actas verificadas por el backend"
          status="POSITIVO"
          icon={<FileCheck2 />}
        />

        <KpiCard
          title="Alertas"
          value={formatNumber(totalAlertas)}
          description="Sospechosas, observadas, rechazadas o pendientes"
          status="ALERTA"
          icon={<FileX2 />}
        />
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros de actas</h3>
            <p>Filtra por estado, fuente, departamento, municipio y mesa.</p>
          </div>
        </div>

        <FiltersPanel
          filters={[
            {
              id: 'estado',
              label: 'Estado',
              value: estado,
              options: ESTADO_OPTIONS,
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
            placeholder="Ej. LP-001245"
            onChange={(event) => setMesa(event.target.value)}
          />
        </label>
      </article>

      <div className="dashboard-grid">
        <article className="panel-card">
          <div className="section-header">
            <div>
              <h3>Estados de actas</h3>
              <p>RRV y Oficial por estado operativo.</p>
            </div>
          </div>

          <ActStatusDonutChart data={estadoActas} />
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <h3>Flujo de actas por hora</h3>
              <p>Recepción, procesamiento y validación acumulada.</p>
            </div>

            <FileClock size={22} />
          </div>

          <ActasPorHoraChart data={actasPorHora} />
        </article>
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla de actas</h3>
            <p>{formatNumber(filteredActas.length)} actas coinciden con los filtros.</p>
          </div>
        </div>

        <ActasTable data={filteredActas} />
      </article>
    </section>
  );
}