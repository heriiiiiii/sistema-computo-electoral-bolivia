import axios from 'axios';
import { DASHBOARD_ENDPOINTS } from './endpoints';
import {
  mockActasDigitalizadas,
  mockComparacion,
  mockDashboardKpis,
  mockEstadoActas,
  mockEstadoClusters,
  mockGeografico,
  mockInconsistencias,
  mockMetricasTecnicas,
  mockResultadosCandidatos,
  mockResumen
} from '../data/mockDashboardData';
import type {
  ActStatusCount,
  ActaDigitalizada,
  CandidateResult,
  ClusterStatus,
  ComparacionGeneral,
  DashboardKpi,
  DashboardResumen,
  GeograficoItem,
  Inconsistencia,
  MetricasTecnicas
} from '../types/dashboard.types';

export const USE_MOCKS = true;

const dashboardClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 10000,
  headers: {
    Accept: 'application/json'
  }
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

export const dashboardApi = {
  getResumen(): Promise<DashboardResumen> {
    return USE_MOCKS
      ? mockDelay(mockResumen)
      : get<DashboardResumen>(DASHBOARD_ENDPOINTS.resumen);
  },

  getComparacion(): Promise<ComparacionGeneral> {
    return USE_MOCKS
      ? mockDelay(mockComparacion)
      : get<ComparacionGeneral>(DASHBOARD_ENDPOINTS.comparacion);
  },

  getKpis(): Promise<DashboardKpi[]> {
    return USE_MOCKS
      ? mockDelay(mockDashboardKpis)
      : get<DashboardKpi[]>(DASHBOARD_ENDPOINTS.kpis);
  },

  getResultadosCandidatos(): Promise<CandidateResult[]> {
    return USE_MOCKS
      ? mockDelay(mockResultadosCandidatos)
      : get<CandidateResult[]>(DASHBOARD_ENDPOINTS.resultadosCandidatos);
  },

  getEstadoActas(): Promise<ActStatusCount[]> {
    return USE_MOCKS
      ? mockDelay(mockEstadoActas)
      : get<ActStatusCount[]>(DASHBOARD_ENDPOINTS.estadoActas);
  },

  getInconsistencias(): Promise<Inconsistencia[]> {
    return USE_MOCKS
      ? mockDelay(mockInconsistencias)
      : get<Inconsistencia[]>(DASHBOARD_ENDPOINTS.inconsistencias);
  },

  getGeografico(): Promise<GeograficoItem[]> {
    return USE_MOCKS
      ? mockDelay(mockGeografico)
      : get<GeograficoItem[]>(DASHBOARD_ENDPOINTS.geografico);
  },

  getMetricasTecnicas(): Promise<MetricasTecnicas> {
    return USE_MOCKS
      ? mockDelay(mockMetricasTecnicas)
      : get<MetricasTecnicas>(DASHBOARD_ENDPOINTS.metricasTecnicas);
  },

  getEstadoClusters(): Promise<ClusterStatus[]> {
    return USE_MOCKS
      ? mockDelay(mockEstadoClusters)
      : get<ClusterStatus[]>(DASHBOARD_ENDPOINTS.estadoClusters);
  },

  getActasDigitalizadas(): Promise<ActaDigitalizada[]> {
    return USE_MOCKS
      ? mockDelay(mockActasDigitalizadas)
      : get<ActaDigitalizada[]>(DASHBOARD_ENDPOINTS.actasDigitalizadas);
  }
};