import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FileStack,
  RadioTower,
  ShieldAlert,
  Vote,
  XCircle
} from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import SummaryCard from '../components/cards/SummaryCard';
import ActStatusDonutChart from '../components/charts/ActStatusDonutChart';
import VoteTypeChart from '../components/charts/VoteTypeChart';
import InconsistenciasTable from '../components/tables/InconsistenciasTable';
import ClusterStatusTable from '../components/tables/ClusterStatusTable';
import type {
  ActStatusCount,
  CandidateResult,
  ClusterStatus,
  DashboardResumen,
  Inconsistencia,
  VoteTypeResult
} from '../types/dashboard.types';
import { formatNumber } from '../utils/formatters';
import {
  calcularConfiabilidadRRV,
  calcularMargenVictoria
} from '../utils/calculations';
import '../styles/dashboard-home.css';

export default function DashboardHome() {
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [candidatos, setCandidatos] = useState<CandidateResult[]>([]);
  const [estadoActas, setEstadoActas] = useState<ActStatusCount[]>([]);
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[]>([]);
  const [clusters, setClusters] = useState<ClusterStatus[]>([]);

  useEffect(() => {
  const cargarDatos = () => {
    Promise.all([
      dashboardApi.getResumen(),
      dashboardApi.getResultadosCandidatos(),
      dashboardApi.getEstadoActas(),
      dashboardApi.getInconsistencias(),
      dashboardApi.getEstadoClusters()
    ]).then(([resumenData, candidatosData, estadoData, inconsistenciasData, clustersData]) => {
      setResumen(resumenData);
      setCandidatos(candidatosData);
      setEstadoActas(estadoData);
      setInconsistencias(inconsistenciasData);
      setClusters(clustersData);
    });
  };

  cargarDatos();

  const interval = window.setInterval(() => {
    cargarDatos();
  }, 10_000);

  return () => window.clearInterval(interval);
}, []);

  if (!resumen) {
    return <div className="loading-card">Cargando dashboard nacional...</div>;
  }

  const confiabilidad = calcularConfiabilidadRRV({
    actasValidadas: resumen.rrv.actasValidadas,
    actasProcesadas: resumen.rrv.actasProcesadas,
    actasSospechosas: resumen.rrv.actasSospechosas,
    actasRechazadas: resumen.rrv.actasRechazadas
  });

  const margen = calcularMargenVictoria(
    candidatos.map((candidato) => ({
      nombre: candidato.candidato,
      votos: candidato.votosRRV
    }))
  );
    const voteTypes: VoteTypeResult[] = [
  {
    tipo: 'VALIDOS',
    rrv: resumen.votos.rrv.votosValidos,
    oficial: resumen.votos.oficial.votosValidos
  },
  {
    tipo: 'BLANCOS',
    rrv: resumen.votos.rrv.votosBlancos,
    oficial: resumen.votos.oficial.votosBlancos
  },
  {
    tipo: 'NULOS',
    rrv: resumen.votos.rrv.votosNulos,
    oficial: resumen.votos.oficial.votosNulos
  }
];

  return (
    <section className="page page-enter dashboard-home-page">
      <div className="hero-panel">
        <div>
          <span className="eyebrow">
            <RadioTower size={15} />
            Centro nacional de monitoreo
          </span>
          <h2>Visualización electoral avanzada</h2>
          <p>
            Panel de lectura para monitorear recepción de actas, comparación de votos,
            inconsistencias reportadas y disponibilidad técnica. Este módulo no modifica
            resultados ni escribe en bases de datos.
          </p>
        </div>

        <div className="hero-metrics">
          <div>
            <strong>{confiabilidad.toFixed(1)}%</strong>
            <span>Confiabilidad RRV</span>
          </div>
          <div>
            <strong>{margen.toFixed(2)}%</strong>
            <span>Margen de victoria</span>
          </div>
        </div>
      </div>

      <div className="summary-grid home-summary-grid">
        <SummaryCard
          title="Actas RRV recibidas"
          value={formatNumber(resumen.rrv.actasRecibidas)}
          description="Total nacional recibido"
          icon={<FileStack />}
          status="info"
        />
        <SummaryCard
          title="Actas RRV procesadas"
          value={formatNumber(resumen.rrv.actasProcesadas)}
          icon={<ClipboardCheck />}
          status="info"
        />
        <SummaryCard
          title="Actas RRV validadas"
          value={formatNumber(resumen.rrv.actasValidadas)}
          icon={<CheckCircle2 />}
          status="success"
        />
        <SummaryCard
          title="Actas RRV sospechosas"
          value={formatNumber(resumen.rrv.actasSospechosas)}
          icon={<ShieldAlert />}
          status="warning"
        />
        <SummaryCard
          title="Actas RRV rechazadas"
          value={formatNumber(resumen.rrv.actasRechazadas)}
          icon={<XCircle />}
          status="danger"
        />
        <SummaryCard
          title="Actas oficiales importadas"
          value={formatNumber(resumen.oficial.actasImportadas)}
          icon={<Database />}
          status="info"
        />
        <SummaryCard
          title="Actas oficiales validadas"
          value={formatNumber(resumen.oficial.actasValidadas)}
          icon={<FileCheck2 />}
          status="success"
        />
        <SummaryCard
          title="Actas oficiales observadas"
          value={formatNumber(resumen.oficial.actasObservadas)}
          icon={<AlertTriangle />}
          status="warning"
        />
        <SummaryCard
          title="Actas oficiales rechazadas"
          value={formatNumber(resumen.oficial.actasRechazadas)}
          icon={<XCircle />}
          status="danger"
        />
        <SummaryCard
          title="Total votos RRV"
          value={formatNumber(resumen.votos.rrv.totalVotos)}
          icon={<Vote />}
          status="info"
        />
        <SummaryCard
          title="Total votos Oficial"
          value={formatNumber(resumen.votos.oficial.totalVotos)}
          icon={<Vote />}
          status="success"
        />
      </div>

      <div className="dashboard-grid">
        

        <article className="panel-card">
          <div className="section-header">
            <div>
              <h3>Estado de actas</h3>
              <p>Distribución consolidada por fuente.</p>
            </div>
          </div>
          <ActStatusDonutChart data={estadoActas} />
        </article>

        <article className="panel-card">
          <div className="section-header">
            <div>
              <h3>Tipos de voto</h3>
              <p>Válidos, blancos y nulos.</p>
            </div>
          </div>
          <VoteTypeChart data={voteTypes} />
        </article>

        <article className="panel-card panel-wide">
          <div className="section-header">
            <div>
              <h3>Inconsistencias recientes</h3>
              <p>Últimos reportes detectados por fuente.</p>
            </div>
          </div>
          <InconsistenciasTable data={inconsistencias.slice(0, 4)} />
        </article>

        <article className="panel-card panel-wide">
          <div className="section-header">
            <div>
              <h3>Estado de clústeres</h3>
              <p>Monitoreo de servicios de lectura del backend.</p>
            </div>
          </div>
          <ClusterStatusTable data={clusters} />
        </article>
      </div>
    </section>
  );
}