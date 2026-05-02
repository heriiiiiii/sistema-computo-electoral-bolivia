import type {
  ActStatusCount,
  ActaDigitalizada,
  ActasPorHora,
  CandidateResult,
  ClusterStatus,
  ComparacionGeneral,
  DashboardKpi,
  DashboardResumen,
  GeograficoItem,
  Inconsistencia,
  MetricasTecnicas,
  VoteTypeResult
} from '../types/dashboard.types';

export const mockResumen: DashboardResumen = {
  rrv: {
    actasRecibidas: 35120,
    actasProcesadas: 35120,
    actasValidadas: 32680,
    actasSospechosas: 410,
    actasRechazadas: 95,
    actasPendientes: 1935,
    actasNoPublicables: 2440,
    inconsistenciasAbiertas: 2440,
    incluidasDashboard: 32680
  },
  oficial: {
    actasImportadas: 34890,
    actasValidadas: 33310,
    actasObservadas: 780,
    actasRechazadas: 120
  },
  votos: {
    rrv: {
      votosValidos: 3999500,
      votosBlancos: 65420,
      votosNulos: 48900,
      totalVotos: 4113820
    },
    oficial: {
      votosValidos: 3999270,
      votosBlancos: 65380,
      votosNulos: 48990,
      totalVotos: 4113640
    }
  },
  ultimaActualizacion: '2026-04-27T18:42:00-04:00'
};

export const mockDashboardKpis: DashboardKpi[] = [
  {
    id: 'participacion',
    titulo: 'Participación estimada',
    valor: '82.4%',
    descripcion: 'Participación nacional sobre mesas computadas',
    variacion: 1.8,
    estado: 'POSITIVO'
  },
  {
    id: 'confiabilidad',
    titulo: 'Confiabilidad RRV',
    valor: '95.6%',
    descripcion: 'Índice calculado por validación y alertas',
    variacion: 0.7,
    estado: 'POSITIVO'
  },
  {
    id: 'inconsistencias',
    titulo: 'Inconsistencias abiertas',
    valor: 64,
    descripcion: 'Casos pendientes de revisión operativa',
    variacion: -4.1,
    estado: 'ALERTA'
  },
  {
    id: 'latencia',
    titulo: 'Latencia promedio',
    valor: '184 ms',
    descripcion: 'Promedio general de servicios de lectura',
    variacion: -2.4,
    estado: 'POSITIVO'
  }
];

export const mockResultadosCandidatos: CandidateResult[] = [
  {
    partido: 'MNR',
    candidato: 'Ana Salvatierra',
    color: '#22c55e',
    votosRRV: 1245680,
    votosOficial: 1244950
  },
  {
    partido: 'FDC',
    candidato: 'Luis Aramayo',
    color: '#3b82f6',
    votosRRV: 1108420,
    votosOficial: 1109300
  },
  {
    partido: 'UPB',
    candidato: 'María Quispe',
    color: '#f59e0b',
    votosRRV: 934150,
    votosOficial: 933820
  },
  {
    partido: 'AV',
    candidato: 'Carlos Rojas',
    color: '#14b8a6',
    votosRRV: 512730,
    votosOficial: 512790
  },
  {
    partido: 'IN',
    candidato: 'Gabriel Paredes',
    color: '#a855f7',
    votosRRV: 198520,
    votosOficial: 198410
  }
];

export const mockComparacion: ComparacionGeneral = {
  totalVotosRRV: 4113820,
  totalVotosOficial: 4113640,
  diferenciaTotal: 180,
  diferenciaPorcentualTotal: 0.0044,
  estado: 'COINCIDE',
  candidatos: [
    {
      partido: 'MNR',
      candidato: 'Ana Salvatierra',
      color: '#22c55e',
      votosRRV: 1245680,
      votosOficial: 1244950,
      diferencia: 730,
      diferenciaPorcentual: 0.0586,
      estado: 'DIFERENCIA_LEVE'
    },
    {
      partido: 'FDC',
      candidato: 'Luis Aramayo',
      color: '#3b82f6',
      votosRRV: 1108420,
      votosOficial: 1109300,
      diferencia: 880,
      diferenciaPorcentual: 0.0793,
      estado: 'DIFERENCIA_LEVE'
    },
    {
      partido: 'UPB',
      candidato: 'María Quispe',
      color: '#f59e0b',
      votosRRV: 934150,
      votosOficial: 933820,
      diferencia: 330,
      diferenciaPorcentual: 0.0353,
      estado: 'COINCIDE'
    },
    {
      partido: 'AV',
      candidato: 'Carlos Rojas',
      color: '#14b8a6',
      votosRRV: 512730,
      votosOficial: 512790,
      diferencia: 60,
      diferenciaPorcentual: 0.0117,
      estado: 'COINCIDE'
    },
    {
      partido: 'IN',
      candidato: 'Gabriel Paredes',
      color: '#a855f7',
      votosRRV: 198520,
      votosOficial: 198410,
      diferencia: 110,
      diferenciaPorcentual: 0.0554,
      estado: 'COINCIDE'
    }
  ]
};

