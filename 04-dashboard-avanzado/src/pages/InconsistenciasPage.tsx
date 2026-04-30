import { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import FiltersPanel from '../components/filters/FiltersPanel';
import InconsistenciasTable from '../components/tables/InconsistenciasTable';
import type { FilterOption, Inconsistencia } from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';

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
  const [data, setData] = useState<Inconsistencia[]>([]);
  const [origen, setOrigen] = useState('TODOS');
  const [severidad, setSeveridad] = useState('TODOS');
  const [estado, setEstado] = useState('TODOS');
  const [mesa, setMesa] = useState('');

  useEffect(() => {
    dashboardApi.getInconsistencias().then(setData);
  }, []);

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchOrigen = origen === 'TODOS' || item.origen === origen;
      const matchSeveridad = severidad === 'TODOS' || item.severidad === severidad;
      const matchEstado = estado === 'TODOS' || item.estado === estado;
      const matchMesa =
        mesa.trim() === '' ||
        item.codigoMesa.toLowerCase().includes(mesa.trim().toLowerCase());

      return matchOrigen && matchSeveridad && matchEstado && matchMesa;
    });
  }, [data, origen, severidad, estado, mesa]);

  const abiertas = data.filter((item) => item.estado === 'ABIERTA').length;
  const criticas = data.filter((item) => item.severidad === 'CRITICA').length;
  const enRevision = data.filter((item) => item.estado === 'EN_REVISION').length;
  const resueltas = data.filter((item) => item.estado === 'RESUELTA').length;

  return (
    <section className="page page-enter">
      <div className="kpi-grid">
        <KpiCard
          title="Abiertas"
          value={formatNumber(abiertas)}
          description="Inconsistencias pendientes de revisión"
          status="ALERTA"
          icon={<AlertTriangle />}
        />
        <KpiCard
          title="Críticas"
          value={formatNumber(criticas)}
          description="Casos con severidad máxima"
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
            <p>
              Visualización por severidad, origen, estado y código de mesa.
            </p>
          </div>
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
            <p>{formatNumber(filtered.length)} registros encontrados.</p>
          </div>
        </div>

        <InconsistenciasTable data={filtered} />
      </article>
    </section>
  );
}