import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import { DB_POOL } from '../database/database.module';
import { dbQuery } from '../common/db.util';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ValidacionService } from './validacion.service';

const FRANJA_DEFAULT = 'PRESIDENTE';

@Injectable()
export class OficialService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly auditoria: AuditoriaService,
    private readonly validacion: ValidacionService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private n(v: any): number {
    const parsed = Number(v);
    return isNaN(parsed) ? 0 : parsed;
  }

  private async getParties(): Promise<Map<string, number>> {
    const r = await dbQuery(this.pool, 'SELECT id, codigo FROM partidos ORDER BY codigo');
    return new Map(r.rows.map(p => [p.codigo as string, p.id as number]));
  }

  // ── CSV File Import ───────────────────────────────────────────────────────────

  async importCsv(
    fileBuffer: Buffer,
    filename: string,
    usuarioCarga: string,
    ipOrigen: string,
  ) {
    const hashArchivo = createHash('sha256').update(fileBuffer).digest('hex');

    const existing = await dbQuery(this.pool,
      'SELECT id FROM csv_importaciones WHERE hash_archivo = $1',
      [hashArchivo],
    );
    if (existing.rows.length > 0) {
      return { skipped: true, reason: 'CSV already imported', importacionId: existing.rows[0].id };
    }

    const importRes = await dbQuery(this.pool,
      `INSERT INTO csv_importaciones
         (nombre_archivo, hash_archivo, tipo_importacion, usuario_carga, ip_origen, estado, total_filas)
       VALUES ($1, $2, 'RESULTADOS_OFICIALES', $3, $4, 'PROCESANDO', 0)
       RETURNING id`,
      [filename, hashArchivo, usuarioCarga || 'SISTEMA', ipOrigen || ''],
    );
    const importacionId: number = importRes.rows[0].id;

    let rows: any[];
    try {
      // Decode buffer as latin1 (CSVs use latin1 encoding with accented chars)
      const csvText = fileBuffer.toString('latin1');
      rows = csvParse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });
    } catch (e) {
      await dbQuery(this.pool,
        `UPDATE csv_importaciones SET estado = 'FALLIDO', observacion = $1 WHERE id = $2`,
        [e.message, importacionId],
      );
      throw new Error(`CSV parse error: ${e.message}`);
    }

    const normalizedRows = rows.map(r => ({
      codigoRecinto: String(r.CodigoRecinto || '').trim(),
      nroMesa: this.n(r.NroMesa),
      codigoActaCsv: String(r.CodigoActa || '').trim(),
      votantesHabilitados: this.n(r.VotantesHabilitados),
      papeletasAnfora: this.n(r.PapeletasAnfora),
      papeletasNoUtilizadas: this.n(r.PapeltasNoUtilizadas || r.PapeletasNoUtilizadas),
      p1: this.n(r.P1), p2: this.n(r.P2), p3: this.n(r.P3), p4: this.n(r.P4),
      votosValidos: this.n(r.VotosValidos),
      votosBlancos: this.n(r.VotosBlancos),
      votosNulos: this.n(r.VotosNulos),
      observaciones: String(r.Observaciones || '').trim(),
      aperturaHora: this.n(r.AperturaHora), aperturaMinutos: this.n(r.AperturaMinutos),
      cierreHora: this.n(r.CierreHora), cierreMinutos: this.n(r.CierreMinutos),
    }));

    const result = await this.bulkActas({
      rows: normalizedRows,
      franja: FRANJA_DEFAULT,
      usuarioCarga,
      ipOrigen,
      importacionId,
    });

    const estado = result.erroresCriticos > 0 ? 'COMPLETADO_CON_ERRORES' : 'COMPLETADO';
    await dbQuery(this.pool,
      `UPDATE csv_importaciones
       SET estado = $1, total_filas = $2, filas_validas = $3, filas_invalidas = $4, observacion = $5
       WHERE id = $6`,
      [estado, normalizedRows.length, result.validadas + result.observadas, result.erroresCriticos,
       result.erroresCriticos > 0 ? `${result.erroresCriticos} rows failed` : null,
       importacionId],
    );

    await this.auditoria.log('csv_importaciones', importacionId, usuarioCarga, 'CSV_IMPORT',
      `Imported ${filename}: ${result.validadas} validated, ${result.observadas} observed, ${result.erroresCriticos} failed`,
      ipOrigen);

    return { importacionId, ...result };
  }

  // ── Bulk Actas ────────────────────────────────────────────────────────────────

  async bulkActas(payload: {
    rows: any[];
    franja?: string;
    usuarioCarga?: string;
    ipOrigen?: string;
    importacionId?: number;
  }) {
    const franja = payload.franja || FRANJA_DEFAULT;
    const result = { total: payload.rows.length, validadas: 0, observadas: 0, erroresCriticos: 0, errores: [] as any[] };

    const parties = await this.getParties();
    if (parties.size === 0) {
      throw new Error('No parties found in DB. Run module 01 seed first.');
    }

    for (const row of payload.rows) {
      try {
        const estado = await this.processActa(row, franja, parties, payload.usuarioCarga, payload.ipOrigen, payload.importacionId);
        if (estado === 'VALIDADA') result.validadas++;
        else result.observadas++;
      } catch (e) {
        result.erroresCriticos++;
        result.errores.push({ row: `${row.codigoRecinto}-${row.nroMesa}`, error: e.message });
      }
    }

    return result;
  }

  private async processActa(
    row: any,
    franja: string,
    parties: Map<string, number>,
    usuarioCarga: string,
    ipOrigen: string,
    importacionId: number,
  ): Promise<string> {
    const codigoRecinto = String(row.codigoRecinto || '').trim();
    const nroMesa = this.n(row.nroMesa);
    const codigoMesa = `${codigoRecinto}-${nroMesa}`;

    const mesaRes = await dbQuery(this.pool,
      'SELECT id, cantidad_habilitada FROM mesas WHERE codigo_mesa = $1',
      [codigoMesa],
    );
    if (mesaRes.rows.length === 0) throw new Error(`Mesa ${codigoMesa} not found`);

    const mesaId: number = mesaRes.rows[0].id;
    const codigoActa = `OF-${codigoRecinto}-${nroMesa}-${franja}`;

    const voteData = {
      p1: this.n(row.p1), p2: this.n(row.p2), p3: this.n(row.p3), p4: this.n(row.p4),
      votosValidos: this.n(row.votosValidos),
      votosBlancos: this.n(row.votosBlancos),
      votosNulos: this.n(row.votosNulos),
      papeletasAnfora: this.n(row.papeletasAnfora),
      papeletasNoUtilizadas: this.n(row.papeletasNoUtilizadas),
      habilitados: this.n(row.votantesHabilitados),
    };

    const validaciones = this.validacion.validate(voteData);
    const hasErrors = validaciones.some(v => v.resultado === 'ERROR');
    const estado = hasErrors ? 'OBSERVADA' : 'VALIDADA';

    const totalVotos = Math.max(0, voteData.votosValidos) + Math.max(0, voteData.votosBlancos) + Math.max(0, voteData.votosNulos);

    const actaRes = await dbQuery(this.pool,
      `INSERT INTO actas_oficiales
         (mesa_id, csv_importacion_id, codigo_acta, franja,
          votos_validos, votos_blancos, votos_nulos, total_votos,
          papeletas_en_anfora, papeletas_no_utilizadas,
          estado, fuente, usuario_importacion, observacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'CSV',$12,$13)
       ON CONFLICT (codigo_acta) DO UPDATE SET
         estado = EXCLUDED.estado,
         votos_validos = EXCLUDED.votos_validos,
         votos_blancos = EXCLUDED.votos_blancos,
         votos_nulos = EXCLUDED.votos_nulos,
         total_votos = EXCLUDED.total_votos,
         papeletas_en_anfora = EXCLUDED.papeletas_en_anfora,
         papeletas_no_utilizadas = EXCLUDED.papeletas_no_utilizadas,
         observacion = EXCLUDED.observacion
       RETURNING id`,
      [
        mesaId, importacionId || null, codigoActa, franja,
        Math.max(0, voteData.votosValidos),
        Math.max(0, voteData.votosBlancos),
        Math.max(0, voteData.votosNulos),
        totalVotos,
        Math.max(0, voteData.papeletasAnfora),
        Math.max(0, voteData.papeletasNoUtilizadas),
        estado,
        usuarioCarga || 'SISTEMA',
        row.observaciones || null,
      ],
    );
    const actaId: number = actaRes.rows[0].id;

    // Insert one resultados_oficiales row per party
    for (const [code, partyId] of parties.entries()) {
      const votos = Math.max(0, this.n(row[code.toLowerCase()]));
      await dbQuery(this.pool,
        `INSERT INTO resultados_oficiales (acta_oficial_id, partido_id, franja, cantidad_votos)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (acta_oficial_id, partido_id, franja)
         DO UPDATE SET cantidad_votos = EXCLUDED.cantidad_votos`,
        [actaId, partyId, franja, votos],
      );
    }

    // Validaciones
    for (const v of validaciones) {
      await this.auditoria.logValidacion(actaId, v.regla, v.resultado, v.mensaje, v.severidad);
    }

    // Inconsistencias para errores criticos
    const errorVals = validaciones.filter(v => v.resultado === 'ERROR');
    for (const v of errorVals) {
      await this.auditoria.logInconsistencia(codigoMesa, actaId, v.regla, v.mensaje, v.severidad);
    }

    // Auditoria
    await this.auditoria.log('actas_oficiales', actaId, usuarioCarga, 'IMPORTAR_ACTA',
      `Acta ${codigoActa} estado=${estado}`, ipOrigen);

    return estado;
  }

  // ── Queries ───────────────────────────────────────────────────────────────────

  async getActas(limit = 100, offset = 0, estado?: string) {
    const params: any[] = [limit, offset];
    const where = estado ? `WHERE ao.estado = $3` : '';
    if (estado) params.push(estado);

    const r = await dbQuery(this.pool, `
      SELECT ao.id, ao.codigo_acta, ao.franja, ao.estado,
             ao.votos_validos, ao.votos_blancos, ao.votos_nulos, ao.total_votos,
             ao.papeletas_en_anfora, ao.papeletas_no_utilizadas,
             ao.usuario_importacion, ao.fecha_importacion, ao.observacion,
             m.codigo_mesa, m.numero_mesa,
             r.codigo_recinto, r.nombre AS recinto_nombre
      FROM actas_oficiales ao
      JOIN mesas m ON m.id = ao.mesa_id
      JOIN recintos r ON r.id = m.recinto_id
      ${where}
      ORDER BY ao.fecha_importacion DESC
      LIMIT $1 OFFSET $2
    `, params);

    const count = await dbQuery(this.pool,
      `SELECT COUNT(*) FROM actas_oficiales ${estado ? "WHERE estado = $1" : ""}`,
      estado ? [estado] : [],
    );

    return { actas: r.rows, total: parseInt(count.rows[0].count) };
  }

  async getActa(id: number) {
    const actaRes = await dbQuery(this.pool, `
      SELECT ao.*, m.codigo_mesa, m.numero_mesa, r.codigo_recinto, r.nombre AS recinto_nombre
      FROM actas_oficiales ao
      JOIN mesas m ON m.id = ao.mesa_id
      JOIN recintos r ON r.id = m.recinto_id
      WHERE ao.id = $1
    `, [id]);

    if (actaRes.rows.length === 0) return null;

    const resultados = await dbQuery(this.pool, `
      SELECT ro.cantidad_votos, p.codigo AS partido, p.nombre AS partido_nombre
      FROM resultados_oficiales ro
      JOIN partidos p ON p.id = ro.partido_id
      WHERE ro.acta_oficial_id = $1
      ORDER BY p.codigo
    `, [id]);

    const validaciones = await dbQuery(this.pool, `
      SELECT regla, resultado, mensaje, severidad, fecha_validacion
      FROM validaciones_oficiales
      WHERE acta_oficial_id = $1
      ORDER BY fecha_validacion
    `, [id]);

    return {
      ...actaRes.rows[0],
      resultados: resultados.rows,
      validaciones: validaciones.rows,
    };
  }

  async getImportaciones() {
    const r = await dbQuery(this.pool, `
      SELECT id, nombre_archivo, tipo_importacion, usuario_carga, fecha_carga,
             total_filas, filas_validas, filas_invalidas, estado, observacion
      FROM csv_importaciones
      ORDER BY fecha_carga DESC
      LIMIT 100
    `);
    return r.rows;
  }

  async getAuditoria(limit = 100) {
    const r = await dbQuery(this.pool, `
      SELECT id, entidad, entidad_id, usuario_accion, tipo_accion, detalle,
             ip_origen, fecha_hora
      FROM auditoria_oficial
      ORDER BY fecha_hora DESC
      LIMIT $1
    `, [limit]);
    return r.rows;
  }

  async getValidaciones(actaId?: number) {
    const where = actaId ? 'WHERE acta_oficial_id = $1' : '';
    const params = actaId ? [actaId] : [];
    const r = await dbQuery(this.pool, `
      SELECT vo.id, vo.acta_oficial_id, ao.codigo_acta,
             vo.regla, vo.resultado, vo.mensaje, vo.severidad, vo.fecha_validacion
      FROM validaciones_oficiales vo
      JOIN actas_oficiales ao ON ao.id = vo.acta_oficial_id
      ${where}
      ORDER BY vo.fecha_validacion DESC
      LIMIT 500
    `, params);
    return r.rows;
  }

  async getResumen() {
    const [actas, importaciones, inconsistencias, partidos, clusterStatus] = await Promise.all([
      dbQuery(this.pool, `
        SELECT estado, COUNT(*) AS total
        FROM actas_oficiales
        GROUP BY estado
        ORDER BY estado
      `),
      dbQuery(this.pool, `
        SELECT estado, COUNT(*) AS total FROM csv_importaciones GROUP BY estado
      `),
      dbQuery(this.pool, `
        SELECT severidad, estado, COUNT(*) AS total
        FROM inconsistencias WHERE origen = 'CSV'
        GROUP BY severidad, estado
      `),
      dbQuery(this.pool, `
        SELECT p.codigo, p.nombre, SUM(ro.cantidad_votos) AS total_votos
        FROM resultados_oficiales ro
        JOIN partidos p ON p.id = ro.partido_id
        GROUP BY p.id, p.codigo, p.nombre
        ORDER BY total_votos DESC
      `),
      dbQuery(this.pool, `
        SELECT cluster_nombre, motor, nodo, rol, estado, ultima_verificacion
        FROM cluster_status
        ORDER BY motor, rol
      `),
    ]);

    const totalesActas = actas.rows.reduce((acc, r) => { acc[r.estado] = parseInt(r.total); return acc; }, {} as any);
    const totalActas = Object.values(totalesActas).reduce((a: any, b: any) => a + b, 0);

    const votosValidos = await dbQuery(this.pool,
      'SELECT SUM(votos_validos) AS total FROM actas_oficiales WHERE estado IN (\'VALIDADA\',\'OFICIALIZADA\')'
    );
    const votosBlancos = await dbQuery(this.pool,
      'SELECT SUM(votos_blancos) AS total FROM actas_oficiales WHERE estado IN (\'VALIDADA\',\'OFICIALIZADA\')'
    );
    const votosNulos = await dbQuery(this.pool,
      'SELECT SUM(votos_nulos) AS total FROM actas_oficiales WHERE estado IN (\'VALIDADA\',\'OFICIALIZADA\')'
    );

    return {
      actas: {
        total: totalActas,
        porEstado: totalesActas,
      },
      votos: {
        validos: parseInt(votosValidos.rows[0].total) || 0,
        blancos: parseInt(votosBlancos.rows[0].total) || 0,
        nulos: parseInt(votosNulos.rows[0].total) || 0,
      },
      porPartido: partidos.rows,
      importaciones: importaciones.rows,
      inconsistencias: inconsistencias.rows,
      clusterStatus: clusterStatus.rows,
    };
  }

  // ── RRV Comparison ────────────────────────────────────────────────────────────

  async compararRrv(payload: { mesas: Array<{ codigoMesa: string; actaRrvId?: string; votos: any }> }) {
    if (!payload?.mesas?.length) return { total: 0, comparaciones: [] };

    const comparaciones: any[] = [];

    for (const entry of payload.mesas) {
      const acta = await dbQuery(this.pool,
        `SELECT ao.id, ao.votos_validos, ao.votos_blancos, ao.votos_nulos, ao.total_votos
         FROM actas_oficiales ao
         JOIN mesas m ON m.id = ao.mesa_id
         WHERE m.codigo_mesa = $1 AND ao.franja = $2
         LIMIT 1`,
        [entry.codigoMesa, FRANJA_DEFAULT],
      );

      if (acta.rows.length === 0) {
        comparaciones.push({ codigoMesa: entry.codigoMesa, estado: 'SIN_ACTA_OFICIAL' });
        continue;
      }

      const oficial = acta.rows[0];
      const campos = ['votos_validos', 'votos_blancos', 'votos_nulos', 'total_votos'];

      for (const campo of campos) {
        const valRrv = this.n(entry.votos[campo]);
        const valOficial = this.n(oficial[campo]);
        const diff = Math.abs(valRrv - valOficial);
        const estado = diff === 0 ? 'COINCIDE' : diff <= 5 ? 'DIFERENCIA_LEVE' : 'INCONSISTENCIA';

        await dbQuery(this.pool,
          `INSERT INTO comparaciones_rrv_oficial
             (codigo_mesa, acta_rrv_id, acta_oficial_id, franja, campo, valor_rrv, valor_oficial, diferencia, estado)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [entry.codigoMesa, entry.actaRrvId || null, oficial.id, FRANJA_DEFAULT, campo, valRrv, valOficial, diff, estado],
        );

        comparaciones.push({
          codigoMesa: entry.codigoMesa, campo, valorRrv: valRrv,
          valorOficial: valOficial, diferencia: diff, estado,
        });
      }
    }

    return { total: comparaciones.length, comparaciones };
  }
}
