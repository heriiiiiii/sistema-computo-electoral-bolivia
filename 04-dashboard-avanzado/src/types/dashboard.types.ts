export type FuenteDatos = 'RRV' | 'OFICIAL' | 'AMBOS';
export type ActaFuente = 'RRV' | 'OFICIAL';

export type EstadoVisual = 'POSITIVO' | 'NEUTRO' | 'ALERTA' | 'CRITICO';

export type EstadoRRV =
  | 'RECIBIDA'
  | 'PROCESANDO'
  | 'VALIDADA'
  | 'SOSPECHOSA'
  | 'RECHAZADA'
  | 'PUBLICADA'
  | 'PENDIENTE_REVISION'
  | 'SIN_ESTADO';

export type EstadoOficial =
  | 'IMPORTADA'
  | 'VALIDANDO'
  | 'VALIDADA'
  | 'OBSERVADA'
  | 'RECHAZADA'
  | 'OFICIALIZADA'
  | 'PENDIENTE_COMPARACION'
  | 'CSV_DUPLICADO';

export type EstadoActa = EstadoRRV | EstadoOficial;

export type EstadoComparacion =
  | 'COINCIDE'
  | 'DIFERENCIA_LEVE'
  | 'INCONSISTENCIA'
  | 'CRITICA'
  | 'PENDIENTE_COMPARACION'
  | 'SIN_DATO';
export type OrigenInconsistencia =
  | 'RRV'
  | 'OFICIAL'
  | 'COMPARACION'
  | 'SMS'
  | 'OCR'
  | 'CSV'
  | 'SISTEMA';

export type TipoInconsistencia =
  | 'DUPLICADO'
  | 'DIFERENCIA_RESULTADOS'
  | 'DATOS_INCOMPLETOS'
  | 'MESA_INVALIDA'
  | 'TOTAL_INCOHERENTE'
  | 'SMS_NO_AUTORIZADO'
  | 'OCR_INCONFIABLE'
  | 'CSV_INVALIDO'
  | 'VALIDACION_OFICIAL';

export type SeveridadInconsistencia = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';

export type EstadoInconsistencia =
  | 'ABIERTA'
  | 'EN_REVISION'
  | 'RESUELTA'
  | 'DESCARTADA';

export type NivelGeografico =
  | 'DEPARTAMENTO'
  | 'PROVINCIA'
  | 'MUNICIPIO'
  | 'RECINTO'
  | 'MESA';

export type ClusterEstado =
  | 'ACTIVO'
  | 'DEGRADADO'
  | 'CAIDO'
  | 'PROCESANDO'
  | 'DESCONOCIDO';

export interface VotosResumen {
  votosValidos: number;
  votosBlancos: number;
  votosNulos: number;
  totalVotos: number;
}

export interface DashboardResumen {
  rrv: {
    actasRecibidas: number;
    actasProcesadas: number;
    actasValidadas: number;
    actasSospechosas: number;
    actasRechazadas: number;

    actasPendientes: number;
    actasNoPublicables: number;
    inconsistenciasAbiertas: number;
    incluidasDashboard: number;

    actasDuplicadas?: number;
    actasConErrorOCR?: number;
  };
  oficial: {
    actasImportadas: number;
    actasValidadas: number;
    actasObservadas: number;
    actasRechazadas: number;

    actasTotal?: number;
    actasOficializadas?: number;
  };
  votos: {
    rrv: VotosResumen;
    oficial: VotosResumen;
  };
  ultimaActualizacion: string;
}

export interface DashboardKpi {
  id: string;
  titulo: string;
  valor: string | number;
  descripcion: string;
  variacion?: number;
  estado: EstadoVisual;
}

export interface CandidateResult {
  partido: string;
  candidato: string;
  color: string;
  votosRRV: number;
  votosOficial: number;
}

export interface ComparacionResultado extends CandidateResult {
  diferencia: number;
  diferenciaPorcentual: number;
  estado: EstadoComparacion;
}

export interface ComparacionGeneral {
  totalVotosRRV: number;
  totalVotosOficial: number;
  diferenciaTotal: number;
  diferenciaPorcentualTotal: number;
  estado: EstadoComparacion;
  candidatos: ComparacionResultado[];

  margenVictoria?: number;
  fuenteMargenVictoria?: FuenteDatos;
  integracionOficial?: boolean;
  mensaje?: string;
}

