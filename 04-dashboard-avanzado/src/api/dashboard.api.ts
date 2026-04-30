/**
 * Dashboard API — modo híbrido
 *
 * RRV  → datos reales desde el backend FastAPI (puerto 4001)
 * Oficial → mock coherente generado a partir de los datos RRV reales
 *
 * Cuando el módulo 03-flujo-oficial tenga API real, se cambiará
 * USE_MOCK_OFICIAL a false y se consumirán endpoints reales.
 */

import axios from 'axios';
import { DASHBOARD_ENDPOINTS } from './endpoints';
import {
  mockComparacion,
  mockDashboardKpis,
  mockEstadoActas,
  mockEstadoClusters,
  mockGeografico,
  mockInconsistencias,
  mockMetricasTecnicas,
  mockResultadosCandidatos,
  mockResumen,
  mockActasDigitalizadas,
} from '../data/mockDashboardData';
import type {
  ActStatusCount,
  ActaDigitalizada,
  CandidateResult,
  ClusterStatus,
  ComparacionGeneral,
  ComparacionResultado,
  DashboardKpi,
  DashboardResumen,
  GeograficoItem,
  Inconsistencia,
  MetricasTecnicas,
} from '../types/dashboard.types';

// ─── Feature flags ────────────────────────────────────────────────
/** true = el bloque RRV se consume del backend real */
export const USE_REAL_RRV = true;

/** true = el bloque Oficial se genera como mock coherente */
export const USE_MOCK_OFICIAL = true;
// ──────────────────────────────────────────────────────────────────

const dashboardClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 10000,
  headers: { Accept: 'application/json' },
});

function mockDelay<T>(data: T): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(data), 250);
  });
}

async function get<T>(endpoint: string): Promise<T> {
  const response = await dashboardClient.get<T>(endpoint);
  return response.data;
}

// ─── Oficial mock generators (coherent with real RRV) ─────────────

const PARTY_COLORS: Record<string, string> = {
  P1: '#22c55e',
  P2: '#3b82f6',
  P3: '#f59e0b',
  P4: '#14b8a6',
};
const DEFAULT_COLOR = '#a855f7';

interface RrvResumenResponse {
  success: boolean;
  actasRecibidas: number;
  actasProcesadas: number;
  actasValidadas: number;
  actasSospechosas: number;
  actasRechazadas: number;
  actasPendientes: number;
  actasDuplicadas: number;
  actasConErrorOCR: number;
  totalVotos: number;
  votosValidos: number;
  votosBlancos: number;
  votosNulos: number;
  ultimaActualizacion: string;
}

interface RrvCandidatoItem {
  partidoCodigo: string;
  partidoNombre: string;
  totalVotos: number;
  color: string;
}

interface RrvEstadoItem {
  fuente: string;
  estado: string;
  cantidad: number;
}

interface RrvGeograficoItem {
  id: string;
  nivel: string;
  nombre: string;
  departamento: string;
  votosRRV: number;
  actasProcesadas: number;
  participacion: number;
}

function generateOficialResumen(rrv: RrvResumenResponse) {
  return {
    actasImportadas: Math.round(rrv.actasRecibidas * 0.93),
    actasValidadas: Math.round(rrv.actasValidadas * 0.92),
    actasObservadas: Math.max(2, Math.round(rrv.actasSospechosas * 0.25)),
    actasRechazadas: Math.max(1, rrv.actasRechazadas + 3),
  };
}

function generateOficialVotos(rrv: RrvResumenResponse) {
  return {
    votosValidos: Math.round(rrv.votosValidos * 0.997),
    votosBlancos: Math.round(rrv.votosBlancos * 1.01),
    votosNulos: Math.round(rrv.votosNulos * 0.992),
    totalVotos: Math.round(rrv.totalVotos * 0.996),
  };
}

// ─── Public API ───────────────────────────────────────────────────

