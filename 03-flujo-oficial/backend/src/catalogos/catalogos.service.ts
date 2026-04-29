import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { DB_POOL } from '../database/database.module';
import { dbQuery } from '../common/db.util';

@Injectable()
export class CatalogosService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  private async findOrCreateDept(nombre: string, codigoTerr: string): Promise<number> {
    let r = await dbQuery(this.pool, 'SELECT id FROM departamentos WHERE nombre = $1', [nombre]);
    if (r.rows.length > 0) return r.rows[0].id;

    const codigo = 'N' + codigoTerr.charAt(0);
    r = await dbQuery(this.pool,
      `INSERT INTO departamentos (codigo, nombre) VALUES ($1, $2)
       ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [codigo, nombre],
    );
    if (r.rows.length > 0) return r.rows[0].id;

    r = await dbQuery(this.pool, 'SELECT id FROM departamentos WHERE nombre = $1', [nombre]);
    if (r.rows.length > 0) return r.rows[0].id;

    r = await dbQuery(this.pool,
      `INSERT INTO departamentos (codigo, nombre) VALUES ($1, $2) RETURNING id`,
      [codigo + '_' + Date.now(), nombre],
    );
    return r.rows[0].id;
  }

  private async findOrCreateProvincia(deptId: number, nombre: string, codigoTerr: string): Promise<number> {
    let r = await dbQuery(this.pool,
      'SELECT id FROM provincias WHERE departamento_id = $1 AND nombre = $2',
      [deptId, nombre],
    );
    if (r.rows.length > 0) return r.rows[0].id;

    const codigo = codigoTerr.substring(0, 3);
    r = await dbQuery(this.pool,
      `INSERT INTO provincias (departamento_id, codigo, nombre) VALUES ($1, $2, $3)
       ON CONFLICT (codigo) DO NOTHING RETURNING id`,
      [deptId, codigo, nombre],
    );
    if (r.rows.length > 0) return r.rows[0].id;

    r = await dbQuery(this.pool,
      'SELECT id FROM provincias WHERE departamento_id = $1 AND nombre = $2',
      [deptId, nombre],
    );
    if (r.rows.length > 0) return r.rows[0].id;

    r = await dbQuery(this.pool,
      `INSERT INTO provincias (departamento_id, codigo, nombre) VALUES ($1, $2, $3) RETURNING id`,
      [deptId, codigo + '_' + Date.now(), nombre],
    );
    return r.rows[0].id;
  }

  async loadTerritorio(rows: any[]): Promise<{ total: number; insertadas: number; errores: any[] }> {
    const deptCache = new Map<string, number>();
    const provCache = new Map<string, number>();
    let insertadas = 0;
    const errores: any[] = [];

    for (const row of rows) {
      try {
        const deptNombre = String(row.Departamento || '').trim();
        // CSV columns are swapped: col "Municipio" = Provincia, col "Provincia" = Municipio
        const provNombre = String(row.Municipio || '').trim();
        const muniNombre = String(row.Provincia || '').trim();
        const codigoTerr = String(row.CodigoTerritorial || '').trim();

        if (!deptNombre || !provNombre || !muniNombre || !codigoTerr) continue;

        let deptId = deptCache.get(deptNombre);
        if (!deptId) {
          deptId = await this.findOrCreateDept(deptNombre, codigoTerr);
          deptCache.set(deptNombre, deptId);
        }

        const provKey = `${deptId}:${provNombre}`;
        let provId = provCache.get(provKey);
        if (!provId) {
          provId = await this.findOrCreateProvincia(deptId, provNombre, codigoTerr);
          provCache.set(provKey, provId);
        }

        await dbQuery(this.pool,
          `INSERT INTO municipios (provincia_id, codigo, nombre) VALUES ($1, $2, $3)
           ON CONFLICT (codigo) DO NOTHING`,
          [provId, codigoTerr, muniNombre],
        );
        insertadas++;
      } catch (e) {
        errores.push({ row, error: e.message });
      }
    }

    return { total: rows.length, insertadas, errores };
  }

  async loadRecintos(rows: any[]): Promise<{ total: number; insertados: number; errores: any[] }> {
    let insertados = 0;
    const errores: any[] = [];

    for (const row of rows) {
      try {
        const codigoTerr = String(row.CodigoTerritorial || '').trim();
        const codigoRecinto = String(row.CodigoRecinto || '').trim();
        const nombre = String(row.RecintoNombre || '').trim();
        const direccion = String(row.RecintoDireccion || '').trim();
        const numMesas = parseInt(row.NumMesas) || 0;

        if (!codigoRecinto || !nombre) continue;

        const muniRes = await dbQuery(this.pool,
          'SELECT id FROM municipios WHERE codigo = $1',
          [codigoTerr],
        );
        const municipioId = muniRes.rows.length > 0 ? muniRes.rows[0].id : null;

        await dbQuery(this.pool,
          `INSERT INTO recintos (codigo_recinto, codigo_territorial, municipio_id, nombre, direccion, cantidad_mesas)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (codigo_recinto) DO UPDATE
             SET nombre = EXCLUDED.nombre,
                 direccion = EXCLUDED.direccion,
                 cantidad_mesas = EXCLUDED.cantidad_mesas`,
          [codigoRecinto, codigoTerr, municipioId, nombre, direccion, numMesas],
        );
        insertados++;
      } catch (e) {
        errores.push({ row, error: e.message });
      }
    }

    return { total: rows.length, insertados, errores };
  }

  async loadMesas(rows: any[]): Promise<{ total: number; insertadas: number; errores: any[] }> {
    let insertadas = 0;
    const errores: any[] = [];

    for (const row of rows) {
      try {
        const codigoRecinto = String(row.CodigoRecinto || '').trim();
        const nroMesa = parseInt(row.NroMesa) || 0;
        const habilitados = parseInt(row.VotantesHabilitados) || 0;

        if (!codigoRecinto || !nroMesa) continue;

        const recintoRes = await dbQuery(this.pool,
          'SELECT id FROM recintos WHERE codigo_recinto = $1',
          [codigoRecinto],
        );
        if (recintoRes.rows.length === 0) {
          errores.push({ row, error: `Recinto ${codigoRecinto} not found` });
          continue;
        }
        const recintoId = recintoRes.rows[0].id;
        const codigoMesa = `${codigoRecinto}-${nroMesa}`;

        await dbQuery(this.pool,
          `INSERT INTO mesas (codigo_mesa, numero_mesa, recinto_id, cantidad_habilitada)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (codigo_mesa) DO UPDATE
             SET cantidad_habilitada = EXCLUDED.cantidad_habilitada`,
          [codigoMesa, nroMesa, recintoId, habilitados],
        );
        insertadas++;
      } catch (e) {
        errores.push({ row, error: e.message });
      }
    }

    return { total: rows.length, insertadas, errores };
  }
}
