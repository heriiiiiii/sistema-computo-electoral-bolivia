import { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import FiltersPanel from '../components/filters/FiltersPanel';
import InconsistenciasTable from '../components/tables/InconsistenciasTable';
import type { FilterOption, Inconsistencia } from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';
import '../styles/inconsistencias.css';

const ALL_OPTION: FilterOption = { label: 'Todos', value: 'TODOS' };

function normalizeSeverity(value: string | null | undefined): Inconsistencia['severidad'] {
  const raw = String(value || '').toUpperCase();

  if (raw === 'CRITICAL') return 'CRITICA';
  if (raw === 'ERROR') return 'ALTA';
  if (raw === 'WARNING') return 'MEDIA';
  if (raw === 'INFO') return 'BAJA';

  if (raw === 'CRITICA') return 'CRITICA';
  if (raw === 'ALTA') return 'ALTA';
  if (raw === 'MEDIA') return 'MEDIA';
  if (raw === 'BAJA') return 'BAJA';

  return 'MEDIA';
}

function normalizeEstado(value: string | null | undefined): Inconsistencia['estado'] {
  const raw = String(value || '').toUpperCase();

  if (raw === 'RESUELTO') return 'RESUELTA';
  if (raw === 'CERRADA') return 'RESUELTA';
  if (raw === 'ABIERTA') return 'ABIERTA';
  if (raw === 'EN_REVISION') return 'EN_REVISION';
  if (raw === 'DESCARTADA') return 'DESCARTADA';
  if (raw === 'RESUELTA') return 'RESUELTA';

  return 'ABIERTA';
}

function getInconsistenciaPeso(item: Inconsistencia): number {
  const extended = item as Inconsistencia & {
    cantidad?: number | string;
    total?: number | string;
    count?: number | string;
  };

  const directValue = extended.cantidad ?? extended.total ?? extended.count;

  if (directValue !== undefined && directValue !== null) {
    const parsed = Number(directValue);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const descripcion = item.descripcion || '';
  const match = descripcion.match(/(\d+)\s+inconsistencia/i);

  if (match?.[1]) {
    const parsed = Number(match[1]);

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return 1;
}

function buildFilterOptions(values: string[]): FilterOption[] {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value !== '' && value !== '-')
    )
  ).sort((a, b) => a.localeCompare(b));

  return [
    ALL_OPTION,
    ...uniqueValues.map((value) => ({
      label: value,
      value
    }))
  ];
}

export default function InconsistenciasPage() {
  const [data, setData] = useState<Inconsistencia[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [origen, setOrigen] = useState('TODOS');
  const [severidad, setSeveridad] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [mesa, setMesa] = useState('');

  useEffect(() => {
    dashboardApi
      .getInconsistencias()
      .then((response) => {
        setData(response);
        setError(null);
      })
      .catch((err) => {
        console.error('Error cargando inconsistencias:', err);
        setError('No se pudo cargar la información de inconsistencias.');
      });
  }, []);

  const normalizedData = useMemo<Inconsistencia[]>(() => {
    return data.map((item) => {
      const descripcion = item.descripcion || '';

      let severity = normalizeSeverity(item.severidad);

      if (descripcion.toUpperCase().includes('CRITICA')) {
        severity = 'CRITICA';
      } else if (descripcion.toUpperCase().includes('ALTA')) {
        severity = 'ALTA';
      }

      return {
        ...item,
        severidad: severity,
        estado: normalizeEstado(item.estado),
        origen: item.origen || 'SISTEMA',
        codigoMesa: item.codigoMesa || '-',
        departamento: item.departamento || '-',
        municipio: item.municipio || '-'
      };
    });
  }, [data]);

  const origenOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(normalizedData.map((item) => item.origen));
  }, [normalizedData]);

  const severidadOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(normalizedData.map((item) => item.severidad));
  }, [normalizedData]);

  const estadoOptions = useMemo<FilterOption[]>(() => {
    return buildFilterOptions(normalizedData.map((item) => item.estado));
  }, [normalizedData]);

  const filtered = useMemo(() => {
    return normalizedData.filter((item) => {
      const matchOrigen = origen === 'TODOS' || item.origen === origen;
      const matchSeveridad = severidad === 'TODOS' || item.severidad === severidad;
      const matchEstado = estado === 'TODOS' || item.estado === estado;

      const matchMesa =
        mesa.trim() === '' ||
        item.codigoMesa.toLowerCase().includes(mesa.trim().toLowerCase());

      return matchOrigen && matchSeveridad && matchEstado && matchMesa;
    });
  }, [normalizedData, origen, severidad, estado, mesa]);

  const totalFiltrado = useMemo(() => {
    return filtered.reduce((acc, item) => acc + getInconsistenciaPeso(item), 0);
  }, [filtered]);

  const abiertas = useMemo(() => {
    return normalizedData
      .filter((item) => item.estado === 'ABIERTA')
      .reduce((acc, item) => acc + getInconsistenciaPeso(item), 0);
  }, [normalizedData]);

  const criticas = useMemo(() => {
    return normalizedData
      .filter((item) => item.severidad === 'CRITICA' || item.severidad === 'ALTA')
      .reduce((acc, item) => acc + getInconsistenciaPeso(item), 0);
  }, [normalizedData]);

  const enRevision = useMemo(() => {
    return normalizedData
      .filter((item) => item.estado === 'EN_REVISION')
      .reduce((acc, item) => acc + getInconsistenciaPeso(item), 0);
  }, [normalizedData]);

  const resueltas = useMemo(() => {
    return normalizedData
      .filter((item) => item.estado === 'RESUELTA')
      .reduce((acc, item) => acc + getInconsistenciaPeso(item), 0);
  }, [normalizedData]);

  if (error) {
    return (
      <section className="page page-enter">
        <div className="loading-card">{error}</div>
      </section>
    );
  }

  return (
<section className="page page-enter inconsistencias-page">      
  <div className="kpi-grid inconsistencias-kpi-grid">
        <KpiCard
          title="Abiertas"
          value={formatNumber(abiertas)}
          description="Inconsistencias pendientes de revisión"
          status="ALERTA"
          icon={<AlertTriangle />}
        />

        <KpiCard
          title="Altas / críticas"
          value={formatNumber(criticas)}
          description="Casos con severidad alta o crítica"
          status="CRITICO"
          icon={<AlertOctagon />}
        />

        <KpiCard
          title="En revisión"
          value={formatNumber(enRevision)}
          description="Casos bajo seguimiento operativo"
          status="ALERTA"
          icon={<Search />}
        />

        <KpiCard
          title="Resueltas"
          value={formatNumber(resueltas)}
          description="Casos cerrados por el backend"
          status="POSITIVO"
          icon={<CheckCircle2 />}
        />
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros de inconsistencias</h3>
            <p>Visualización por severidad, origen, estado y código de mesa.</p>
          </div>
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
          <span>Código de mesa</span>
          <input
            type="search"
            value={mesa}
            placeholder="Ej. CB-002184"
            onChange={(event) => setMesa(event.target.value)}
          />
        </label>
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla de inconsistencias</h3>
            <p>
              {formatNumber(totalFiltrado)} inconsistencia(s) encontradas en{' '}
              {formatNumber(filtered.length)} fila(s) de resumen.
            </p>
          </div>
        </div>

        <InconsistenciasTable data={filtered} />
      </article>
    </section>
  );
}