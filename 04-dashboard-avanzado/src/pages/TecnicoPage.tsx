import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  DatabaseZap,
  Gauge,
  RefreshCcw,
  ServerCog,
  ShieldAlert,
  Smartphone,
  Timer
} from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import ClusterStatusTable from '../components/tables/ClusterStatusTable';
import type { ClusterStatus, MetricasTecnicas } from '../types/dashboard.types';
import { formatNumber, formatPercent } from '../utils/formatters';
import '../styles/tecnico.css';

const METRICAS_FALLBACK: MetricasTecnicas = {
  latenciaPromedioMs: 0,
  throughputPorMinuto: 0,
  disponibilidadPorcentual: 0,
  erroresUltimaHora: 0,
  reintentosUltimaHora: 0,
  smsInvalidos: 0,
  numerosNoAutorizados: 0,
  actasSospechosas: 0,
  intentosDuplicados: 0
};

function getStatusByLatency(value: number) {
  if (value === 0) return 'NEUTRO';
  if (value >= 800) return 'CRITICO';
  if (value >= 300) return 'ALERTA';

  return 'POSITIVO';
}

function getStatusByAvailability(value: number) {
  if (value >= 95) return 'POSITIVO';
  if (value >= 70) return 'ALERTA';

  return 'CRITICO';
}

function getStatusByCount(value: number, warningLimit = 1, criticalLimit = 10) {
  if (value >= criticalLimit) return 'CRITICO';
  if (value >= warningLimit) return 'ALERTA';

  return 'POSITIVO';
}

export default function TecnicoPage() {
  const [metricas, setMetricas] = useState<MetricasTecnicas | null>(null);
  const [clusters, setClusters] = useState<ClusterStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroresCarga, setErroresCarga] = useState<string[]>([]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);

    const [metricasResult, clustersResult] = await Promise.allSettled([
      dashboardApi.getMetricasTecnicas(),
      dashboardApi.getEstadoClusters()
    ]);

    const errores: string[] = [];

    if (metricasResult.status === 'fulfilled') {
      setMetricas(metricasResult.value);
    } else {
      console.error('Error cargando métricas técnicas:', metricasResult.reason);
      setMetricas(METRICAS_FALLBACK);
      errores.push('No se pudieron cargar las métricas técnicas del backend RRV.');
    }

    if (clustersResult.status === 'fulfilled') {
      setClusters(clustersResult.value);
    } else {
      console.error('Error cargando estado de clústeres:', clustersResult.reason);
      setClusters([]);
      errores.push('No se pudo cargar el estado de clústeres.');
    }

    setErroresCarga(errores);
    setLoading(false);
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const metricasSeguras = metricas ?? METRICAS_FALLBACK;

  const clustersActivos = useMemo(() => {
    return clusters.filter((cluster) => cluster.estado === 'ACTIVO').length;
  }, [clusters]);

  const clustersDegradados = useMemo(() => {
    return clusters.filter((cluster) => cluster.estado === 'DEGRADADO').length;
  }, [clusters]);

  const clustersCaidos = useMemo(() => {
    return clusters.filter((cluster) => cluster.estado === 'CAIDO').length;
  }, [clusters]);

  if (loading) {
    return <div className="loading-card">Cargando monitoreo técnico...</div>;
  }

  return (
    <section className="page page-enter tecnicos-page">
      {erroresCarga.length > 0 && (
        <div className="loading-card">
          {erroresCarga.map((error) => (
            <p key={error}>{error}</p>
          ))}

          <button type="button" className="button primary" onClick={cargarDatos}>
            <RefreshCcw size={16} />
            Reintentar
          </button>
        </div>
      )}

      <div className="kpi-grid tecnicos-kpi-grid">
        <KpiCard
          title="Latencia promedio"
          value={`${formatNumber(metricasSeguras.latenciaPromedioMs)} ms`}
          description="Valor reportado por el backend RRV"
          status={getStatusByLatency(metricasSeguras.latenciaPromedioMs)}
          icon={<Timer />}
        />

        <KpiCard
          title="Throughput"
          value={`${formatNumber(metricasSeguras.throughputPorMinuto)} / min`}
          description="Lecturas por minuto reportadas por backend RRV"
          status={metricasSeguras.throughputPorMinuto > 0 ? 'POSITIVO' : 'NEUTRO'}
          icon={<Gauge />}
        />

        

        <KpiCard
          title="Clústeres activos"
          value={`${formatNumber(clustersActivos)} / ${formatNumber(clusters.length)}`}
          description="Nodos reportados como ACTIVO por las APIs"
          status={clusters.length > 0 && clustersActivos === clusters.length ? 'POSITIVO' : 'ALERTA'}
          icon={<ServerCog />}
        />
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Estado técnico de clústeres</h3>
            <p>
              Estado reportado por las APIs RRV y Oficial. El dashboard no
              realiza health check directo contra MongoDB ni PostgreSQL.
            </p>
          </div>
        </div>

        <ClusterStatusTable data={clusters} />
      </article>
    </section>
  );
}