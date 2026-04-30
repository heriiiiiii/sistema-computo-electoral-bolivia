/**
 * Dashboard API endpoints.
 *
 * RRV      → backend FastAPI en puerto 4001
 * Oficial  → backend NestJS en puerto 4000
 *
 * Ambos se acceden via proxy de Vite en desarrollo.
 */
export const DASHBOARD_ENDPOINTS = {
  // ── RRV (FastAPI :4001) ────────────────────────────────────────
  resumenRrv: '/api/rrv/dashboard/resumen',
  resultadosCandidatosRrv: '/api/rrv/dashboard/resultados-candidatos',
  estadoActasRrv: '/api/rrv/dashboard/estado-actas',
  inconsistenciasRrv: '/api/rrv/dashboard/inconsistencias',
  geograficoRrv: '/api/rrv/dashboard/geografico',
  metricasTecnicasRrv: '/api/rrv/dashboard/metricas-tecnicas',
  estadoClustersRrv: '/api/rrv/dashboard/estado-clusters',
  actasDigitalizadasRrv: '/api/rrv/dashboard/actas-digitalizadas',
  kpisRrv: '/api/rrv/dashboard/kpis',
  comparacionRrv: '/api/rrv/dashboard/comparacion',

  // ── Oficial (NestJS :4000) ─────────────────────────────────────
  resumenOficial: '/api/oficial/resumen',
  actasOficial: '/api/oficial/actas',
  validacionesOficial: '/api/oficial/validaciones',
  auditoriaOficial: '/api/oficial/auditoria',
  importacionesOficial: '/api/oficial/importaciones',
} as const;