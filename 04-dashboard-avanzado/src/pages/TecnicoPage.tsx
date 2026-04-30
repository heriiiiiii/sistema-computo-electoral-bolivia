import { useEffect, useMemo, useState } from 'react';
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
import '../styles/dashboard-home.css';

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

function calcularDisponibilidadInfraestructura(clusters: ClusterStatus[]): number {
  if (clusters.length === 0) return 0;

  const puntaje = clusters.reduce((acc, cluster) => {
    if (cluster.estado === 'ACTIVO') return acc + 1;
    if (cluster.estado === 'DEGRADADO') return acc + 0.5;
    return acc;
  }, 0);

  return (puntaje / clusters.length) * 100;
}

export default function TecnicoPage() {
  const [metricas, setMetricas] = useState<MetricasTecnicas | null>(null);
  const [clusters, setClusters] = useState<ClusterStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroresCarga, setErroresCarga] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    Promise.allSettled([
      dashboardApi.getMetricasTecnicas(),
      dashboardApi.getEstadoClusters()
    ])
      .then(([metricasResult, clustersResult]) => {
        if (!mounted) return;

        const errores: string[] = [];

        if (metricasResult.status === 'fulfilled') {
          setMetricas(metricasResult.value);
        } else {
          errores.push('No se pudieron cargar las métricas técnicas del backend RRV.');
          setMetricas(METRICAS_FALLBACK);
        }

        if (clustersResult.status === 'fulfilled') {
          setClusters(clustersResult.value);
        } else {
          errores.push('No se pudo cargar el estado de clústeres.');
          setClusters([]);
        }

        setErroresCarga(errores);
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

  const metricasSeguras = metricas ?? METRICAS_FALLBACK;

  const disponibilidadInfraestructura = useMemo(() => {
    return calcularDisponibilidadInfraestructura(clusters);
  }, [clusters]);

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
    <section className="page page-enter">
      {erroresCarga.length > 0 && (
        <div className="loading-card">
          {erroresCarga.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}

      <div className="kpi-grid technical-grid home-summary-grid">
        <KpiCard
          title="Latencia promedio"
          value={`${formatNumber(metricasSeguras.latenciaPromedioMs)} ms`}
          description="Tiempo promedio de respuesta GET"
          status={getStatusByLatency(metricasSeguras.latenciaPromedioMs)}
          icon={<Timer />}
        />

        <KpiCard
          title="Throughput"
          value={`${formatNumber(metricasSeguras.throughputPorMinuto)} / min`}
          description="Lecturas procesadas por minuto"
          status={metricasSeguras.throughputPorMinuto > 0 ? 'POSITIVO' : 'NEUTRO'}
          icon={<Gauge />}
        />

        <KpiCard
          title="Disponibilidad"
          value={formatPercent(disponibilidadInfraestructura)}
          description="Disponibilidad calculada desde el estado de clústeres"
          status={getStatusByAvailability(disponibilidadInfraestructura)}
          icon={<Activity />}
        />

        <KpiCard
          title="Clústeres activos"
          value={`${formatNumber(clustersActivos)} / ${formatNumber(clusters.length)}`}
          description="Nodos reportados como operativos"
          status={clustersActivos === clusters.length ? 'POSITIVO' : 'ALERTA'}
          icon={<ServerCog />}
        />

        <KpiCard
          title="Clústeres degradados"
          value={formatNumber(clustersDegradados)}
          description="Nodos con estado desconocido o funcionamiento parcial"
          status={clustersDegradados > 0 ? 'ALERTA' : 'POSITIVO'}
          icon={<AlertTriangle />}
        />

        <KpiCard
          title="Clústeres caídos"
          value={formatNumber(clustersCaidos)}
          description="Nodos sin disponibilidad reportada"
          status={clustersCaidos > 0 ? 'CRITICO' : 'POSITIVO'}
          icon={<DatabaseZap />}
        />

        <KpiCard
          title="Errores última hora"
          value={formatNumber(metricasSeguras.erroresUltimaHora)}
          description="Errores detectados en consultas"
          status={getStatusByCount(metricasSeguras.erroresUltimaHora, 1, 10)}
          icon={<AlertTriangle />}
        />

        <KpiCard
          title="Reintentos última hora"
          value={formatNumber(metricasSeguras.reintentosUltimaHora)}
          description="Reintentos registrados por el backend"
          status={getStatusByCount(metricasSeguras.reintentosUltimaHora, 1, 10)}
          icon={<RefreshCcw />}
        />

        <KpiCard
          title="SMS inválidos"
          value={formatNumber(metricasSeguras.smsInvalidos)}
          description="Reportes inválidos informados por backend"
          status={getStatusByCount(metricasSeguras.smsInvalidos, 1, 10)}
          icon={<Smartphone />}
        />

        <KpiCard
          title="Números no autorizados"
          value={formatNumber(metricasSeguras.numerosNoAutorizados)}
          description="Intentos desde números no permitidos"
          status={getStatusByCount(metricasSeguras.numerosNoAutorizados, 1, 5)}
          icon={<Ban />}
        />

        <KpiCard
          title="Actas sospechosas"
          value={formatNumber(metricasSeguras.actasSospechosas)}
          description="Actas marcadas para revisión"
          status={getStatusByCount(metricasSeguras.actasSospechosas, 1, 20)}
          icon={<ShieldAlert />}
        />

        <KpiCard
          title="Intentos duplicados"
          value={formatNumber(metricasSeguras.intentosDuplicados)}
          description="Intentos repetidos bloqueados"
          status={getStatusByCount(metricasSeguras.intentosDuplicados, 1, 10)}
          icon={<DatabaseZap />}
        />
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Estado de clústeres</h3>
            <p>
              Visualización del estado técnico de RRV-NoSQL / MongoDB y
              Oficial-Relacional / PostgreSQL. El dashboard no se conecta
              directamente a bases de datos.
            </p>
          </div>

          <ServerCog size={24} />
        </div>

        <ClusterStatusTable data={clusters} />
      </article>
    </section>
  );
}