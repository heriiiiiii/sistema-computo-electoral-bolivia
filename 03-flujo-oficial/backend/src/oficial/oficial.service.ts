import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { createHash } from 'crypto';
import { parse as csvParse } from 'csv-parse/sync';
import { DB_POOL } from '../database/database.module';
import { dbQuery } from '../common/db.util';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ValidacionService } from './validacion.service';
import { LogService } from '../common/log.service';

const FRANJA_DEFAULT = 'PRESIDENTE';

// Detecta si el buffer es UTF-8 válido; si no, lo decodifica como Windows-1252/latin1.
// Esto resuelve los caracteres especiales (tildes, ñ, í) sin importar cómo se exportó el CSV.
function decodeCsvBuffer(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  // El replacement char U+FFFD aparece cuando los bytes no eran UTF-8 válido.
  if (!utf8.includes('�')) return utf8;
  return buf.toString('latin1');
}

@Injectable()
export class OficialService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly auditoria: AuditoriaService,
    private readonly validacion: ValidacionService,
    private readonly logFile: LogService,
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
      // Detecta encoding del CSV: si parece UTF-8 lo decodifica como UTF-8,
      // si no, lo decodifica como Windows-1252/latin1 (Excel exporta así por defecto en es-BO).
      const csvText = decodeCsvBuffer(fileBuffer);
      rows = csvParse(csvText, {
        columns: (header: string[]) => header.map((h, i) => (h && h.trim()) ? h.trim() : `__skip_${i}`),
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
      // La columna 22 sin nombre del CSV de transcripciones se ignora explícitamente.
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
      throw new Error('No hay partidos en la BD (revisar 04-seed-parties-candidates.sql del módulo 01).');
    }

    const recintosPerdidos = new Map<string, { mesas: number; votos: number }>();
    const errorsByCause = new Map<string, number>();
    const observedByRule = new Map<string, number>();

    for (const row of payload.rows) {
      try {
        const estado = await this.processActa(row, franja, parties, payload.usuarioCarga, payload.ipOrigen, payload.importacionId, observedByRule);
        if (estado === 'VALIDADA') result.validadas++;
        else result.observadas++;
      } catch (e) {
        result.erroresCriticos++;
        const msg = e instanceof Error ? e.message : String(e);
        result.errores.push({ row: `${row.codigoRecinto}-${row.nroMesa}`, error: msg });

        // Clasificar la causa para el resumen
        let causa = 'OTRO';
        if (msg.includes('no encontrada') || msg.includes('not found')) causa = 'MESA_NO_ENCONTRADA';
        else if (msg.includes('partidos')) causa = 'SIN_PARTIDOS';
        else if (msg.toLowerCase().includes('duplicate') || msg.includes('unique')) causa = 'DUPLICADO';
        else if (msg.toLowerCase().includes('check')) causa = 'CHECK_CONSTRAINT';
        errorsByCause.set(causa, (errorsByCause.get(causa) || 0) + 1);

        // Log línea-a-línea de TODO error crítico (no sólo mesa no encontrada)
        const sumaP = this.n(row.p1) + this.n(row.p2) + this.n(row.p3) + this.n(row.p4);
        const totalRow = sumaP + this.n(row.votosBlancos) + this.n(row.votosNulos);
        this.logFile.cargaError({
          archivo: 'Transcripciones.csv',
          motivo: `ERROR_CRITICO_${causa}`,
          detalle: {
            codigoRecinto: row.codigoRecinto, nroMesa: row.nroMesa,
            codigoActaCsv: String(row.codigoActaCsv || ''),
            error: msg,
            votosPerdidos: totalRow,
            p1: this.n(row.p1), p2: this.n(row.p2), p3: this.n(row.p3), p4: this.n(row.p4),
            votosBlancos: this.n(row.votosBlancos), votosNulos: this.n(row.votosNulos),
            observaciones: String(row.observaciones || '').trim() || null,
          },
        });

        if (causa === 'MESA_NO_ENCONTRADA') {
          const key = String(row.codigoRecinto || '').trim() || '(sin recinto)';
          const cur = recintosPerdidos.get(key) || { mesas: 0, votos: 0 };
          cur.mesas++; cur.votos += totalRow;
          recintosPerdidos.set(key, cur);
        }
      }
    }

    // Resumen de errores críticos
    if (result.erroresCriticos > 0) {
      const desglose = Object.fromEntries(errorsByCause);
      let topRecintos: any[] = [];
      let mesasTotal = 0, votosTotal = 0;
      if (recintosPerdidos.size > 0) {
        topRecintos = [...recintosPerdidos.entries()]
          .sort((a, b) => b[1].votos - a[1].votos)
          .slice(0, 30)
          .map(([codigoRecinto, v]) => {
            mesasTotal += v.mesas; votosTotal += v.votos;
            return { codigoRecinto, mesasOmitidas: v.mesas, votosPerdidos: v.votos };
          });
      }
      this.logFile.cargaError({
        archivo: 'Transcripciones.csv',
        motivo: 'RESUMEN_ERRORES_CRITICOS',
        detalle: {
          totalCriticos: result.erroresCriticos,
          desglosePorCausa: desglose,
          recintosFaltantes: recintosPerdidos.size,
          mesasOmitidas: mesasTotal,
          votosPerdidos: votosTotal,
          topRecintos,
        },
      });
    }

    // Resumen de OBSERVED actas (qué reglas R1..R5 se rompieron y cuántas veces)
    if (result.observadas > 0) {
      const desglose = Object.fromEntries(
        [...observedByRule.entries()].sort((a, b) => b[1] - a[1])
      );
      this.logFile.inconsistencia({
        codigoMesa: 'BULK',
        actaOficialId: null,
        tipo: 'RESUMEN_OBSERVADAS',
        mensaje: `${result.observadas} actas pasaron a OBSERVADA`,
        severidad: 'MEDIA',
        contexto: { desglosePorRegla: desglose },
      });
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
    observedByRule?: Map<string, number>,
  ): Promise<string> {
    const codigoRecinto = String(row.codigoRecinto || '').trim();
    const nroMesa = this.n(row.nroMesa);
    let codigoMesa = `${codigoRecinto}-${nroMesa}`;

    let mesaRes = await dbQuery(this.pool,
      'SELECT id, cantidad_habilitada FROM mesas WHERE codigo_mesa = $1',
      [codigoMesa],
    );

    // Fallback estricto: si el CSV trae CodigoRecinto truncado, sólo aceptamos el match
    // si hay UN ÚNICO recinto cuyo código empieza así para esa mesa (evita ambigüedad).
    if (mesaRes.rows.length === 0 && codigoRecinto && codigoRecinto.length < 10) {
      const alt = await dbQuery(this.pool,
        `SELECT m.id, m.cantidad_habilitada, m.codigo_mesa
           FROM mesas m
           JOIN recintos r ON r.id = m.recinto_id
          WHERE r.codigo_recinto LIKE $1 AND m.numero_mesa = $2`,
        [`${codigoRecinto}%`, nroMesa],
      );
      if (alt.rows.length === 1) {
        mesaRes = alt;
        codigoMesa = alt.rows[0].codigo_mesa;
      } else if (alt.rows.length > 1) {
        this.logFile.cargaError({
          archivo: 'Transcripciones.csv',
          motivo: 'RECINTO_AMBIGUO',
          detalle: { codigoRecinto, nroMesa, candidatos: alt.rows.length },
        });
      }
    }

    if (mesaRes.rows.length === 0) {
      const sumaP = this.n(row.p1) + this.n(row.p2) + this.n(row.p3) + this.n(row.p4);
      const totalRow = sumaP + this.n(row.votosBlancos) + this.n(row.votosNulos);
      // (no escribimos al log aquí — bulkActas registra UNA línea por error crítico)
      // Registramos como inconsistencia ABIERTA en BD: estas actas NO se computan
      // (no tienen recinto/municipio/depto válido) y deben quedar visibles.
      await dbQuery(this.pool, `
        INSERT INTO inconsistencias
          (origen, codigo_mesa, tipo, descripcion, severidad, estado, detectado_por)
        VALUES ('CSV', $1, 'MESA_NO_ENCONTRADA', $2, 'CRITICA', 'ABIERTA', 'SISTEMA')
      `, [codigoMesa, `Recinto ${codigoRecinto} no existe en RecintosElectorales. Votos no computados: ${totalRow}. Obs: ${String(row.observaciones || '').trim()}`]);
      throw new Error(`Mesa ${codigoMesa} no encontrada (votos NO computados: ${totalRow})`);
    }

    const mesaId: number = mesaRes.rows[0].id;
    const codigoActa = `OF-${codigoRecinto}-${nroMesa}-${franja}`;
    const codigoActaCsv = String(row.codigoActaCsv || '').trim() || null;

    // Validación de horarios provenientes del CSV (rango y consistencia apertura<cierre).
    const aperturaHora = this.n(row.aperturaHora);
    const aperturaMin  = this.n(row.aperturaMinutos);
    const cierreHora   = this.n(row.cierreHora);
    const cierreMin    = this.n(row.cierreMinutos);
    // Validación horaria detallada (H1..H4) la hace el ValidacionService;
    // aquí sólo persistimos los valores crudos que vienen del CSV.

    const voteData = {
      p1: this.n(row.p1), p2: this.n(row.p2), p3: this.n(row.p3), p4: this.n(row.p4),
      votosValidos: this.n(row.votosValidos),
      votosBlancos: this.n(row.votosBlancos),
      votosNulos: this.n(row.votosNulos),
      papeletasAnfora: this.n(row.papeletasAnfora),
      papeletasNoUtilizadas: this.n(row.papeletasNoUtilizadas),
      habilitados: this.n(row.votantesHabilitados),
      aperturaHora, aperturaMinutos: aperturaMin,
      cierreHora,   cierreMinutos: cierreMin,
      observaciones: String(row.observaciones || '').trim(),
    };

    // Sólo guardamos validaciones con problema (ERROR/WARNING). Las OK son ruido.
    const validaciones = this.validacion.validateFailed(voteData);
    const hasErrors = validaciones.some(v => v.resultado === 'ERROR');
    const estado = hasErrors ? 'OBSERVADA' : 'VALIDADA';

    const totalVotos = Math.max(0, voteData.votosValidos) + Math.max(0, voteData.votosBlancos) + Math.max(0, voteData.votosNulos);

    const actaRes = await dbQuery(this.pool,
      `INSERT INTO actas_oficiales
         (mesa_id, csv_importacion_id, codigo_acta, codigo_acta_csv, franja,
          votos_validos, votos_blancos, votos_nulos, total_votos,
          papeletas_en_anfora, papeletas_no_utilizadas,
          apertura_hora, apertura_minutos, cierre_hora, cierre_minutos,
          estado, fuente, usuario_importacion, observacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'CSV',$17,$18)
       ON CONFLICT (codigo_acta) DO UPDATE SET
         codigo_acta_csv = EXCLUDED.codigo_acta_csv,
         estado = EXCLUDED.estado,
         votos_validos = EXCLUDED.votos_validos,
         votos_blancos = EXCLUDED.votos_blancos,
         votos_nulos = EXCLUDED.votos_nulos,
         total_votos = EXCLUDED.total_votos,
         papeletas_en_anfora = EXCLUDED.papeletas_en_anfora,
         papeletas_no_utilizadas = EXCLUDED.papeletas_no_utilizadas,
         apertura_hora = EXCLUDED.apertura_hora,
         apertura_minutos = EXCLUDED.apertura_minutos,
         cierre_hora = EXCLUDED.cierre_hora,
         cierre_minutos = EXCLUDED.cierre_minutos,
         observacion = EXCLUDED.observacion
       RETURNING id`,
      [
        mesaId, importacionId || null, codigoActa, codigoActaCsv, franja,
        Math.max(0, voteData.votosValidos),
        Math.max(0, voteData.votosBlancos),
        Math.max(0, voteData.votosNulos),
        totalVotos,
        Math.max(0, voteData.papeletasAnfora),
        Math.max(0, voteData.papeletasNoUtilizadas),
        aperturaHora, aperturaMin, cierreHora, cierreMin,
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

    // 1 fila en BD por regla rota (auditable), pero UN SOLO log line por acta.
    const errorVals = validaciones.filter(v => v.resultado === 'ERROR');
    for (const v of errorVals) {
      if (observedByRule) observedByRule.set(v.regla, (observedByRule.get(v.regla) || 0) + 1);
      // BD only — no escribimos al archivo aquí.
      await dbQuery(this.pool, `
        INSERT INTO inconsistencias
          (origen, codigo_mesa, acta_oficial_id, tipo, descripcion, severidad, estado, detectado_por)
        VALUES ('CSV', $1, $2, $3, $4, $5, 'ABIERTA', 'SISTEMA')
      `, [codigoMesa, actaId, v.regla, v.mensaje, v.severidad]);
    }
    if (errorVals.length > 0) {
      this.logFile.inconsistencia({
        codigoMesa,
        actaOficialId: actaId,
        tipo: 'OBSERVADA',
        mensaje: `${errorVals.length} regla(s) rotas`,
        severidad: errorVals.some(v => v.severidad === 'CRITICA') ? 'CRITICA' : 'ALTA',
        contexto: {
          reglas: errorVals.map(v => v.regla),
          observacionesCsv: row.observaciones || null,
        },
      });
    }

    // Auditoria
    await this.auditoria.log('actas_oficiales', actaId, usuarioCarga, 'IMPORTAR_ACTA',
      `Acta ${codigoActa} estado=${estado}`, ipOrigen);

    return estado;
  }

  // ── Recalcular acta ──────────────────────────────────────────────────────────
  // Toma P1+P2+P3+P4 como verdad, recalcula votosValidos y totalVotos,
  // re-corre las validaciones y, si todo queda OK, marca la acta como VALIDADA.
  async recalcularActa(actaId: number, usuario: string, ipOrigen: string) {
    const r = await dbQuery(this.pool, `
      SELECT ao.id, ao.codigo_acta, ao.estado, ao.papeletas_en_anfora,
             ao.papeletas_no_utilizadas,
             ao.votos_blancos, ao.votos_nulos,
             ao.apertura_hora, ao.apertura_minutos, ao.cierre_hora, ao.cierre_minutos,
             ao.observacion,
             m.cantidad_habilitada, m.codigo_mesa
      FROM actas_oficiales ao
      JOIN mesas m ON m.id = ao.mesa_id
      WHERE ao.id = $1
    `, [actaId]);
    if (r.rows.length === 0) throw new Error(`Acta ${actaId} no existe`);
    const acta = r.rows[0];

    const votos = await dbQuery(this.pool, `
      SELECT p.codigo, ro.cantidad_votos
      FROM resultados_oficiales ro
      JOIN partidos p ON p.id = ro.partido_id
      WHERE ro.acta_oficial_id = $1
    `, [actaId]);
    const map: Record<string, number> = {};
    for (const v of votos.rows) map[v.codigo] = Number(v.cantidad_votos) || 0;
    const sumaPartidos = (map.P1 || 0) + (map.P2 || 0) + (map.P3 || 0) + (map.P4 || 0);

    const blancos = Number(acta.votos_blancos) || 0;
    const nulos   = Number(acta.votos_nulos)   || 0;
    const total   = sumaPartidos + blancos + nulos;

    const nuevasValidaciones = this.validacion.validate({
      p1: map.P1 || 0, p2: map.P2 || 0, p3: map.P3 || 0, p4: map.P4 || 0,
      votosValidos: sumaPartidos, votosBlancos: blancos, votosNulos: nulos,
      papeletasAnfora: Number(acta.papeletas_en_anfora) || 0,
      papeletasNoUtilizadas: Number(acta.papeletas_no_utilizadas) || 0,
      habilitados: Number(acta.cantidad_habilitada) || 0,
      aperturaHora: Number(acta.apertura_hora) || 0,
      aperturaMinutos: Number(acta.apertura_minutos) || 0,
      cierreHora: Number(acta.cierre_hora) || 0,
      cierreMinutos: Number(acta.cierre_minutos) || 0,
      observaciones: String(acta.observacion || ''),
    });
    const tieneErrores = nuevasValidaciones.some(v => v.resultado === 'ERROR');
    const nuevoEstado = tieneErrores ? 'OBSERVADA' : 'VALIDADA';

    await dbQuery(this.pool, `
      UPDATE actas_oficiales
         SET votos_validos = $1,
             total_votos = $2,
             estado = $3,
             recalculado = TRUE,
             usuario_validacion = $4,
             fecha_validacion = now()
       WHERE id = $5
    `, [sumaPartidos, total, nuevoEstado, usuario || 'WEB_UI', actaId]);

    await dbQuery(this.pool,
      `DELETE FROM validaciones_oficiales WHERE acta_oficial_id = $1`,
      [actaId],
    );
    for (const v of nuevasValidaciones) {
      await this.auditoria.logValidacion(actaId, v.regla, v.resultado, v.mensaje, v.severidad, usuario);
    }

    await this.auditoria.log('actas_oficiales', actaId, usuario, 'RECALCULAR_ACTA',
      `Acta ${acta.codigo_acta}: VotosValidos=${sumaPartidos} (P1+P2+P3+P4), estado=${nuevoEstado}`,
      ipOrigen);

    return {
      actaId, codigoActa: acta.codigo_acta, estadoAnterior: acta.estado,
      estadoNuevo: nuevoEstado, votosValidos: sumaPartidos, totalVotos: total,
    };
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
