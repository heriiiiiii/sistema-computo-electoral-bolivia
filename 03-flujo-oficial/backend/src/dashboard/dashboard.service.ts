import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DB_POOL } from '../database/database.module';
import { dbQuery } from '../common/db.util';
import { RrvClient } from './rrv.client';

const FRANJA = 'PRESIDENTE';
const ESTADOS_COMPUTABLES = ['VALIDADA', 'OBSERVADA', 'OFICIALIZADA'];

const PARTY_COLORS: Record<string, string> = {
  P1: '#22c55e',
  P2: '#3b82f6',
  P3: '#f59e0b',
  P4: '#14b8a6',
};
const DEFAULT_COLOR = '#64748b';

export type Scope = 'nacional' | 'departamento' | 'municipio' | 'recinto' | 'mesa';

export interface VotosPartido {
  codigo: string;
  nombre: string;
  votos: number;
  color: string;
}

export interface Ganador {
  partido: string | null;
  nombre: string | null;
  votos: number;
  totalVotosScope: number;
  porcentaje: number;
  margenVotos: number;
  margenPorcentual: number;
  empate: boolean;
}

export interface ResultadoScope {
  scope: Scope;
  codigo?: string;
  nombre?: string;
  totalVotos: number;
  votosValidos: number;
  votosBlancos: number;
  votosNulos: number;
  partidos: VotosPartido[];
  ganador: Ganador;
  actasComputadas: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly rrv: RrvClient,
  ) {}

  // ── Helpers ────────────────────────────────────────────────────────────────

  private toInt(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  private colorOf(codigo: string): string {
    return PARTY_COLORS[codigo] || DEFAULT_COLOR;
  }

  private buildGanador(partidos: VotosPartido[], totalVotos: number): Ganador {
    if (partidos.length === 0 || totalVotos === 0) {
      return {
        partido: null, nombre: null, votos: 0,
        totalVotosScope: totalVotos,
        porcentaje: 0, margenVotos: 0, margenPorcentual: 0,
        empate: false,
      };
    }
    const ordenados = [...partidos].sort((a, b) => b.votos - a.votos);
    const ganador = ordenados[0];
    const segundo = ordenados[1] || { votos: 0 } as VotosPartido;
    const empate = ganador.votos > 0 && ganador.votos === segundo.votos;
    const margenVotos = ganador.votos - segundo.votos;
    const total = totalVotos > 0 ? totalVotos : 1;
    return {
      partido: ganador.codigo,
      nombre: ganador.nombre,
      votos: ganador.votos,
      totalVotosScope: totalVotos,
      porcentaje: Math.round((ganador.votos / total) * 1000) / 10,
      margenVotos,
      margenPorcentual: Math.round((margenVotos / total) * 1000) / 10,
      empate,
    };
  }

  private scopeJoinAndWhere(scope: Scope, codigo?: string): { where: string; params: any[] } {
    switch (scope) {
      case 'mesa':
        return { where: `m.codigo_mesa = $1`, params: [codigo] };
      case 'recinto':
        return { where: `r.codigo_recinto = $1`, params: [codigo] };
      case 'municipio':
        return { where: `mun.codigo = $1`, params: [codigo] };
      case 'departamento':
        return { where: `dep.codigo = $1`, params: [codigo] };
      case 'nacional':
      default:
        return { where: `1=1`, params: [] };
    }
  }

  /**
   * Devuelve el resultado oficial agregado para un alcance dado.
   * Hace UN solo paso por la BD para totales por partido,
   * y otra para totales por tipo de voto + actas computadas.
   */
  async resultadosOficial(scope: Scope, codigo?: string): Promise<ResultadoScope> {
    const { where, params } = this.scopeJoinAndWhere(scope, codigo);

    const partidosSql = `
      SELECT p.codigo, p.nombre,
             COALESCE(SUM(ro.cantidad_votos), 0) AS votos
      FROM partidos p
      LEFT JOIN resultados_oficiales ro
             ON ro.partido_id = p.id
            AND ro.franja = '${FRANJA}'
      LEFT JOIN actas_oficiales ao
             ON ao.id = ro.acta_oficial_id
            AND ao.estado = ANY($${params.length + 1}::text[])
            AND ao.franja = '${FRANJA}'
      LEFT JOIN mesas       m   ON m.id  = ao.mesa_id
      LEFT JOIN recintos    r   ON r.id  = m.recinto_id
      LEFT JOIN municipios  mun ON mun.id = r.municipio_id
      LEFT JOIN provincias  pr  ON pr.id  = mun.provincia_id
      LEFT JOIN departamentos dep ON dep.id = pr.departamento_id
      WHERE ${where}
      GROUP BY p.id, p.codigo, p.nombre
      ORDER BY p.codigo
    `;

    // LEFT JOIN para no descartar actas con cadena territorial incompleta cuando
    // scope=nacional. Para scopes territoriales el WHERE sobre dep/mun/r/m hace
    // su propio filtro y los nulls quedan fuera.
    const totalesSql = `
      SELECT
        COUNT(DISTINCT ao.id)                                   AS actas,
        COALESCE(SUM(ao.votos_validos), 0)                      AS validos,
        COALESCE(SUM(ao.votos_blancos), 0)                      AS blancos,
        COALESCE(SUM(ao.votos_nulos),   0)                      AS nulos,
        COALESCE(SUM(ao.total_votos),   0)                      AS total
      FROM actas_oficiales ao
      LEFT JOIN mesas       m   ON m.id  = ao.mesa_id
      LEFT JOIN recintos    r   ON r.id  = m.recinto_id
      LEFT JOIN municipios  mun ON mun.id = r.municipio_id
      LEFT JOIN provincias  pr  ON pr.id  = mun.provincia_id
      LEFT JOIN departamentos dep ON dep.id = pr.departamento_id
      WHERE ao.estado = ANY($${params.length + 1}::text[])
        AND ao.franja = '${FRANJA}'
        AND ${where}
    `;

    const nombreSql = this.scopeNameQuery(scope);

    const [partidosRes, totalesRes, nombreRes] = await Promise.all([
      dbQuery(this.pool, partidosSql, [...params, ESTADOS_COMPUTABLES]),
      dbQuery(this.pool, totalesSql,  [...params, ESTADOS_COMPUTABLES]),
      nombreSql ? dbQuery(this.pool, nombreSql.sql, nombreSql.params(codigo)) : Promise.resolve(null),
    ]);

    const partidos: VotosPartido[] = partidosRes.rows.map(r => ({
      codigo: r.codigo,
      nombre: r.nombre,
      votos: this.toInt(r.votos),
      color: this.colorOf(r.codigo),
    }));

    const t = totalesRes.rows[0];
    const totalVotos = this.toInt(t.total);

    return {
      scope,
      codigo: codigo,
      nombre: nombreRes ? (nombreRes.rows[0]?.nombre ?? undefined) : undefined,
      totalVotos,
      votosValidos: this.toInt(t.validos),
      votosBlancos: this.toInt(t.blancos),
      votosNulos:   this.toInt(t.nulos),
      partidos,
      ganador: this.buildGanador(partidos, totalVotos),
      actasComputadas: this.toInt(t.actas),
    };
  }

  private scopeNameQuery(scope: Scope): { sql: string; params: (c?: string) => any[] } | null {
    switch (scope) {
      case 'mesa':
        return {
          sql: `SELECT codigo_mesa AS nombre FROM mesas WHERE codigo_mesa = $1`,
          params: c => [c],
        };
      case 'recinto':
        return {
          sql: `SELECT nombre FROM recintos WHERE codigo_recinto = $1`,
          params: c => [c],
        };
      case 'municipio':
        return {
          sql: `SELECT nombre FROM municipios WHERE codigo = $1`,
          params: c => [c],
        };
      case 'departamento':
        return {
          sql: `SELECT nombre FROM departamentos WHERE codigo = $1`,
          params: c => [c],
        };
      default:
        return null;
    }
  }

  // ── Resumen nacional (RRV + Oficial side by side) ─────────────────────────

  async resumenNacional() {
    const [oficial, rrv] = await Promise.all([
      this.resultadosOficial('nacional'),
      this.rrv.resumen(),
    ]);

    const rrvTotal = this.toInt(rrv?.totalVotos);
    const ofiTotal = oficial.totalVotos;

    return {
      ultimaActualizacion: new Date().toISOString(),
      rrv: {
        disponible: !!rrv,
        totalVotos:   rrvTotal,
        votosValidos: this.toInt(rrv?.votosValidos),
        votosBlancos: this.toInt(rrv?.votosBlancos),
        votosNulos:   this.toInt(rrv?.votosNulos),
        actasRecibidas:  this.toInt(rrv?.actasRecibidas),
        actasValidadas:  this.toInt(rrv?.actasValidadas),
        actasSospechosas:this.toInt(rrv?.actasSospechosas),
        actasRechazadas: this.toInt(rrv?.actasRechazadas),
        actasPendientes: this.toInt(rrv?.actasPendientes),
      },
      oficial: {
        totalVotos:   oficial.totalVotos,
        votosValidos: oficial.votosValidos,
        votosBlancos: oficial.votosBlancos,
        votosNulos:   oficial.votosNulos,
        actasComputadas: oficial.actasComputadas,
        partidos: oficial.partidos,
        ganador:  oficial.ganador,
      },
      diferencias: {
        totalVotos:   rrvTotal - ofiTotal,
        cobertura:    rrvTotal > 0 ? Math.round((ofiTotal / rrvTotal) * 1000) / 10 : 0,
      },
    };
  }

  // ── Comparacion RRV vs Oficial por partido ────────────────────────────────

  async comparacion() {
    const [oficial, rrvCand] = await Promise.all([
      this.resultadosOficial('nacional'),
      this.rrv.resultadosCandidatos(),
    ]);

    const rrvByCodigo = new Map<string, { nombre: string; votos: number; color?: string }>();
    for (const c of rrvCand?.candidatos || []) {
      rrvByCodigo.set(c.partidoCodigo, {
        nombre: c.partidoNombre,
        votos: this.toInt(c.totalVotos),
        color: c.color,
      });
    }
    const ofiByCodigo = new Map<string, VotosPartido>(
      oficial.partidos.map(p => [p.codigo, p])
    );

    const codigos = Array.from(new Set([...rrvByCodigo.keys(), ...ofiByCodigo.keys()])).sort();

    let totalRrv = 0;
    let totalOfi = 0;

    const candidatos = codigos.map(codigo => {
      const rrv = rrvByCodigo.get(codigo);
      const ofi = ofiByCodigo.get(codigo);
      const votosRRV     = this.toInt(rrv?.votos);
      const votosOficial = this.toInt(ofi?.votos);
      const diferencia   = votosRRV - votosOficial;
      const base         = votosRRV > 0 ? votosRRV : votosOficial > 0 ? votosOficial : 1;
      const diferenciaPorcentual = Math.round((Math.abs(diferencia) / base) * 1000) / 10;

      let estado: 'COINCIDE' | 'DIFERENCIA_LEVE' | 'INCONSISTENCIA' = 'COINCIDE';
      if (diferenciaPorcentual > 5)      estado = 'INCONSISTENCIA';
      else if (diferenciaPorcentual > 0) estado = 'DIFERENCIA_LEVE';

      totalRrv += votosRRV;
      totalOfi += votosOficial;

      return {
        partido: codigo,
        candidato: rrv?.nombre || ofi?.nombre || `Partido ${codigo}`,
        color: rrv?.color || ofi?.color || this.colorOf(codigo),
        votosRRV,
        votosOficial,
        diferencia,
        diferenciaPorcentual,
        estado,
      };
    });

    const diferenciaTotal = totalRrv - totalOfi;
    const baseTotal = totalRrv > 0 ? totalRrv : totalOfi > 0 ? totalOfi : 1;
    const diferenciaPorcentualTotal = Math.round((Math.abs(diferenciaTotal) / baseTotal) * 1000) / 10;

    let estadoGeneral: 'COINCIDE' | 'DIFERENCIA_LEVE' | 'INCONSISTENCIA' | 'SIN_DATO' = 'SIN_DATO';
    if (totalRrv === 0 && totalOfi === 0) estadoGeneral = 'SIN_DATO';
    else if (diferenciaPorcentualTotal > 5) estadoGeneral = 'INCONSISTENCIA';
    else if (diferenciaPorcentualTotal > 0) estadoGeneral = 'DIFERENCIA_LEVE';
    else estadoGeneral = 'COINCIDE';

    return {
      totalVotosRRV: totalRrv,
      totalVotosOficial: totalOfi,
      diferenciaTotal,
      diferenciaPorcentualTotal,
      estado: estadoGeneral,
      candidatos,
      integracionOficial: !!rrvCand,
    };
  }

  // ── Inconsistencias (oficial + RRV) ────────────────────────────────────────

  async inconsistencias(limit = 100) {
    const [pgRes, rrvRes] = await Promise.all([
      dbQuery(this.pool, `
        SELECT id, origen, codigo_mesa, acta_oficial_id, tipo, descripcion,
               severidad, estado, detectado_por, fecha_deteccion
        FROM inconsistencias
        ORDER BY fecha_deteccion DESC
        LIMIT $1
      `, [limit]),
      this.rrv.inconsistencias(limit),
    ]);

    const oficial = pgRes.rows.map((r: any) => ({
      id: `OF-INC-${r.id}`,
      origen: r.origen || 'OFICIAL',
      tipo: r.tipo,
      severidad: r.severidad,
      estado: r.estado,
      codigoMesa: r.codigo_mesa || 'SIN_MESA',
      descripcion: r.descripcion,
      fecha: r.fecha_deteccion,
      departamento: '-',
      municipio: '-',
    }));

    const rrv = (rrvRes?.inconsistencias || []).map((it: any) => ({
      ...it,
      origen: it.origen || 'RRV',
    }));

    return {
      total: oficial.length + rrv.length,
      oficial,
      rrv,
    };
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async health() {
    let pgOk = false;
    let pgError: string | null = null;
    let pgLatencyMs = 0;

    try {
      const start = Date.now();
      await dbQuery(this.pool, 'SELECT 1');
      pgLatencyMs = Date.now() - start;
      pgOk = true;
    } catch (e: any) {
      pgError = e?.message || String(e);
    }

    const rrvHealth = await this.rrv.health();

    return {
      oficial: {
        motor: 'PostgreSQL',
        ok: pgOk,
        latenciaMs: pgLatencyMs,
        error: pgError,
      },
      rrv: {
        motor: 'MongoDB',
        ok: !!rrvHealth,
        detalle: rrvHealth,
      },
    };
  }

  // ── Mapa de departamentos (para futura conexion del mapa) ────────────────

  async mapaDepartamentos() {
    const totalesSql = `
      SELECT dep.codigo, dep.nombre,
             COUNT(DISTINCT ao.id)                AS actas,
             COALESCE(SUM(ao.total_votos), 0)     AS total_votos
      FROM departamentos dep
      LEFT JOIN provincias pr  ON pr.departamento_id = dep.id
      LEFT JOIN municipios mun ON mun.provincia_id   = pr.id
      LEFT JOIN recintos   r   ON r.municipio_id     = mun.id
      LEFT JOIN mesas      m   ON m.recinto_id       = r.id
      LEFT JOIN actas_oficiales ao
             ON ao.mesa_id = m.id
            AND ao.estado = ANY($1::text[])
            AND ao.franja = '${FRANJA}'
      GROUP BY dep.id, dep.codigo, dep.nombre
      ORDER BY dep.nombre
    `;

    const partidosSql = `
      SELECT dep.codigo AS dep_codigo, p.codigo AS partido, p.nombre AS partido_nombre,
             COALESCE(SUM(ro.cantidad_votos), 0) AS votos
      FROM departamentos dep
      LEFT JOIN provincias pr  ON pr.departamento_id = dep.id
      LEFT JOIN municipios mun ON mun.provincia_id   = pr.id
      LEFT JOIN recintos   r   ON r.municipio_id     = mun.id
      LEFT JOIN mesas      m   ON m.recinto_id       = r.id
      LEFT JOIN actas_oficiales ao
             ON ao.mesa_id = m.id
            AND ao.estado = ANY($1::text[])
            AND ao.franja = '${FRANJA}'
      LEFT JOIN resultados_oficiales ro
             ON ro.acta_oficial_id = ao.id
            AND ro.franja = '${FRANJA}'
      JOIN partidos p ON p.id = ro.partido_id
      GROUP BY dep.id, dep.codigo, p.codigo, p.nombre
      ORDER BY dep.nombre, p.codigo
    `;

    const [tot, parts] = await Promise.all([
      dbQuery(this.pool, totalesSql, [ESTADOS_COMPUTABLES]),
      dbQuery(this.pool, partidosSql, [ESTADOS_COMPUTABLES]),
    ]);

    const partsByDep = new Map<string, VotosPartido[]>();
    for (const row of parts.rows) {
      const arr = partsByDep.get(row.dep_codigo) || [];
      arr.push({
        codigo: row.partido,
        nombre: row.partido_nombre,
        votos: this.toInt(row.votos),
        color: this.colorOf(row.partido),
      });
      partsByDep.set(row.dep_codigo, arr);
    }

    return tot.rows.map((r: any) => {
      const partidos = partsByDep.get(r.codigo) || [];
      const totalVotos = this.toInt(r.total_votos);
      const ganador = this.buildGanador(partidos, totalVotos);
      return {
        codigo: r.codigo,
        nombre: r.nombre,
        actasComputadas: this.toInt(r.actas),
        totalVotos,
        partidos,
        ganador,
      };
    });
  }
}