export const dashboardApi = {
  // ── Resumen ───────────────────────────────────────────────────
  async getResumen(): Promise<DashboardResumen> {
    if (!USE_REAL_RRV) return mockDelay(mockResumen);

    const rrv = await get<RrvResumenResponse>(DASHBOARD_ENDPOINTS.resumen);

    const oficial = USE_MOCK_OFICIAL
      ? generateOficialResumen(rrv)
      : { actasImportadas: 0, actasValidadas: 0, actasObservadas: 0, actasRechazadas: 0 };

    const oficialVotos = USE_MOCK_OFICIAL
      ? generateOficialVotos(rrv)
      : { votosValidos: 0, votosBlancos: 0, votosNulos: 0, totalVotos: 0 };

    return {
      rrv: {
        actasRecibidas: rrv.actasRecibidas,
        actasProcesadas: rrv.actasProcesadas,
        actasValidadas: rrv.actasValidadas,
        actasSospechosas: rrv.actasSospechosas,
        actasRechazadas: rrv.actasRechazadas,
      },
      oficial,
      votos: {
        rrv: {
          votosValidos: rrv.votosValidos,
          votosBlancos: rrv.votosBlancos,
          votosNulos: rrv.votosNulos,
          totalVotos: rrv.totalVotos,
        },
        oficial: oficialVotos,
      },
      ultimaActualizacion: rrv.ultimaActualizacion,
    };
  },

  // ── Comparación ───────────────────────────────────────────────
  async getComparacion(): Promise<ComparacionGeneral> {
    if (!USE_REAL_RRV) return mockDelay(mockComparacion);

    const resp = await get<{ success: boolean; totalVotosRRV: number; candidatos: Array<{ partido: string; candidato: string; color: string; votosRRV: number }> }>(
      DASHBOARD_ENDPOINTS.comparacion
    );

    const candidatos: ComparacionResultado[] = resp.candidatos.map((c) => {
      const oficialVotos = USE_MOCK_OFICIAL ? Math.round(c.votosRRV * (0.994 + Math.random() * 0.012)) : 0;
      const dif = c.votosRRV - oficialVotos;
      const difPct = oficialVotos > 0 ? Math.abs(dif / oficialVotos) * 100 : 0;
      let estado: ComparacionResultado['estado'] = 'COINCIDE';
      if (difPct > 0.1) estado = 'DIFERENCIA_LEVE';
      if (difPct > 1) estado = 'INCONSISTENCIA';
      return { ...c, votosOficial: oficialVotos, diferencia: dif, diferenciaPorcentual: Math.round(difPct * 10000) / 10000, estado };
    });

    const totalOficial = candidatos.reduce((s, c) => s + c.votosOficial, 0);
    const difTotal = resp.totalVotosRRV - totalOficial;
    const difTotalPct = totalOficial > 0 ? Math.abs(difTotal / totalOficial) * 100 : 0;

    return {
      totalVotosRRV: resp.totalVotosRRV,
      totalVotosOficial: totalOficial,
      diferenciaTotal: difTotal,
      diferenciaPorcentualTotal: Math.round(difTotalPct * 10000) / 10000,
      estado: difTotalPct > 1 ? 'INCONSISTENCIA' : difTotalPct > 0.05 ? 'DIFERENCIA_LEVE' : 'COINCIDE',
      candidatos,
    };
  },

  // ── KPIs ──────────────────────────────────────────────────────
  async getKpis(): Promise<DashboardKpi[]> {
    if (!USE_REAL_RRV) return mockDelay(mockDashboardKpis);

    const resp = await get<{ success: boolean; kpis: DashboardKpi[] }>(DASHBOARD_ENDPOINTS.kpis);
    return resp.kpis;
  },

  // ── Resultados candidatos ─────────────────────────────────────
  async getResultadosCandidatos(): Promise<CandidateResult[]> {
    if (!USE_REAL_RRV) return mockDelay(mockResultadosCandidatos);

    const resp = await get<{ success: boolean; candidatos: RrvCandidatoItem[] }>(
      DASHBOARD_ENDPOINTS.resultadosCandidatos
    );

    return resp.candidatos.map((c) => ({
      partido: c.partidoCodigo,
      candidato: c.partidoNombre,
      color: c.color || PARTY_COLORS[c.partidoCodigo] || DEFAULT_COLOR,
      votosRRV: c.totalVotos,
      votosOficial: USE_MOCK_OFICIAL ? Math.round(c.totalVotos * (0.994 + Math.random() * 0.012)) : 0,
    }));
  },

  // ── Estado actas ──────────────────────────────────────────────
  async getEstadoActas(): Promise<ActStatusCount[]> {
    if (!USE_REAL_RRV) return mockDelay(mockEstadoActas);

    const resp = await get<{ success: boolean; estados: RrvEstadoItem[] }>(
      DASHBOARD_ENDPOINTS.estadoActas
    );

    const rrvItems: ActStatusCount[] = resp.estados.map((e) => ({
      fuente: 'RRV' as const,
      estado: e.estado as ActStatusCount['estado'],
      cantidad: e.cantidad,
    }));

    if (USE_MOCK_OFICIAL) {
      const totalRRV = rrvItems.reduce((s, i) => s + i.cantidad, 0);
      const oficialItems: ActStatusCount[] = [
        { fuente: 'OFICIAL', estado: 'IMPORTADA', cantidad: Math.round(totalRRV * 0.93) },
        { fuente: 'OFICIAL', estado: 'VALIDANDO', cantidad: Math.round(totalRRV * 0.02) },
        { fuente: 'OFICIAL', estado: 'VALIDADA', cantidad: Math.round(totalRRV * 0.88) },
        { fuente: 'OFICIAL', estado: 'OBSERVADA', cantidad: Math.round(totalRRV * 0.02) },
        { fuente: 'OFICIAL', estado: 'RECHAZADA', cantidad: Math.max(1, Math.round(totalRRV * 0.003)) },
        { fuente: 'OFICIAL', estado: 'OFICIALIZADA', cantidad: Math.round(totalRRV * 0.85) },
      ];
      return [...rrvItems, ...oficialItems];
    }

    return rrvItems;
  },

  // ── Inconsistencias ───────────────────────────────────────────
  async getInconsistencias(): Promise<Inconsistencia[]> {
    if (!USE_REAL_RRV) return mockDelay(mockInconsistencias);

    const resp = await get<{ success: boolean; inconsistencias: Inconsistencia[] }>(
      DASHBOARD_ENDPOINTS.inconsistencias
    );
    return resp.inconsistencias;
  },

  // ── Geográfico ────────────────────────────────────────────────
  async getGeografico(): Promise<GeograficoItem[]> {
    if (!USE_REAL_RRV) return mockDelay(mockGeografico);

    const resp = await get<{ success: boolean; items: RrvGeograficoItem[] }>(
      DASHBOARD_ENDPOINTS.geografico
    );

    return resp.items.map((g) => ({
      id: g.id,
      nivel: g.nivel as GeograficoItem['nivel'],
      nombre: g.nombre,
      departamento: g.departamento,
      votosRRV: g.votosRRV,
      votosOficial: USE_MOCK_OFICIAL ? Math.round(g.votosRRV * 0.996) : 0,
      actasProcesadas: g.actasProcesadas,
      participacion: g.participacion,
      estadoComparacion: 'COINCIDE',
    }));
  },

  // ── Métricas técnicas ─────────────────────────────────────────
  async getMetricasTecnicas(): Promise<MetricasTecnicas> {
    if (!USE_REAL_RRV) return mockDelay(mockMetricasTecnicas);

    const resp = await get<{ success: boolean } & MetricasTecnicas>(
      DASHBOARD_ENDPOINTS.metricasTecnicas
    );

    return {
      latenciaPromedioMs: resp.latenciaPromedioMs,
      throughputPorMinuto: resp.throughputPorMinuto,
      disponibilidadPorcentual: resp.disponibilidadPorcentual,
      erroresUltimaHora: resp.erroresUltimaHora,
      reintentosUltimaHora: resp.reintentosUltimaHora,
      smsInvalidos: resp.smsInvalidos,
      numerosNoAutorizados: resp.numerosNoAutorizados,
      actasSospechosas: resp.actasSospechosas,
      intentosDuplicados: resp.intentosDuplicados,
    };
  },

  // ── Estado clústeres ──────────────────────────────────────────
  async getEstadoClusters(): Promise<ClusterStatus[]> {
    if (!USE_REAL_RRV) return mockDelay(mockEstadoClusters);

    const resp = await get<{ success: boolean; clusters: ClusterStatus[] }>(
      DASHBOARD_ENDPOINTS.estadoClusters
    );

    const rrvClusters = resp.clusters;

    if (USE_MOCK_OFICIAL) {
      const pgMock: ClusterStatus[] = [
        {
          id: 'CL-PG-01',
          cluster: 'Oficial-Relacional / PostgreSQL',
          motor: 'PostgreSQL',
          nodo: 'pg-oficial-leader-01',
          rol: 'LEADER',
          estado: 'ACTIVO',
          latenciaMs: 106,
          ultimaVerificacion: new Date().toISOString(),
          observacion: 'Nodo líder simulado (módulo oficial no integrado).',
        },
        {
          id: 'CL-PG-02',
          cluster: 'Oficial-Relacional / PostgreSQL',
          motor: 'PostgreSQL',
          nodo: 'pg-oficial-replica-02',
          rol: 'REPLICA',
          estado: 'ACTIVO',
          latenciaMs: 142,
          ultimaVerificacion: new Date().toISOString(),
          observacion: 'Réplica simulada (módulo oficial no integrado).',
        },
      ];
      return [...rrvClusters, ...pgMock];
    }

    return rrvClusters;
  },

  // ── Actas digitalizadas ───────────────────────────────────────
  async getActasDigitalizadas(): Promise<ActaDigitalizada[]> {
    if (!USE_REAL_RRV) return mockDelay(mockActasDigitalizadas);

    const resp = await get<{ success: boolean; actas: ActaDigitalizada[] }>(
      DASHBOARD_ENDPOINTS.actasDigitalizadas
    );
    return resp.actas;
  },
};