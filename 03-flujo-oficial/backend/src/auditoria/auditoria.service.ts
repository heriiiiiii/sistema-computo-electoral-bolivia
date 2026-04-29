import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DB_POOL } from '../database/database.module';
import { dbQuery } from '../common/db.util';

@Injectable()
export class AuditoriaService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async log(
    entidad: string,
    entidadId: number,
    usuarioAccion: string,
    tipoAccion: string,
    detalle: string,
    ipOrigen: string = null,
    valorAnterior: any = null,
    valorNuevo: any = null,
  ) {
    await dbQuery(this.pool, `
      INSERT INTO auditoria_oficial
        (entidad, entidad_id, usuario_accion, tipo_accion, detalle, valor_anterior, valor_nuevo, ip_origen)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      entidad, entidadId, usuarioAccion || 'SISTEMA', tipoAccion, detalle,
      valorAnterior ? JSON.stringify(valorAnterior) : null,
      valorNuevo ? JSON.stringify(valorNuevo) : null,
      ipOrigen,
    ]);
  }

  async logValidacion(
    actaOficialId: number,
    regla: string,
    resultado: 'OK' | 'WARNING' | 'ERROR',
    mensaje: string,
    severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA',
    ejecutadoPor: string = 'SISTEMA',
  ) {
    await dbQuery(this.pool, `
      INSERT INTO validaciones_oficiales
        (acta_oficial_id, regla, resultado, mensaje, severidad, ejecutado_por)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [actaOficialId, regla, resultado, mensaje, severidad, ejecutadoPor]);
  }

  async logInconsistencia(
    codigoMesa: string,
    actaOficialId: number,
    tipo: string,
    descripcion: string,
    severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA',
    detectadoPor: string = 'SISTEMA',
  ) {
    await dbQuery(this.pool, `
      INSERT INTO inconsistencias
        (origen, codigo_mesa, acta_oficial_id, tipo, descripcion, severidad, estado, detectado_por)
      VALUES ('CSV', $1, $2, $3, $4, $5, 'ABIERTA', $6)
    `, [codigoMesa, actaOficialId, tipo, descripcion, severidad, detectadoPor]);
  }
}