export const mockEstadoActas: ActStatusCount[] = [
  { fuente: 'RRV', estado: 'RECIBIDA', cantidad: 1180 },
  { fuente: 'RRV', estado: 'PROCESANDO', cantidad: 770 },
  { fuente: 'RRV', estado: 'VALIDADA', cantidad: 32680 },
  { fuente: 'RRV', estado: 'SOSPECHOSA', cantidad: 410 },
  { fuente: 'RRV', estado: 'RECHAZADA', cantidad: 95 },
  { fuente: 'RRV', estado: 'PUBLICADA', cantidad: 31240 },
  { fuente: 'RRV', estado: 'PENDIENTE_REVISION', cantidad: 285 },
  { fuente: 'OFICIAL', estado: 'IMPORTADA', cantidad: 34890 },
  { fuente: 'OFICIAL', estado: 'VALIDANDO', cantidad: 680 },
  { fuente: 'OFICIAL', estado: 'VALIDADA', cantidad: 33310 },
  { fuente: 'OFICIAL', estado: 'OBSERVADA', cantidad: 780 },
  { fuente: 'OFICIAL', estado: 'RECHAZADA', cantidad: 120 },
  { fuente: 'OFICIAL', estado: 'OFICIALIZADA', cantidad: 31980 }
];

export const mockVoteTypes: VoteTypeResult[] = [
  {
    tipo: 'VALIDOS',
    rrv: 3999500,
    oficial: 3999270
  },
  {
    tipo: 'BLANCOS',
    rrv: 65420,
    oficial: 65380
  },
  {
    tipo: 'NULOS',
    rrv: 48900,
    oficial: 48990
  }
];

export const mockInconsistencias: Inconsistencia[] = [
  {
    id: 'INC-0001',
    origen: 'COMPARACION',
    tipo: 'DIFERENCIA_RESULTADOS',
    severidad: 'MEDIA',
    estado: 'ABIERTA',
    codigoMesa: 'LP-001245',
    departamento: 'La Paz',
    municipio: 'La Paz',
    descripcion: 'Diferencia leve entre votos RRV y oficial para una candidatura.',
    fecha: '2026-04-27T17:50:00-04:00'
  },
  {
    id: 'INC-0002',
    origen: 'RRV',
    tipo: 'TOTAL_INCOHERENTE',
    severidad: 'ALTA',
    estado: 'EN_REVISION',
    codigoMesa: 'CB-002184',
    departamento: 'Cochabamba',
    municipio: 'Sacaba',
    descripcion: 'El total registrado no coincide con suma de votos válidos, blancos y nulos.',
    fecha: '2026-04-27T17:28:00-04:00'
  },
  {
    id: 'INC-0003',
    origen: 'OFICIAL',
    tipo: 'DATOS_INCOMPLETOS',
    severidad: 'BAJA',
    estado: 'ABIERTA',
    codigoMesa: 'SC-004512',
    departamento: 'Santa Cruz',
    municipio: 'Montero',
    descripcion: 'Registro oficial importado sin dato completo de recinto.',
    fecha: '2026-04-27T16:58:00-04:00'
  },
  {
    id: 'INC-0004',
    origen: 'SISTEMA',
    tipo: 'DUPLICADO',
    severidad: 'MEDIA',
    estado: 'RESUELTA',
    codigoMesa: 'OR-000884',
    departamento: 'Oruro',
    municipio: 'Oruro',
    descripcion: 'Intento duplicado detectado y descartado por control de integridad.',
    fecha: '2026-04-27T16:30:00-04:00'
  },
  {
    id: 'INC-0005',
    origen: 'SMS',
    tipo: 'SMS_NO_AUTORIZADO',
    severidad: 'CRITICA',
    estado: 'EN_REVISION',
    codigoMesa: 'PT-000742',
    departamento: 'Potosí',
    municipio: 'Uyuni',
    descripcion: 'Número no autorizado intentó reportar datos para una mesa.',
    fecha: '2026-04-27T15:52:00-04:00'
  },
  {
    id: 'INC-0006',
    origen: 'OCR',
    tipo: 'OCR_INCONFIABLE',
    severidad: 'ALTA',
    estado: 'DESCARTADA',
    codigoMesa: 'TJ-001012',
    departamento: 'Tarija',
    municipio: 'Tarija',
    descripcion: 'Lectura OCR marcada como no confiable por baja calidad visual.',
    fecha: '2026-04-27T15:19:00-04:00'
  },
  {
    id: 'INC-0007',
    origen: 'CSV',
    tipo: 'CSV_INVALIDO',
    severidad: 'MEDIA',
    estado: 'ABIERTA',
    codigoMesa: 'BN-000341',
    departamento: 'Beni',
    municipio: 'Trinidad',
    descripcion: 'Archivo de referencia externo con estructura inválida reportada por backend.',
    fecha: '2026-04-27T14:44:00-04:00'
  }
];

