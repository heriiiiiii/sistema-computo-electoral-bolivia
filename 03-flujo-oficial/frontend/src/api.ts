const BASE = '/api';

export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T | null;
  codigoError?: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const json: ApiResponse<T> = await res.json();
  if (!json.success) throw new Error(`${json.codigoError || 'ERROR'}: ${json.message}`);
  return json.data as T;
}

export type Resumen = {
  actas: { total: number; porEstado: Record<string, number> };
  votos: { validos: number; blancos: number; nulos: number };
  porPartido: Array<{ codigo: string; nombre: string; total_votos: string }>;
  importaciones: Array<{ estado: string; total: string }>;
  inconsistencias: Array<{ severidad: string; estado: string; total: string }>;
  clusterStatus: Array<{
    cluster_nombre: string;
    motor: string;
    nodo: string;
    rol: string;
    estado: string;
    ultima_verificacion: string;
  }>;
};

export type Acta = {
  id: number;
  codigo_acta: string;
  franja: string;
  estado: string;
  votos_validos: number;
  votos_blancos: number;
  votos_nulos: number;
  total_votos: number;
  papeletas_en_anfora: number;
  papeletas_no_utilizadas: number;
  usuario_importacion: string;
  fecha_importacion: string;
  observacion: string | null;
  codigo_mesa: string;
  numero_mesa: number;
  codigo_recinto: string;
  recinto_nombre: string;
};

export const api = {
  getResumen: () => request<Resumen>('/oficial/resumen'),

  getActas: (limit = 50, offset = 0, estado?: string) => {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (estado) q.set('estado', estado);
    return request<{ actas: Acta[]; total: number }>(`/oficial/actas?${q}`);
  },

  bulkActas: (rows: any[], usuarioCarga = 'WEB_UI') =>
    request<{ total: number; validadas: number; observadas: number; erroresCriticos: number; errores: any[] }>(
      '/oficial/actas/bulk',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, usuarioCarga, ipOrigen: 'web-ui' }),
      },
    ),

  uploadCsv: (file: File, usuarioCarga = 'WEB_UI') => {
    const fd = new FormData();
    fd.append('archivo', file);
    fd.append('usuarioCarga', usuarioCarga);
    fd.append('ipOrigen', 'web-ui');
    return request<{ importacionId: number; total: number; validadas: number; observadas: number; erroresCriticos: number }>(
      '/oficial/csv',
      { method: 'POST', body: fd },
    );
  },
};
