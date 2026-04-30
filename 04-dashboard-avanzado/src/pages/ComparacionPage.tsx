import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, GitCompare, Scale, Vote } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import CandidateComparisonChart from '../components/charts/CandidateComparisonChart';
import ComparacionTable from '../components/tables/ComparacionTable';
import type { ComparacionGeneral } from '../types/dashboard.types';
import { formatNumber, formatPercent, getStatusClass } from '../utils/formatters';
import { calcularMargenVictoria } from '../utils/calculations';
import '../styles/comparacion.css';

export default function ComparacionPage() {
  const [comparacion, setComparacion] = useState<ComparacionGeneral | null>(null);

  useEffect(() => {
    dashboardApi.getComparacion().then(setComparacion);
  }, []);

    const fuenteMargen = useMemo(() => {
    if (!comparacion) return 'RRV';

    return comparacion.totalVotosRRV > 0 ? 'RRV' : 'Oficial';
  }, [comparacion]);

  const margenVictoria = useMemo(() => {
    if (!comparacion) return 0;

    return calcularMargenVictoria(
      comparacion.candidatos.map((item) => ({
        nombre: item.candidato,
        votos: fuenteMargen === 'RRV' ? item.votosRRV : item.votosOficial
      }))
    );
  }, [comparacion, fuenteMargen]);

  if (!comparacion) {
    return <div className="loading-card">Cargando comparación electoral...</div>;
  }

  return (
<section className="page page-enter comparacion-page">
    <div className="section-header elevated">
        <div>
          <span className="eyebrow">
            <GitCompare size={15} />
            Comparación nacional
          </span>
          <h2>RRV vs Oficial</h2>
          <p>
            Vista de lectura para identificar diferencias absolutas,
            porcentuales y estado de consistencia entre fuentes.
          </p>
        </div>

        <span className={getStatusClass(comparacion.estado)}>
          {comparacion.estado}
        </span>
      </div>

<div className="kpi-grid comparacion-kpi-grid">        <KpiCard
          title="Total votos RRV"
          value={formatNumber(comparacion.totalVotosRRV)}
          description="Total computado desde la fuente RRV"
          status="POSITIVO"
          icon={<Vote />}
        />
        <KpiCard
          title="Total votos Oficial"
          value={formatNumber(comparacion.totalVotosOficial)}
          description="Total recibido desde fuente oficial"
          status="POSITIVO"
          icon={<BadgeCheck />}
        />
        <KpiCard
  title="Diferencia total"
  value={formatNumber(Math.abs(comparacion.diferenciaTotal))}
  description="Diferencia absoluta entre ambas fuentes"
  status={Math.abs(comparacion.diferenciaTotal) > 1000 ? 'ALERTA' : 'NEUTRO'}
  icon={<Scale />}
/>
        <KpiCard
          title="Diferencia porcentual"
          value={formatPercent(comparacion.diferenciaPorcentualTotal, 4)}
          description="Diferencia relativa sobre el total oficial"
          status="NEUTRO"
          icon={<GitCompare />}
        />
        <KpiCard
  title={`Margen de victoria ${fuenteMargen}`}
  value={formatPercent(margenVictoria)}
  description="Distancia entre primer y segundo candidato"
  status="POSITIVO"
  icon={<BadgeCheck />}
/>
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Votos por candidato</h3>
            <p>Comparación visual de resultados RRV y Oficial.</p>
          </div>
        </div>
        <CandidateComparisonChart data={comparacion.candidatos} />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla comparativa</h3>
            <p>Detalle por partido, candidato, diferencia y estado.</p>
          </div>
        </div>
        <ComparacionTable data={comparacion.candidatos} />
      </article>
    </section>
  );
}