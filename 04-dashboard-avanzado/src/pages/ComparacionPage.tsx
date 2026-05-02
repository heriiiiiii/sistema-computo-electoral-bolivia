import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgeCheck, GitCompare, Scale, Vote } from 'lucide-react';
import { dashboardApi } from '../api/dashboard.api';
import KpiCard from '../components/cards/KpiCard';
import CandidateComparisonChart from '../components/charts/CandidateComparisonChart';
import ComparacionTable from '../components/tables/ComparacionTable';
import type {
  CandidateResult,
  ComparacionGeneral,
  DashboardResumen
} from '../types/dashboard.types';
import { formatNumber, formatPercent, getStatusClass } from '../utils/formatters';
import '../styles/comparacion.css';

export default function ComparacionPage() {
  const [comparacion, setComparacion] = useState<ComparacionGeneral | null>(null);
  const [resumen, setResumen] = useState<DashboardResumen | null>(null);
  const [resultadosCandidatos, setResultadosCandidatos] = useState<CandidateResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function cargarComparacion() {
    setLoading(true);
    setError(null);

    Promise.allSettled([
      dashboardApi.getComparacion(),
      dashboardApi.getResumen(),
      dashboardApi.getResultadosCandidatos()
    ])
      .then(([comparacionResult, resumenResult, candidatosResult]) => {
        if (comparacionResult.status === 'fulfilled') {
          setComparacion(comparacionResult.value);
          setError(null);
        } else {
          console.error('Error cargando comparación:', comparacionResult.reason);
          setComparacion(null);
          setError('No se pudo cargar la comparación RRV vs Oficial.');
        }

        if (resumenResult.status === 'fulfilled') {
          setResumen(resumenResult.value);
        } else {
          console.error('Error cargando resumen:', resumenResult.reason);
          setResumen(null);
        }

        if (candidatosResult.status === 'fulfilled') {
          setResultadosCandidatos(candidatosResult.value);
        } else {
          console.error('Error cargando resultados por candidato:', candidatosResult.reason);
          setResultadosCandidatos([]);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    let mounted = true;

    setLoading(true);
    setError(null);

    Promise.allSettled([
      dashboardApi.getComparacion(),
      dashboardApi.getResumen(),
      dashboardApi.getResultadosCandidatos()
    ])
      .then(([comparacionResult, resumenResult, candidatosResult]) => {
        if (!mounted) return;

        if (comparacionResult.status === 'fulfilled') {
          setComparacion(comparacionResult.value);
          setError(null);
        } else {
          console.error('Error cargando comparación:', comparacionResult.reason);
          setComparacion(null);
          setError('No se pudo cargar la comparación RRV vs Oficial.');
        }

        if (resumenResult.status === 'fulfilled') {
          setResumen(resumenResult.value);
        } else {
          console.error('Error cargando resumen:', resumenResult.reason);
          setResumen(null);
        }

        if (candidatosResult.status === 'fulfilled') {
          setResultadosCandidatos(candidatosResult.value);
        } else {
          console.error('Error cargando resultados por candidato:', candidatosResult.reason);
          setResultadosCandidatos([]);
        }
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

  const comparacionMostrada = useMemo<ComparacionGeneral | null>(() => {
    if (!comparacion) return null;

    const totalOficialResumen = resumen?.votos.oficial.totalVotos ?? 0;

    const votosOficialesPorPartido = new Map(
      resultadosCandidatos.map((item) => [item.partido, item.votosOficial])
    );

    const endpointComparacionSinOficial =
      comparacion.totalVotosOficial === 0 && totalOficialResumen > 0;

    if (!endpointComparacionSinOficial) {
      return comparacion;
    }

    return {
      ...comparacion,
      totalVotosOficial: totalOficialResumen,
      candidatos: comparacion.candidatos.map((item) => ({
        ...item,
        votosOficial: votosOficialesPorPartido.get(item.partido) ?? item.votosOficial
      }))
    };
  }, [comparacion, resumen, resultadosCandidatos]);

  const oficialUsadoComoReferencia = useMemo(() => {
    if (!comparacion || !comparacionMostrada) return false;

    return (
      comparacion.totalVotosOficial === 0 &&
      comparacionMostrada.totalVotosOficial > 0
    );
  }, [comparacion, comparacionMostrada]);

  if (loading) {
    return <div className="loading-card">Cargando comparación electoral...</div>;
  }

  if (error || !comparacionMostrada) {
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

        <span className={getStatusClass(comparacionMostrada.estado)}>
          {comparacionMostrada.estado}
        </span>
      </div>

      {oficialUsadoComoReferencia && (
        <div className="loading-card">
          <p>
            <strong>Datos oficiales mostrados como referencia.</strong>
          </p>

          <p>
            El endpoint de comparación todavía devuelve Oficial en cero. Para no
            dejar la vista vacía, se muestran los votos oficiales disponibles
            desde los endpoints de resumen y resultados por candidato. Las
            diferencias y estados siguen siendo los entregados por el backend de
            comparación.
          </p>
        </div>
      )}

      <div className="kpi-grid comparacion-kpi-grid">
        <KpiCard
          title="Total votos RRV"
          value={formatNumber(comparacionMostrada.totalVotosRRV)}
          description="Total reportado por el backend RRV"
          status="POSITIVO"
          icon={<Vote />}
        />

        <KpiCard
          title="Total votos Oficial"
          value={formatNumber(comparacionMostrada.totalVotosOficial)}
          description={
            oficialUsadoComoReferencia
              ? 'Total recibido desde resumen oficial'
              : 'Total reportado por el endpoint de comparación'
          }
          status={comparacionMostrada.totalVotosOficial > 0 ? 'POSITIVO' : 'NEUTRO'}
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

        <CandidateComparisonChart data={comparacionMostrada.candidatos} />
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

        <ComparacionTable data={comparacionMostrada.candidatos} />
      </article>
    </section>
  );
}