export const mockGeografico: GeograficoItem[] = [
  {
    id: 'GEO-01',
    nivel: 'DEPARTAMENTO',
    nombre: 'La Paz',
    departamento: 'La Paz',
    votosRRV: 982400,
    votosOficial: 982180,
    actasProcesadas: 8120,
    participacion: 83.2,
    estadoComparacion: 'COINCIDE'
  },
  {
    id: 'GEO-02',
    nivel: 'DEPARTAMENTO',
    nombre: 'Santa Cruz',
    departamento: 'Santa Cruz',
    votosRRV: 1052410,
    votosOficial: 1052820,
    actasProcesadas: 8610,
    participacion: 81.5,
    estadoComparacion: 'DIFERENCIA_LEVE'
  },
  {
    id: 'GEO-03',
    nivel: 'DEPARTAMENTO',
    nombre: 'Cochabamba',
    departamento: 'Cochabamba',
    votosRRV: 685300,
    votosOficial: 685110,
    actasProcesadas: 5120,
    participacion: 84.1,
    estadoComparacion: 'COINCIDE'
  },
  {
    id: 'GEO-04',
    nivel: 'MUNICIPIO',
    nombre: 'El Alto',
    departamento: 'La Paz',
    provincia: 'Murillo',
    municipio: 'El Alto',
    votosRRV: 412780,
    votosOficial: 412500,
    actasProcesadas: 3188,
    participacion: 85.7,
    estadoComparacion: 'DIFERENCIA_LEVE'
  },
  {
    id: 'GEO-05',
    nivel: 'MUNICIPIO',
    nombre: 'Sacaba',
    departamento: 'Cochabamba',
    provincia: 'Chapare',
    municipio: 'Sacaba',
    votosRRV: 118450,
    votosOficial: 118120,
    actasProcesadas: 790,
    participacion: 82.9,
    estadoComparacion: 'INCONSISTENCIA'
  },
  {
    id: 'GEO-06',
    nivel: 'PROVINCIA',
    nombre: 'Andrés Ibáñez',
    departamento: 'Santa Cruz',
    provincia: 'Andrés Ibáñez',
    votosRRV: 633900,
    votosOficial: 634070,
    actasProcesadas: 4820,
    participacion: 80.8,
    estadoComparacion: 'COINCIDE'
  },
  {
    id: 'GEO-07',
    nivel: 'RECINTO',
    nombre: 'Unidad Educativa Bolivia',
    departamento: 'La Paz',
    provincia: 'Murillo',
    municipio: 'La Paz',
    recinto: 'Unidad Educativa Bolivia',
    votosRRV: 18420,
    votosOficial: 18415,
    actasProcesadas: 128,
    participacion: 86.4,
    estadoComparacion: 'COINCIDE'
  },
  {
    id: 'GEO-08',
    nivel: 'RECINTO',
    nombre: 'Colegio Nacional Junín',
    departamento: 'Chuquisaca',
    provincia: 'Oropeza',
    municipio: 'Sucre',
    recinto: 'Colegio Nacional Junín',
    votosRRV: 13980,
    votosOficial: 13870,
    actasProcesadas: 96,
    participacion: 79.6,
    estadoComparacion: 'DIFERENCIA_LEVE'
  }
];

export const mockMetricasTecnicas: MetricasTecnicas = {
  latenciaPromedioMs: 184,
  throughputPorMinuto: 1280,
  disponibilidadPorcentual: 99.82,
  erroresUltimaHora: 7,
  reintentosUltimaHora: 42,
  smsInvalidos: 18,
  numerosNoAutorizados: 9,
  actasSospechosas: 410,
  intentosDuplicados: 23
};

