import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = process.env.LOGS_DIR || path.resolve(process.cwd(), '../logs');

@Injectable()
export class LogService {
  constructor() {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    } catch {
      // ignore — el volumen lo crea Docker
    }
  }

  private filePath(prefix: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(LOG_DIR, `${prefix}-${today}.log`);
  }

  private write(prefix: string, payload: Record<string, any>) {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...payload }) + '\n';
    try {
      fs.appendFileSync(this.filePath(prefix), line, 'utf8');
    } catch (e) {
      console.error(`[LogService] failed to write ${prefix}:`, (e as Error).message);
    }
  }

  inconsistencia(payload: {
    codigoMesa?: string;
    actaOficialId?: number | null;
    tipo: string;
    mensaje: string;
    severidad: string;
    contexto?: any;
  }) {
    this.write('inconsistencias', payload);
  }

  cargaError(payload: {
    archivo?: string;
    fila?: number | string;
    motivo: string;
    detalle?: any;
  }) {
    this.write('carga-errores', payload);
  }

  encoding(payload: { archivo: string; campo: string; valorOriginal: string; nota: string }) {
    this.write('encoding', payload);
  }
}
