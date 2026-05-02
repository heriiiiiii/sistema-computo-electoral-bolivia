import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente HTTP hacia el backend RRV (FastAPI).
 *
 * El backend oficial NO debe leer la base de datos del RRV (Mongo).
 * Solo consume sus endpoints públicos /api/rrv/dashboard/*.
 *
 * Endpoint base por env: RRV_API_URL (default http://localhost:4001)
 */
@Injectable()
export class RrvClient {
  private readonly log = new Logger('RrvClient');
  private readonly base = (process.env.RRV_API_URL || 'http://localhost:4001').replace(/\/$/, '');
  private readonly timeoutMs = 5000;

  private async getJson<T>(path: string): Promise<T | null> {
    const url = `${this.base}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        this.log.warn(`${path} respondio ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (e: any) {
      this.log.warn(`fallo ${url}: ${e?.message || e}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  resumen() {
    return this.getJson<{
      success: boolean;
      totalVotos?: number;
      votosValidos?: number;
      votosBlancos?: number;
      votosNulos?: number;
      actasRecibidas?: number;
      actasValidadas?: number;
      actasSospechosas?: number;
      actasRechazadas?: number;
      actasPendientes?: number;
      ultimaActualizacion?: string;
    }>('/api/rrv/dashboard/resumen');
  }

  resultadosCandidatos() {
    return this.getJson<{
      success: boolean;
      candidatos: Array<{
        partidoCodigo: string;
        partidoNombre: string;
        totalVotos: number;
        color?: string;
      }>;
    }>('/api/rrv/dashboard/resultados-candidatos');
  }

  inconsistencias(limit = 50) {
    return this.getJson<{
      success: boolean;
      total: number;
      inconsistencias: any[];
    }>(`/api/rrv/dashboard/inconsistencias?limit=${limit}`);
  }

  geografico() {
    return this.getJson<{
      success: boolean;
      items: Array<{
        nombre: string;
        departamento: string;
        votosRRV: number;
        actasProcesadas: number;
        participacion: number;
      }>;
    }>('/api/rrv/dashboard/geografico');
  }

  health() {
    return this.getJson<any>('/api/rrv/health');
  }
}
