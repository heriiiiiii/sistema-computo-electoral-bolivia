import { Controller, Get, Param, Query } from '@nestjs/common';
import { DashboardService, Scope } from './dashboard.service';
import { okResponse, errResponse } from '../common/response.util';

function err(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const VALID_SCOPES: Scope[] = ['nacional', 'departamento', 'municipio', 'recinto', 'mesa'];

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  // GET /api/dashboard/resumen-nacional
  @Get('resumen-nacional')
  async resumenNacional() {
    try {
      const data = await this.svc.resumenNacional();
      return okResponse(data, 'Resumen nacional');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_RESUMEN_ERROR');
    }
  }

  // GET /api/dashboard/resultados?scope=nacional|departamento|...&codigo=...
  @Get('resultados')
  async resultados(@Query('scope') scope: string, @Query('codigo') codigo?: string) {
    const sc = (scope || 'nacional') as Scope;
    if (!VALID_SCOPES.includes(sc)) {
      return errResponse(`scope invalido: ${scope}`, 'INVALID_SCOPE');
    }
    if (sc !== 'nacional' && !codigo) {
      return errResponse(`codigo requerido para scope=${sc}`, 'MISSING_CODIGO');
    }
    try {
      const data = await this.svc.resultadosOficial(sc, codigo);
      return okResponse(data, 'Resultados por alcance');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_RESULTADOS_ERROR');
    }
  }

  // GET /api/dashboard/ganador/nacional
  @Get('ganador/nacional')
  async ganadorNacional() {
    try {
      const r = await this.svc.resultadosOficial('nacional');
      return okResponse({ scope: 'nacional', ganador: r.ganador, totalVotos: r.totalVotos, partidos: r.partidos }, 'Ganador nacional');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_GANADOR_ERROR');
    }
  }

  // GET /api/dashboard/ganador/mesa/:codigoMesa
  @Get('ganador/mesa/:codigoMesa')
  async ganadorMesa(@Param('codigoMesa') codigo: string) {
    return this.ganadorScope('mesa', codigo);
  }

  // GET /api/dashboard/ganador/recinto/:codigoRecinto
  @Get('ganador/recinto/:codigoRecinto')
  async ganadorRecinto(@Param('codigoRecinto') codigo: string) {
    return this.ganadorScope('recinto', codigo);
  }

  // GET /api/dashboard/ganador/municipio/:codigoMunicipio
  @Get('ganador/municipio/:codigoMunicipio')
  async ganadorMunicipio(@Param('codigoMunicipio') codigo: string) {
    return this.ganadorScope('municipio', codigo);
  }

  // GET /api/dashboard/ganador/departamento/:codigoDepartamento
  @Get('ganador/departamento/:codigoDepartamento')
  async ganadorDepartamento(@Param('codigoDepartamento') codigo: string) {
    return this.ganadorScope('departamento', codigo);
  }

  private async ganadorScope(scope: Scope, codigo: string) {
    try {
      const r = await this.svc.resultadosOficial(scope, codigo);
      if (r.totalVotos === 0 && r.actasComputadas === 0) {
        return errResponse(`Sin actas computadas para ${scope}=${codigo}`, 'SIN_DATOS', {
          scope, codigo, ganador: null,
        });
      }
      return okResponse({
        scope, codigo,
        nombre: r.nombre,
        ganador: r.ganador,
        totalVotos: r.totalVotos,
        actasComputadas: r.actasComputadas,
        partidos: r.partidos,
      }, `Ganador ${scope}`);
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_GANADOR_ERROR');
    }
  }

  // GET /api/dashboard/comparacion
  @Get('comparacion')
  async comparacion() {
    try {
      const data = await this.svc.comparacion();
      return okResponse(data, 'Comparacion RRV vs Oficial');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_COMPARACION_ERROR');
    }
  }

  // GET /api/dashboard/inconsistencias
  @Get('inconsistencias')
  async inconsistencias(@Query('limit') limit?: string) {
    try {
      const data = await this.svc.inconsistencias(parseInt(limit || '100', 10));
      return okResponse(data, 'Inconsistencias');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_INCONSISTENCIAS_ERROR');
    }
  }

  // GET /api/dashboard/health
  @Get('health')
  async health() {
    try {
      const data = await this.svc.health();
      return okResponse(data, 'Health');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_HEALTH_ERROR');
    }
  }

  // GET /api/dashboard/mapa/departamentos
  @Get('mapa/departamentos')
  async mapaDepartamentos() {
    try {
      const data = await this.svc.mapaDepartamentos();
      return okResponse({ departamentos: data }, 'Mapa de departamentos');
    } catch (e) {
      return errResponse(err(e), 'DASHBOARD_MAPA_ERROR');
    }
  }
}
