/**
 * Dashboard API endpoints.
 *
 * El dashboard NO se conecta directamente a MongoDB ni PostgreSQL.
 * Consume únicamente APIs HTTP.
 *
 * Contratos de integración:
 *
 * 1) Conteo rápido RRV
 *    Base: /api/rrv/*
 *    Backend esperado: FastAPI RRV.
 *    Base de datos: MongoDB Replica Set del módulo 01.
 *
 * 2) Cómputo oficial
 *    Base: /api/oficial/*
 *    Backend esperado: API oficial conectada al PostgreSQL del módulo 01.
 *    Base de datos: PostgreSQL primary/replica mediante postgres-router / HAProxy.
 *
 * Nota:
 * El dashboard no depende de una carpeta o módulo específico para el backend oficial.
 * Solo exige que exista una API compatible con /api/oficial/*.
 */

export const DASHBOARD_ENDPOINTS = {
  // ── RRV / Conteo rápido ───────────────────────────────────────
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

  // ── Oficial / Cómputo oficial ─────────────────────────────────
  resumenOficial: '/api/oficial/resumen',
  actasOficial: '/api/oficial/actas',
  validacionesOficial: '/api/oficial/validaciones',
  auditoriaOficial: '/api/oficial/auditoria',
  importacionesOficial: '/api/oficial/importaciones',

  // ── Capa intermedia (RRV + Oficial unificados) ────────────────
  // Provista por el backend oficial bajo /api/dashboard/*.
  // Une datos de PostgreSQL (oficial) y FastAPI (RRV) del lado servidor.
  resumenNacional: '/api/dashboard/resumen-nacional',
  resultadosScope: '/api/dashboard/resultados',
  ganadorNacional: '/api/dashboard/ganador/nacional',
  ganadorMesa: (codigo: string) => `/api/dashboard/ganador/mesa/${encodeURIComponent(codigo)}`,
  ganadorRecinto: (codigo: string) => `/api/dashboard/ganador/recinto/${encodeURIComponent(codigo)}`,
  ganadorMunicipio: (codigo: string) => `/api/dashboard/ganador/municipio/${encodeURIComponent(codigo)}`,
  ganadorDepartamento: (codigo: string) => `/api/dashboard/ganador/departamento/${encodeURIComponent(codigo)}`,
  comparacionDashboard: '/api/dashboard/comparacion',
  inconsistenciasDashboard: '/api/dashboard/inconsistencias',
  healthDashboard: '/api/dashboard/health',
  mapaDepartamentos: '/api/dashboard/mapa/departamentos'
} as const;