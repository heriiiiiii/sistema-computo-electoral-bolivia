import { Controller, Post, Body, HttpCode } from '@nestjs/common';
import { CatalogosService } from './catalogos.service';
import { okResponse, errResponse } from '../common/response.util';

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

@Controller('oficial/catalogos')
export class CatalogosController {
  constructor(private readonly svc: CatalogosService) {}

  @Post('territorio')
  @HttpCode(200)
  async loadTerritorio(@Body() body: { rows: any[] }) {
    try {
      if (!body?.rows?.length) {
        return errResponse('rows array is required', 'MISSING_ROWS');
      }
      const result = await this.svc.loadTerritorio(body.rows);
      return okResponse(result, 'Territory catalog loaded');
    } catch (e) {
      return errResponse(errorMessage(e), 'TERRITORIO_ERROR');
    }
  }

  @Post('recintos')
  @HttpCode(200)
  async loadRecintos(@Body() body: { rows: any[] }) {
    try {
      if (!body?.rows?.length) {
        return errResponse('rows array is required', 'MISSING_ROWS');
      }
      const result = await this.svc.loadRecintos(body.rows);
      return okResponse(result, 'Recintos catalog loaded');
    } catch (e) {
      return errResponse(errorMessage(e), 'RECINTOS_ERROR');
    }
  }

  @Post('mesas')
  @HttpCode(200)
  async loadMesas(@Body() body: { rows: any[] }) {
    try {
      if (!body?.rows?.length) {
        return errResponse('rows array is required', 'MISSING_ROWS');
      }
      const result = await this.svc.loadMesas(body.rows);
      return okResponse(result, 'Mesas catalog loaded');
    } catch (e) {
      return errResponse(errorMessage(e), 'MESAS_ERROR');
    }
  }
}
