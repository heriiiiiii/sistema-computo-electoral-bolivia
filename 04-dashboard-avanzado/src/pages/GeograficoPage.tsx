import { useEffect, useMemo, useState } from 'react';
import { MapPinned, Route, UsersRound } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import GeographicBarChart from '../components/charts/GeographicBarChart';
import FiltersPanel from '../components/filters/FiltersPanel';
import type {
  FilterOption,
  FuenteDatos,
  GeograficoItem,
  NivelGeografico
} from '../types/dashboard.types';
import { formatNumber, formatPercent, getStatusClass } from '../utils/formatters';

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

export default function GeograficoPage() {
  const [data, setData] = useState<GeograficoItem[]>([]);
  const [fuente, setFuente] = useState<FuenteDatos>('AMBOS');
  const [nivel, setNivel] = useState<NivelGeografico>('DEPARTAMENTO');

  useEffect(() => {
    dashboardApi.getGeografico().then(setData);
  }, []);

  const filtered = useMemo(() => {
    return data.filter((item) => item.nivel === nivel);
  }, [data, nivel]);

  const totalRRV = filtered.reduce((acc, item) => acc + item.votosRRV, 0);
  const totalOficial = filtered.reduce((acc, item) => acc + item.votosOficial, 0);
  const actasProcesadas = filtered.reduce((acc, item) => acc + item.actasProcesadas, 0);
  const participacionPromedio =
    filtered.length === 0
      ? 0
      : filtered.reduce((acc, item) => acc + item.participacion, 0) / filtered.length;

  return (
    <section className="page page-enter">
      <div className="kpi-grid">
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
          title="Actas procesadas"
          value={formatNumber(actasProcesadas)}
          description="Actas acumuladas en la vista territorial"
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

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Filtros territoriales</h3>
            <p>Selecciona fuente y nivel de análisis geográfico.</p>
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
            }
          ]}
        />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Gráfico territorial</h3>
            <p>Resultados por {nivel.toLowerCase()}.</p>
          </div>
        </div>
        <GeographicBarChart data={filtered} fuente={fuente} />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla territorial</h3>
            <p>Resultados por departamento, provincia, municipio o recinto.</p>
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