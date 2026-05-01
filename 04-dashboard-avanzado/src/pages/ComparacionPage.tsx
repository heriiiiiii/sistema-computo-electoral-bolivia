import { useEffect, useState } from 'react';
import { BadgeCheck, GitCompare, Scale, Vote } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import CandidateComparisonChart from '../components/charts/CandidateComparisonChart';
import ComparacionTable from '../components/tables/ComparacionTable';
import type { ComparacionGeneral } from '../types/dashboard.types';
import { formatNumber, formatPercent, getStatusClass } from '../utils/formatters';
import '../styles/comparacion.css';

export default function ComparacionPage() {
  const [comparacion, setComparacion] = useState<ComparacionGeneral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargarComparacion() {
    setLoading(true);
    setError(null);

    dashboardApi
      .getComparacion()
      .then((response) => {
        setComparacion(response);
        setError(null);
      })
      .catch((err) => {
        console.error('Error cargando comparación:', err);
        setComparacion(null);
        setError('No se pudo cargar la comparación RRV vs Oficial.');
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setError(null);

    dashboardApi
      .getComparacion()
      .then((response) => {
        if (!mounted) return;
        setComparacion(response);
        setError(null);
      })
      .catch((err) => {
        console.error('Error cargando comparación:', err);
        if (!mounted) return;
        setComparacion(null);
        setError('No se pudo cargar la comparación RRV vs Oficial.');
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

  if (loading) {
    return <div className="loading-card">Cargando comparación electoral...</div>;
  }

  if (error || !comparacion) {
    return (
      <section className="page page-enter comparacion-page">
        <div className="error-card">
          <p>{error || 'No se pudo obtener la comparación.'}</p>
          <button
            className="button primary"
            type="button"
            onClick={cargarComparacion}
          >
            Reintentar
          </button>
        </div>
      </section>
    );
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
            El dashboard solo presenta datos entregados por los endpoints.
          </p>
        </div>

        <span className={getStatusClass(comparacion.estado)}>
          {comparacion.estado}
        </span>
      </div>

      <div className="kpi-grid comparacion-kpi-grid">
        <KpiCard
          title="Total votos RRV"
          value={formatNumber(comparacion.totalVotosRRV)}
          description="Total reportado por el backend RRV"
          status="POSITIVO"
          icon={<Vote />}
        />

        <KpiCard
          title="Total votos Oficial"
          value={formatNumber(comparacion.totalVotosOficial)}
          description="Total reportado por la API oficial"
          status="POSITIVO"
          icon={<BadgeCheck />}
        />

        <KpiCard
          title="Diferencia total"
          value={formatNumber(Math.abs(comparacion.diferenciaTotal))}
          description="Diferencia entregada por el flujo de comparación"
          status="NEUTRO"
          icon={<Scale />}
        />

        <KpiCard
          title="Diferencia porcentual"
          value={formatPercent(comparacion.diferenciaPorcentualTotal, 4)}
          description="Porcentaje entregado por el flujo de comparación"
          status="NEUTRO"
          icon={<GitCompare />}
        />

        <KpiCard
          title="Estado de comparación"
          value={comparacion.estado.replace(/_/g, ' ')}
          description="Estado recibido para la comparación RRV vs Oficial"
          status={
            comparacion.estado === 'INCONSISTENCIA'
              ? 'ALERTA'
              : comparacion.estado === 'DIFERENCIA_LEVE'
                ? 'NEUTRO'
                : 'POSITIVO'
          }
          icon={<BadgeCheck />}
        />
      </div>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Votos por candidato</h3>
            <p>
              Comparación visual de resultados RRV y Oficial recibidos desde
              backend.
            </p>
          </div>
        </div>

        <CandidateComparisonChart data={comparacion.candidatos} />
      </article>

      <article className="panel-card">
        <div className="section-header">
          <div>
            <h3>Tabla comparativa</h3>
            <p>
              Detalle por partido, candidato, diferencia y estado reportado.
            </p>
          </div>
        </div>

        <ComparacionTable data={comparacion.candidatos} />
      </article>
    </section>
  );
}