export interface ActStatusCount {
  fuente: ActaFuente;
  estado: EstadoActa;
  cantidad: number;
}

export interface VoteTypeResult {
  tipo: 'VALIDOS' | 'BLANCOS' | 'NULOS';
  rrv: number;
  oficial: number;
}

export interface Inconsistencia {
  id: string;
  origen: OrigenInconsistencia;
  tipo: TipoInconsistencia;
  severidad: SeveridadInconsistencia;
  estado: EstadoInconsistencia;
  codigoMesa: string;
  departamento: string;
  municipio: string;
  descripcion: string;
  fecha: string;

  codigoActa?: string;
  provincia?: string;
  recinto?: string;
  regla?: string;
  fuenteRegla?: string;
}

export interface GeograficoItem {
  id: string;
  nivel: NivelGeografico;
  nombre: string;
  departamento: string;
  provincia?: string;
  municipio?: string;
  recinto?: string;
  codigoMesa?: string;

  votosRRV: number;
  votosOficial: number;
  actasProcesadas: number;
  participacion: number;
  estadoComparacion: EstadoComparacion;

  ganadorRRV?: string;
  ganadorOficial?: string;
  votosGanadorRRV?: number;
  votosGanadorOficial?: number;

  clasificacionTerritorial?: 'VALIDADA' | 'SIN_DEPARTAMENTO' | 'PENDIENTE_REVISION';
}

export interface MetricasTecnicas {
  latenciaPromedioMs: number;
  throughputPorMinuto: number;
  disponibilidadPorcentual: number;
  erroresUltimaHora: number;
  reintentosUltimaHora: number;
  smsInvalidos: number;
  numerosNoAutorizados: number;
  actasSospechosas: number;
  intentosDuplicados: number;

  latenciaEstado?: EstadoVisual;
  throughputEstado?: EstadoVisual;
  disponibilidadEstado?: EstadoVisual;
  erroresEstado?: EstadoVisual;
  reintentosEstado?: EstadoVisual;
  smsInvalidosEstado?: EstadoVisual;
  numerosNoAutorizadosEstado?: EstadoVisual;
  actasSospechosasEstado?: EstadoVisual;
  intentosDuplicadosEstado?: EstadoVisual;
}

export interface ClusterStatus {
  id: string;
  cluster: string;
  motor: 'MongoDB' | 'PostgreSQL';
  nodo: string;
rol: 'PRIMARY' | 'SECONDARY' | 'REPLICA' | 'READ_ONLY' | 'LEADER' | 'UNKNOWN';  estado: ClusterEstado;
  latenciaMs: number;
  ultimaVerificacion: string;
  observacion: string;
}

export interface EstadoInfraestructura {
  clustersActivos: number;
  clustersDegradados: number;
  clustersCaidos: number;
  clustersDesconocidos: number;
  estadoGeneral: ClusterEstado;
  disponibilidadInfraestructura?: number;
}

export interface ActaDigitalizada {
  id: string;
  codigoMesa: string;
  recinto: string;
  municipio: string;
  departamento: string;
  fuente: ActaFuente;
  estado: EstadoActa;
  fecha: string;

  codigoActa?: string;
  provincia?: string;
}

export interface ActasPorHora {
  hora: string;
  recibidas: number;
  procesadas: number;
  validadas: number;
}

export interface FilterOption {
  label: string;
  value: string;
}

// ── Capa intermedia /api/dashboard/* ──────────────────────────

export type GanadorScope = 'nacional' | 'departamento' | 'municipio' | 'recinto' | 'mesa';

export interface VotosPartidoOficial {
  codigo: string;
  nombre: string;
  votos: number;
  color: string;
}

export interface GanadorInfo {
  partido: string | null;
  nombre: string | null;
  votos: number;
  totalVotosScope: number;
  porcentaje: number;
  margenVotos: number;
  margenPorcentual: number;
  empate: boolean;
}

export interface GanadorResponse {
  scope: GanadorScope;
  codigo?: string;
  nombre?: string;
  ganador: GanadorInfo;
  totalVotos: number;
  actasComputadas: number;
  partidos: VotosPartidoOficial[];
}

export interface MapaDepartamento {
  codigo: string;
  nombre: string;
  actasComputadas: number;
  totalVotos: number;
  partidos: VotosPartidoOficial[];
  ganador: GanadorInfo;
}