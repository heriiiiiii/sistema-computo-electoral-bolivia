/**
 * Dashboard API — adaptador HTTP del dashboard electoral.
 *
 * Este archivo NO debe calcular resultados electorales.
 * Este archivo NO debe inventar datos.
 * Este archivo NO debe decidir ganadores, diferencias ni estados reales.
 *
 * Solo:
 * - Consume endpoints HTTP.
 * - Normaliza nombres mínimos de campos.
 * - Devuelve datos al frontend.
 * - Maneja errores de red.
 */

import axios from 'axios';
import { DASHBOARD_ENDPOINTS } from './endpoints';
import type {
  ActStatusCount,
  ActaDigitalizada,
  CandidateResult,
  ClusterStatus,
  ComparacionGeneral,
  DashboardKpi,
  DashboardResumen,
  GanadorResponse,
  GanadorScope,
  GeograficoItem,
  Inconsistencia,
  MapaDepartamento,
  MetricasTecnicas
} from '../types/dashboard.types';

// ─── HTTP client ──────────────────────────────────────────────────

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '',
  timeout: 5000,
  headers: { Accept: 'application/json' }
});

async function get<T>(endpoint: string): Promise<T> {
  const response = await client.get<T>(endpoint);
  return response.data;
}

type SafeResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: unknown };

async function safeGet<T>(endpoint: string): Promise<SafeResult<T>> {
  try {
    const data = await get<T>(endpoint);
    return { ok: true, data };
  } catch (error) {
    console.error(`[Dashboard API] Falló endpoint: ${endpoint}`, error);
    return { ok: false, error };
  }
}

// ─── Response shapes from backends ────────────────────────────────

interface RrvResumen {
  success: boolean;
  actasRecibidas: number;
  actasProcesadas: number;
  actasValidadas: number;
  actasSospechosas: number;
  actasRechazadas: number;
  actasPendientes?: number;
  actasNoPublicables?: number;
  inconsistenciasAbiertas?: number;
  incluidasDashboard?: number;
  actasDuplicadas?: number;
  actasConErrorOCR?: number;
  totalVotos: number;
  votosValidos: number;
  votosBlancos: number;
  votosNulos: number;
  ultimaActualizacion: string;
}

interface RrvCandidato {
  partidoCodigo: string;
  partidoNombre: string;
  totalVotos: number;
  color?: string;
}

interface OficialResumen {
  success: boolean;
  data: {
    actas: {
      total?: number | string;
      porEstado?: Record<string, number | string>;
    };
    votos: {
      validos?: number | string;
      blancos?: number | string;
      nulos?: number | string;
      totalVotos?: number | string;
      total?: number | string;
    };
    porPartido?: Array<{
      codigo: string;
      nombre: string;
      total_votos: string | number;
    }>;
    importaciones?: Array<{
      estado: string;
      total: string | number;
    }>;
    inconsistencias?: Array<{
      severidad: string;
      estado: string;
      total: string | number;
    }>;
    clusterStatus?: Array<{
      cluster_nombre: string;
      motor: string;
      nodo: string;
      rol: string;
      estado: string;
      ultima_verificacion: string;
      latenciaMs?: number | string;
      observacion?: string;
    }>;
  };
}

interface OficialActaItem {
  id: number;
  codigo_acta?: string;
  codigo_mesa?: string;
  codigo_recinto?: string;
  recinto_nombre?: string;
  estado: string;
  fecha_importacion?: string;
  departamento?: string;
  provincia?: string;
  municipio?: string;
}

interface ComparacionBackendResponse extends Partial<ComparacionGeneral> {
  success: boolean;
  totalVotosRRV?: number;
  totalVotosOficial?: number;
  diferenciaTotal?: number;
  diferenciaPorcentualTotal?: number;
  estado?: ComparacionGeneral['estado'];
  candidatos?: ComparacionGeneral['candidatos'];
}

// ─── Constants ────────────────────────────────────────────────────

const PARTY_COLORS: Record<string, string> = {
  P1: '#22c55e',
  P2: '#3b82f6',
  P3: '#f59e0b',
  P4: '#14b8a6'
};

const DEFAULT_COLOR = '#64748b';

// ─── Helpers mínimos de normalización ─────────────────────────────

