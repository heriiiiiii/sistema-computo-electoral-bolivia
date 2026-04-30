export type FuenteDatos = 'RRV' | 'OFICIAL' | 'AMBOS';
export type ActaFuente = 'RRV' | 'OFICIAL';

export type EstadoRRV =
  | 'RECIBIDA'
  | 'PROCESANDO'
  | 'VALIDADA'
  | 'SOSPECHOSA'
  | 'RECHAZADA'
  | 'PUBLICADA'
  | 'PENDIENTE_REVISION';

export type EstadoOficial =
  | 'IMPORTADA'
  | 'VALIDANDO'
  | 'VALIDADA'
  | 'OBSERVADA'
  | 'RECHAZADA'
  | 'OFICIALIZADA';

export type EstadoActa = EstadoRRV | EstadoOficial;

export type EstadoComparacion =
  | 'COINCIDE'
  | 'DIFERENCIA_LEVE'
  | 'INCONSISTENCIA'
  | 'CRITICA';

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
  | 'CSV_INVALIDO';

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
  | 'RECINTO';

export type ClusterEstado = 'ACTIVO' | 'DEGRADADO' | 'CAIDO' | 'PROCESANDO';

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
  };
  oficial: {
    actasImportadas: number;
    actasValidadas: number;
    actasObservadas: number;
    actasRechazadas: number;
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
  estado: 'POSITIVO' | 'NEUTRO' | 'ALERTA' | 'CRITICO';
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
}

export interface GeograficoItem {
  id: string;
  nivel: NivelGeografico;
  nombre: string;
  departamento: string;
  provincia?: string;
  municipio?: string;
  recinto?: string;
  votosRRV: number;
  votosOficial: number;
  actasProcesadas: number;
  participacion: number;
  estadoComparacion: EstadoComparacion;
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
}

export interface ClusterStatus {
  id: string;
  cluster: string;
  motor: 'MongoDB' | 'PostgreSQL';
  nodo: string;
  rol: 'PRIMARY' | 'SECONDARY' | 'REPLICA' | 'READ_ONLY' | 'LEADER';
  estado: ClusterEstado;
  latenciaMs: number;
  ultimaVerificacion: string;
  observacion: string;
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