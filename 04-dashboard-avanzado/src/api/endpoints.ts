/**
 * Dashboard API endpoints — apuntan al backend RRV.
 *
 * Prefijo:  /api/rrv/dashboard/*
 * Servidor: http://localhost:4001 (via proxy en dev)
 */
export const DASHBOARD_ENDPOINTS = {
  resumen: '/api/rrv/dashboard/resumen',
  comparacion: '/api/rrv/dashboard/comparacion',
  kpis: '/api/rrv/dashboard/kpis',
  resultadosCandidatos: '/api/rrv/dashboard/resultados-candidatos',
  estadoActas: '/api/rrv/dashboard/estado-actas',
  inconsistencias: '/api/rrv/dashboard/inconsistencias',
  geografico: '/api/rrv/dashboard/geografico',
  metricasTecnicas: '/api/rrv/dashboard/metricas-tecnicas',
  estadoClusters: '/api/rrv/dashboard/estado-clusters',
  actasDigitalizadas: '/api/rrv/dashboard/actas-digitalizadas'
} as const;