function safeInt(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  if (value === null || value === undefined) {
    return 0;
  }

  const raw = String(value).trim();

  if (raw === '') {
    return 0;
  }

  const normalized = /^[0-9]{1,3}(\.[0-9]{3})+$/.test(raw)
    ? raw.replace(/\./g, '')
    : raw.replace(/,/g, '');

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function getEmptyRrvResumen(): RrvResumen {
  return {
    success: false,
    actasRecibidas: 0,
    actasProcesadas: 0,
    actasValidadas: 0,
    actasSospechosas: 0,
    actasRechazadas: 0,
    actasPendientes: 0,
    actasNoPublicables: 0,
    inconsistenciasAbiertas: 0,
    incluidasDashboard: 0,
    actasDuplicadas: 0,
    actasConErrorOCR: 0,
    totalVotos: 0,
    votosValidos: 0,
    votosBlancos: 0,
    votosNulos: 0,
    ultimaActualizacion: new Date().toISOString()
  };
}

function normalizeClusterEstado(value: string | null | undefined): ClusterStatus['estado'] {
  const estado = String(value || 'DESCONOCIDO').toUpperCase();

  if (
    estado === 'ACTIVO' ||
    estado === 'DEGRADADO' ||
    estado === 'CAIDO' ||
    estado === 'PROCESANDO' ||
    estado === 'DESCONOCIDO'
  ) {
    return estado as ClusterStatus['estado'];
  }

  return 'DESCONOCIDO' as ClusterStatus['estado'];
}

function normalizeClusterRol(value: string | null | undefined): ClusterStatus['rol'] {
  const rol = String(value || 'UNKNOWN').toUpperCase();

  if (
    rol === 'PRIMARY' ||
    rol === 'SECONDARY' ||
    rol === 'REPLICA' ||
    rol === 'READ_ONLY' ||
    rol === 'LEADER' ||
    rol === 'UNKNOWN'
  ) {
    return rol as ClusterStatus['rol'];
  }

  return 'UNKNOWN' as ClusterStatus['rol'];
}

function getOficialActas(ofi?: OficialResumen) {
  const porEstado = ofi?.data?.actas?.porEstado || {};

  return {
    actasImportadas: safeInt(ofi?.data?.actas?.total),
    actasValidadas: safeInt(porEstado['VALIDADA']),
    actasObservadas: safeInt(porEstado['OBSERVADA']),
    actasRechazadas: safeInt(porEstado['RECHAZADA'])
  };
}

function getOficialVotos(ofi?: OficialResumen) {
  const votosValidos = safeInt(ofi?.data?.votos?.validos);
  const votosBlancos = safeInt(ofi?.data?.votos?.blancos);
  const votosNulos = safeInt(ofi?.data?.votos?.nulos);

  const totalBackend = safeInt(
    ofi?.data?.votos?.totalVotos ??
      ofi?.data?.votos?.total
  );

  return {
    votosValidos,
    votosBlancos,
    votosNulos,

    /*
      Corrección temporal:
      El backend oficial actualmente NO manda totalVotos.
      Para mostrar el total en el dashboard, se usa la suma de los campos
      que el propio backend oficial ya entrega: validos + blancos + nulos.

      Idealmente, el backend oficial debería mandar totalVotos directamente.
    */
    totalVotos:
      totalBackend > 0
        ? totalBackend
        : votosValidos + votosBlancos + votosNulos
  };
}

// ─── Public API ───────────────────────────────────────────────────

export const dashboardApi = {
  // ── Resumen ───────────────────────────────────────────────────

  async getResumen(): Promise<DashboardResumen> {
    const [rrvResult, ofiResult] = await Promise.all([
      safeGet<RrvResumen>(DASHBOARD_ENDPOINTS.resumenRrv),
      safeGet<OficialResumen>(DASHBOARD_ENDPOINTS.resumenOficial)
    ]);

    if (!rrvResult.ok && !ofiResult.ok) {
      throw new Error('No se pudo cargar resumen: RRV y Oficial no responden.');
    }

    const rrv = rrvResult.ok ? rrvResult.data : getEmptyRrvResumen();
    const ofi = ofiResult.ok ? ofiResult.data : undefined;

    return {
      rrv: {
        actasRecibidas: safeInt(rrv.actasRecibidas),
        actasProcesadas: safeInt(rrv.actasProcesadas),
        actasValidadas: safeInt(rrv.actasValidadas),
        actasSospechosas: safeInt(rrv.actasSospechosas),
        actasRechazadas: safeInt(rrv.actasRechazadas),
        actasPendientes: safeInt(rrv.actasPendientes),
        actasNoPublicables: safeInt(rrv.actasNoPublicables),
        inconsistenciasAbiertas: safeInt(rrv.inconsistenciasAbiertas),
        incluidasDashboard: safeInt(rrv.incluidasDashboard),
        actasDuplicadas: safeInt(rrv.actasDuplicadas),
        actasConErrorOCR: safeInt(rrv.actasConErrorOCR)
      },
      oficial: getOficialActas(ofi),
      votos: {
        rrv: {
          votosValidos: safeInt(rrv.votosValidos),
          votosBlancos: safeInt(rrv.votosBlancos),
          votosNulos: safeInt(rrv.votosNulos),
          totalVotos: safeInt(rrv.totalVotos)
        },
        oficial: getOficialVotos(ofi)
      },
      ultimaActualizacion: rrv.ultimaActualizacion || new Date().toISOString()
    };
  },

  // ── Comparación RRV vs Oficial ────────────────────────────────

  async getComparacion(): Promise<ComparacionGeneral> {
    /*
      Usa /api/dashboard/comparacion (capa intermedia del backend oficial),
      que cruza RRV + Oficial en el lado servidor y devuelve totales reales.
      Si la capa intermedia no responde, cae al endpoint RRV histórico.
    */
    const merged = await safeGet<{
      success: boolean;
      data: ComparacionBackendResponse;
    }>(DASHBOARD_ENDPOINTS.comparacionDashboard);

    let data: ComparacionBackendResponse | null = null;

    if (merged.ok && merged.data?.data) {
      data = merged.data.data;
    } else {
      const rrvOnly = await safeGet<ComparacionBackendResponse>(
        DASHBOARD_ENDPOINTS.comparacionRrv
      );
      if (!rrvOnly.ok) {
        throw new Error('No se pudo cargar comparación desde backend.');
      }
      data = rrvOnly.data;
    }

    return {
      totalVotosRRV: safeInt(data.totalVotosRRV),
      totalVotosOficial: safeInt(data.totalVotosOficial),
      diferenciaTotal: safeInt(data.diferenciaTotal),
      diferenciaPorcentualTotal: Number(data.diferenciaPorcentualTotal) || 0,
      estado: (data.estado || 'SIN_DATO') as ComparacionGeneral['estado'],
      candidatos: data.candidatos || []
    };
  },

  // ── KPIs ──────────────────────────────────────────────────────

  async getKpis(): Promise<DashboardKpi[]> {
    const result = await safeGet<{ success: boolean; kpis: DashboardKpi[] }>(
      DASHBOARD_ENDPOINTS.kpisRrv
    );

    if (!result.ok) {
      return [];
    }

    return result.data.kpis || [];
  },

  // ── Resultados candidatos ─────────────────────────────────────

  async getResultadosCandidatos(): Promise<CandidateResult[]> {
    /*
      Esta función solo arma una tabla de lectura:
      votos RRV desde RRV y votos oficiales desde Oficial.
      No calcula diferencia ni estado.
    */
    const [rrvResult, ofiResult] = await Promise.all([
      safeGet<{ success: boolean; candidatos: RrvCandidato[] }>(
        DASHBOARD_ENDPOINTS.resultadosCandidatosRrv
      ),
      safeGet<OficialResumen>(DASHBOARD_ENDPOINTS.resumenOficial)
    ]);

    if (!rrvResult.ok && !ofiResult.ok) {
      throw new Error('No se pudo cargar resultados por candidato.');
    }

    const rrvCandidatos = rrvResult.ok ? rrvResult.data.candidatos || [] : [];
    const ofiPartidos = ofiResult.ok ? ofiResult.data.data.porPartido || [] : [];

    const rrvMap = new Map<string, RrvCandidato>();
    const ofiMap = new Map<string, { codigo: string; nombre: string; votos: number }>();

    for (const c of rrvCandidatos) {
      rrvMap.set(c.partidoCodigo, c);
    }

    for (const p of ofiPartidos) {
      ofiMap.set(p.codigo, {
        codigo: p.codigo,
        nombre: p.nombre,
        votos: safeInt(p.total_votos)
      });
    }

    const codigos = Array.from(new Set([...rrvMap.keys(), ...ofiMap.keys()])).sort();

    return codigos.map((codigo) => {
      const rrv = rrvMap.get(codigo);
      const ofi = ofiMap.get(codigo);

      return {
        partido: codigo,
        candidato: rrv?.partidoNombre || ofi?.nombre || `Partido ${codigo}`,
        color: rrv?.color || PARTY_COLORS[codigo] || DEFAULT_COLOR,
        votosRRV: safeInt(rrv?.totalVotos),
        votosOficial: safeInt(ofi?.votos)
      };
    });
  },

  // ── Estado actas ──────────────────────────────────────────────

  async getEstadoActas(): Promise<ActStatusCount[]> {
    const [rrvResult, ofiResult] = await Promise.all([
      safeGet<{
        success: boolean;
        estados: Array<{ fuente: string; estado: string; cantidad: number }>;
      }>(DASHBOARD_ENDPOINTS.estadoActasRrv),
      safeGet<OficialResumen>(DASHBOARD_ENDPOINTS.resumenOficial)
    ]);

    if (!rrvResult.ok && !ofiResult.ok) {
      throw new Error('No se pudo cargar estado de actas.');
    }

    const rrvItems: ActStatusCount[] = rrvResult.ok
      ? (rrvResult.data.estados || []).map((e) => ({
          fuente: 'RRV' as const,
          estado: e.estado as ActStatusCount['estado'],
          cantidad: safeInt(e.cantidad)
        }))
      : [];

    const porEstado = ofiResult.ok ? ofiResult.data.data.actas.porEstado || {} : {};

    const oficialItems: ActStatusCount[] = Object.entries(porEstado).map(
      ([estado, total]) => ({
        fuente: 'OFICIAL' as const,
        estado: estado as ActStatusCount['estado'],
        cantidad: safeInt(total)
      })
    );

    return [...rrvItems, ...oficialItems];
  },

  // ── Inconsistencias ───────────────────────────────────────────

  async getInconsistencias(): Promise<Inconsistencia[]> {
    /*
      Regla estricta:
      No fabricamos inconsistencias oficiales a partir del resumen.
      Mientras no exista /api/oficial/inconsistencias, se muestran las RRV.
    */
    const result = await safeGet<{
      success: boolean;
      total: number;
      inconsistencias: Inconsistencia[];
    }>(DASHBOARD_ENDPOINTS.inconsistenciasRrv);

    if (!result.ok) {
      throw new Error('No se pudo cargar inconsistencias RRV.');
    }

    return result.data.inconsistencias || [];
  },

  // ── Geográfico ────────────────────────────────────────────────

  async getGeografico(): Promise<GeograficoItem[]> {
    const result = await safeGet<{
      success: boolean;
      items: Array<{
        id: string;
        nivel: string;
        nombre: string;
        departamento: string;
        provincia?: string;
        municipio?: string;
        recinto?: string;
        codigoMesa?: string;
        codigo_mesa?: string;

        votosRRV: number;
        votosOficial?: number;
        actasProcesadas: number;
        participacion: number;
        estadoComparacion?: string;

        ganadorRRV?: string;
        ganador_rrv?: string;
        ganadorOficial?: string;
        ganador_oficial?: string;

        votosGanadorRRV?: number;
        votos_ganador_rrv?: number;
        votosGanadorOficial?: number;
        votos_ganador_oficial?: number;

        clasificacionTerritorial?: GeograficoItem['clasificacionTerritorial'];
      }>;
    }>(DASHBOARD_ENDPOINTS.geograficoRrv);

    if (!result.ok) {
      throw new Error('No se pudo cargar información geográfica del RRV.');
    }

    return (result.data.items || []).map((item) => ({
      id: item.id,
      nivel: item.nivel as GeograficoItem['nivel'],
      nombre: item.nombre,
      departamento: item.departamento,
      provincia: item.provincia,
      municipio: item.municipio,
      recinto: item.recinto,
      codigoMesa: item.codigoMesa || item.codigo_mesa,

      votosRRV: safeInt(item.votosRRV),
      votosOficial: safeInt(item.votosOficial),
      actasProcesadas: safeInt(item.actasProcesadas),
      participacion: Number(item.participacion) || 0,
      estadoComparacion:
        (item.estadoComparacion as GeograficoItem['estadoComparacion']) ||
        'SIN_DATO',

      ganadorRRV: item.ganadorRRV || item.ganador_rrv,
      ganadorOficial: item.ganadorOficial || item.ganador_oficial,
      votosGanadorRRV: safeInt(item.votosGanadorRRV || item.votos_ganador_rrv),
      votosGanadorOficial: safeInt(
        item.votosGanadorOficial || item.votos_ganador_oficial
      ),
      clasificacionTerritorial: item.clasificacionTerritorial
    }));
  },

  // ── Métricas técnicas ─────────────────────────────────────────

  async getMetricasTecnicas(): Promise<MetricasTecnicas> {
    const result = await safeGet<{ success: boolean } & MetricasTecnicas>(
      DASHBOARD_ENDPOINTS.metricasTecnicasRrv
    );

    if (!result.ok) {
      throw new Error('No se pudieron cargar métricas técnicas RRV.');
    }

    const resp = result.data;

    return {
      latenciaPromedioMs: safeInt(resp.latenciaPromedioMs),
      throughputPorMinuto: safeInt(resp.throughputPorMinuto),
      disponibilidadPorcentual: Number(resp.disponibilidadPorcentual) || 0,
      erroresUltimaHora: safeInt(resp.erroresUltimaHora),
      reintentosUltimaHora: safeInt(resp.reintentosUltimaHora),
      smsInvalidos: safeInt(resp.smsInvalidos),
      numerosNoAutorizados: safeInt(resp.numerosNoAutorizados),
      actasSospechosas: safeInt(resp.actasSospechosas),
      intentosDuplicados: safeInt(resp.intentosDuplicados),

      latenciaEstado: resp.latenciaEstado,
      throughputEstado: resp.throughputEstado,
      disponibilidadEstado: resp.disponibilidadEstado,
      erroresEstado: resp.erroresEstado,
      reintentosEstado: resp.reintentosEstado,
      smsInvalidosEstado: resp.smsInvalidosEstado,
      numerosNoAutorizadosEstado: resp.numerosNoAutorizadosEstado,
      actasSospechosasEstado: resp.actasSospechosasEstado,
      intentosDuplicadosEstado: resp.intentosDuplicadosEstado
    };
  },

  // ── Estado clústeres ──────────────────────────────────────────

  async getEstadoClusters(): Promise<ClusterStatus[]> {
    const [rrvResult, ofiResult] = await Promise.all([
      safeGet<{ success: boolean; clusters: ClusterStatus[] }>(
        DASHBOARD_ENDPOINTS.estadoClustersRrv
      ),
      safeGet<OficialResumen>(DASHBOARD_ENDPOINTS.resumenOficial)
    ]);

    const clusters: ClusterStatus[] = [];

    if (rrvResult.ok) {
      clusters.push(...(rrvResult.data.clusters || []));
    } else {
      clusters.push({
        id: 'CL-RRV-ERROR',
        cluster: 'RRV-NoSQL / MongoDB',
        motor: 'MongoDB',
        nodo: 'api-rrv:4001',
        rol: 'UNKNOWN',
        estado: 'CAIDO',
        latenciaMs: 0,
        ultimaVerificacion: new Date().toISOString(),
        observacion: 'No se pudo consultar el backend RRV.'
      });
    }

    if (ofiResult.ok) {
      const pgClusters: ClusterStatus[] = (ofiResult.data.data.clusterStatus || [])
        .filter((cs) => String(cs.motor).toUpperCase() === 'POSTGRESQL')
        .map((cs, idx) => ({
          id: `CL-PG-${idx + 1}`,
          cluster: cs.cluster_nombre || 'Oficial-Relacional / PostgreSQL',
          motor: 'PostgreSQL' as const,
          nodo: cs.nodo || `pg-node-${idx + 1}`,
          rol: normalizeClusterRol(cs.rol),
          estado: normalizeClusterEstado(cs.estado),
          latenciaMs: safeInt(cs.latenciaMs),
          ultimaVerificacion: cs.ultima_verificacion || new Date().toISOString(),
          observacion:
            cs.observacion ||
            `Estado reportado por backend oficial: ${cs.estado || 'DESCONOCIDO'}`
        }));

      clusters.push(...pgClusters);
    } else {
      clusters.push({
        id: 'CL-PG-ERROR',
        cluster: 'Oficial-Relacional / PostgreSQL',
        motor: 'PostgreSQL',
        nodo: 'api-oficial:4000',
        rol: 'UNKNOWN',
        estado: 'CAIDO',
        latenciaMs: 0,
        ultimaVerificacion: new Date().toISOString(),
        observacion: 'No se pudo consultar el backend oficial.'
      });
    }

    return clusters;
  },

  // ── Actas digitalizadas ───────────────────────────────────────

  async getActasDigitalizadas(): Promise<ActaDigitalizada[]> {
    const [rrvResult, ofiResult] = await Promise.all([
      safeGet<{ success: boolean; actas: ActaDigitalizada[] }>(
        DASHBOARD_ENDPOINTS.actasDigitalizadasRrv
      ),
      safeGet<{
        success: boolean;
        data: {
          actas: OficialActaItem[];
          total: number;
        };
      }>(`${DASHBOARD_ENDPOINTS.actasOficial}?limit=50`)
    ]);

    if (!rrvResult.ok && !ofiResult.ok) {
      throw new Error('No se pudo cargar actas digitalizadas: RRV y Oficial no responden.');
    }

    const rrvActas: ActaDigitalizada[] = rrvResult.ok
      ? rrvResult.data.actas || []
      : [];

    const ofiActas: ActaDigitalizada[] = ofiResult.ok
      ? (ofiResult.data.data.actas || []).map((item) => ({
          id: String(item.id),
          codigoActa: item.codigo_acta,
          codigoMesa: item.codigo_mesa || item.codigo_acta || 'SIN_MESA',
          recinto: item.recinto_nombre || 'Sin recinto',
          municipio: item.municipio || '-',
          departamento: item.departamento || '-',
          provincia: item.provincia,
          fuente: 'OFICIAL' as const,
          estado: item.estado as ActaDigitalizada['estado'],
          fecha: item.fecha_importacion || new Date().toISOString()
        }))
      : [];

    return [...rrvActas, ...ofiActas];
  },

  // ── Capa intermedia: ganador por alcance ──────────────────────

  async getGanador(scope: GanadorScope, codigo?: string): Promise<GanadorResponse> {
    const url =
      scope === 'nacional'        ? DASHBOARD_ENDPOINTS.ganadorNacional :
      scope === 'mesa'            ? DASHBOARD_ENDPOINTS.ganadorMesa(codigo!) :
      scope === 'recinto'         ? DASHBOARD_ENDPOINTS.ganadorRecinto(codigo!) :
      scope === 'municipio'       ? DASHBOARD_ENDPOINTS.ganadorMunicipio(codigo!) :
                                    DASHBOARD_ENDPOINTS.ganadorDepartamento(codigo!);

    if (scope !== 'nacional' && !codigo) {
      throw new Error(`Se requiere codigo para scope=${scope}`);
    }

    const response = await client.get<{
      success: boolean;
      message?: string;
      codigoError?: string;
      data: GanadorResponse | null;
    }>(url, { validateStatus: () => true });

    if (!response.data?.success) {
      const codErr = response.data?.codigoError || 'GANADOR_ERROR';
      const msg = response.data?.message || 'No se pudo obtener el ganador';
      const err = new Error(msg) as Error & { codigoError?: string };
      err.codigoError = codErr;
      throw err;
    }

    return response.data.data!;
  },

  // ── Capa intermedia: mapa de departamentos ────────────────────

  async getMapaDepartamentos(): Promise<MapaDepartamento[]> {
    const r = await safeGet<{
      success: boolean;
      data: { departamentos: MapaDepartamento[] };
    }>(DASHBOARD_ENDPOINTS.mapaDepartamentos);

    if (!r.ok) return [];
    return r.data?.data?.departamentos || [];
  }
};