export const mockEstadoClusters: ClusterStatus[] = [
  {
    id: 'CL-01',
    cluster: 'RRV-NoSQL / MongoDB',
    motor: 'MongoDB',
    nodo: 'mongo-rrv-primary-01',
    rol: 'PRIMARY',
    estado: 'ACTIVO',
    latenciaMs: 82,
    ultimaVerificacion: '2026-04-27T18:41:00-04:00',
    observacion: 'Nodo primario operativo con replicación estable.'
  },
  {
    id: 'CL-02',
    cluster: 'RRV-NoSQL / MongoDB',
    motor: 'MongoDB',
    nodo: 'mongo-rrv-secondary-02',
    rol: 'SECONDARY',
    estado: 'ACTIVO',
    latenciaMs: 94,
    ultimaVerificacion: '2026-04-27T18:41:00-04:00',
    observacion: 'Nodo secundario sincronizado.'
  },
  {
    id: 'CL-03',
    cluster: 'Oficial-Relacional / PostgreSQL',
    motor: 'PostgreSQL',
    nodo: 'pg-oficial-leader-01',
    rol: 'LEADER',
    estado: 'ACTIVO',
    latenciaMs: 106,
    ultimaVerificacion: '2026-04-27T18:40:00-04:00',
    observacion: 'Nodo líder disponible para lecturas controladas.'
  },
  {
    id: 'CL-04',
    cluster: 'Oficial-Relacional / PostgreSQL',
    motor: 'PostgreSQL',
    nodo: 'pg-oficial-replica-02',
    rol: 'REPLICA',
    estado: 'DEGRADADO',
    latenciaMs: 246,
    ultimaVerificacion: '2026-04-27T18:40:00-04:00',
    observacion: 'Latencia elevada, pero servicio disponible.'
  }
];

export const mockActasDigitalizadas: ActaDigitalizada[] = [
  {
    id: 'ACTA-000001',
    codigoMesa: 'LP-001245',
    recinto: 'Unidad Educativa Bolivia',
    municipio: 'La Paz',
    departamento: 'La Paz',
    fuente: 'RRV',
    estado: 'VALIDADA',
    fecha: '2026-04-27T17:42:00-04:00'
  },
  {
    id: 'ACTA-000002',
    codigoMesa: 'SC-004512',
    recinto: 'Colegio Cristo Rey',
    municipio: 'Montero',
    departamento: 'Santa Cruz',
    fuente: 'OFICIAL',
    estado: 'OBSERVADA',
    fecha: '2026-04-27T17:31:00-04:00'
  },
  {
    id: 'ACTA-000003',
    codigoMesa: 'CB-002184',
    recinto: 'Escuela Simón Rodríguez',
    municipio: 'Sacaba',
    departamento: 'Cochabamba',
    fuente: 'RRV',
    estado: 'SOSPECHOSA',
    fecha: '2026-04-27T17:18:00-04:00'
  },
  {
    id: 'ACTA-000004',
    codigoMesa: 'OR-000884',
    recinto: 'Colegio Nacional Bolívar',
    municipio: 'Oruro',
    departamento: 'Oruro',
    fuente: 'RRV',
    estado: 'PUBLICADA',
    fecha: '2026-04-27T16:55:00-04:00'
  },
  {
    id: 'ACTA-000005',
    codigoMesa: 'PT-000742',
    recinto: 'Unidad Educativa Uyuni',
    municipio: 'Uyuni',
    departamento: 'Potosí',
    fuente: 'OFICIAL',
    estado: 'VALIDANDO',
    fecha: '2026-04-27T16:20:00-04:00'
  },
  {
    id: 'ACTA-000006',
    codigoMesa: 'TJ-001012',
    recinto: 'Colegio San Bernardo',
    municipio: 'Tarija',
    departamento: 'Tarija',
    fuente: 'RRV',
    estado: 'PENDIENTE_REVISION',
    fecha: '2026-04-27T15:58:00-04:00'
  },
  {
    id: 'ACTA-000007',
    codigoMesa: 'CH-000501',
    recinto: 'Colegio Nacional Junín',
    municipio: 'Sucre',
    departamento: 'Chuquisaca',
    fuente: 'OFICIAL',
    estado: 'OFICIALIZADA',
    fecha: '2026-04-27T15:40:00-04:00'
  },
  {
    id: 'ACTA-000008',
    codigoMesa: 'BN-000341',
    recinto: 'Unidad Educativa Germán Busch',
    municipio: 'Trinidad',
    departamento: 'Beni',
    fuente: 'RRV',
    estado: 'RECHAZADA',
    fecha: '2026-04-27T14:59:00-04:00'
  }
];

export const mockActasPorHora: ActasPorHora[] = [
  { hora: '09:00', recibidas: 1200, procesadas: 880, validadas: 720 },
  { hora: '10:00', recibidas: 3150, procesadas: 2600, validadas: 2380 },
  { hora: '11:00', recibidas: 6900, procesadas: 6100, validadas: 5780 },
  { hora: '12:00', recibidas: 11240, procesadas: 10180, validadas: 9560 },
  { hora: '13:00', recibidas: 16900, procesadas: 15420, validadas: 14770 },
  { hora: '14:00', recibidas: 22400, procesadas: 20880, validadas: 19990 },
  { hora: '15:00', recibidas: 28100, procesadas: 26540, validadas: 25320 },
  { hora: '16:00', recibidas: 31880, procesadas: 30340, validadas: 29080 },
  { hora: '17:00', recibidas: 34200, procesadas: 32980, validadas: 31520 },
  { hora: '18:00', recibidas: 35120, procesadas: 33940, validadas: 32680 }
];