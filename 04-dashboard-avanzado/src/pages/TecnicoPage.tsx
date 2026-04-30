import { useEffect, useState } from 'react';
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

export default function TecnicoPage() {
  const [metricas, setMetricas] = useState<MetricasTecnicas | null>(null);
  const [clusters, setClusters] = useState<ClusterStatus[]>([]);

  useEffect(() => {
    Promise.all([dashboardApi.getMetricasTecnicas(), dashboardApi.getEstadoClusters()]).then(
      ([metricasData, clustersData]) => {
        setMetricas(metricasData);
        setClusters(clustersData);
      }
    );
  }, []);

  if (!metricas) {
    return <div className="loading-card">Cargando monitoreo técnico...</div>;
  }

  return (
    <section className="page page-enter">
      <div className="kpi-grid technical-grid">
        <KpiCard
          title="Latencia promedio"
          value={`${metricas.latenciaPromedioMs} ms`}
          description="Tiempo promedio de respuesta GET"
          status="POSITIVO"
          icon={<Timer />}
        />
        <KpiCard
          title="Throughput"
          value={`${formatNumber(metricas.throughputPorMinuto)} / min`}
          description="Lecturas procesadas por minuto"
          status="POSITIVO"
          icon={<Gauge />}
        />
        <KpiCard
          title="Disponibilidad"
          value={formatPercent(metricas.disponibilidadPorcentual)}
          description="Disponibilidad de servicios de lectura"
          status="POSITIVO"
          icon={<Activity />}
        />
        <KpiCard
          title="Errores última hora"
          value={formatNumber(metricas.erroresUltimaHora)}
          description="Errores detectados en consultas"
          status={metricas.erroresUltimaHora > 10 ? 'CRITICO' : 'ALERTA'}
          icon={<AlertTriangle />}
        />
        <KpiCard
          title="Reintentos última hora"
          value={formatNumber(metricas.reintentosUltimaHora)}
          description="Reintentos registrados por el backend"
          status="ALERTA"
          icon={<RefreshCcw />}
        />
        <KpiCard
          title="SMS inválidos"
          value={formatNumber(metricas.smsInvalidos)}
          description="Reportes inválidos informados por backend"
          status="ALERTA"
          icon={<Smartphone />}
        />
        <KpiCard
          title="Números no autorizados"
          value={formatNumber(metricas.numerosNoAutorizados)}
          description="Intentos desde números no permitidos"
          status="CRITICO"
          icon={<Ban />}
        />
        <KpiCard
          title="Actas sospechosas"
          value={formatNumber(metricas.actasSospechosas)}
          description="Actas marcadas para revisión"
          status="ALERTA"
          icon={<ShieldAlert />}
        />
        <KpiCard
          title="Intentos duplicados"
          value={formatNumber(metricas.intentosDuplicados)}
          description="Intentos repetidos bloqueados"
          status="NEUTRO"
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