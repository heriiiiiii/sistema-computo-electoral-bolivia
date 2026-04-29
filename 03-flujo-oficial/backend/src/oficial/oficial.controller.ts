import {
  Controller, Post, Get, Body, Param, Query,
  UseInterceptors, UploadedFile, HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { OficialService } from './oficial.service';
import { okResponse, errResponse } from '../common/response.util';

@Controller('oficial')
export class OficialController {
  constructor(private readonly svc: OficialService) {}

  // POST /api/oficial/csv
  @Post('csv')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('archivo', { storage: memoryStorage() }))
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body('usuarioCarga') usuarioCarga: string,
    @Body('ipOrigen') ipOrigen: string,
  ) {
    if (!file) return errResponse('archivo field is required', 'MISSING_FILE');
    try {
      const result = await this.svc.importCsv(file.buffer, file.originalname, usuarioCarga, ipOrigen);
      return okResponse(result, 'CSV imported');
    } catch (e) {
      return errResponse(e.message, 'CSV_IMPORT_ERROR');
    }
  }

  // POST /api/oficial/actas/bulk
  @Post('actas/bulk')
  @HttpCode(200)
  async bulkActas(@Body() body: any) {
    if (!body?.rows?.length) return errResponse('rows array is required', 'MISSING_ROWS');
    try {
      const result = await this.svc.bulkActas({
        rows: body.rows,
        franja: body.franja,
        usuarioCarga: body.usuarioCarga,
        ipOrigen: body.ipOrigen,
        importacionId: body.importacionId,
      });
      return okResponse(result, 'Bulk actas processed');
    } catch (e) {
      return errResponse(e.message, 'BULK_ACTAS_ERROR');
    }
  }

  // GET /api/oficial/actas
  @Get('actas')
  async getActas(
    @Query('limit') limit: string,
    @Query('offset') offset: string,
    @Query('estado') estado: string,
  ) {
    try {
      const result = await this.svc.getActas(
        parseInt(limit) || 100,
        parseInt(offset) || 0,
        estado || undefined,
      );
      return okResponse(result, 'Actas retrieved');
    } catch (e) {
      return errResponse(e.message, 'GET_ACTAS_ERROR');
    }
  }

  // GET /api/oficial/actas/:id
  @Get('actas/:id')
  async getActa(@Param('id') id: string) {
    try {
      const acta = await this.svc.getActa(parseInt(id));
      if (!acta) return errResponse('Acta not found', 'NOT_FOUND');
      return okResponse(acta, 'Acta retrieved');
    } catch (e) {
      return errResponse(e.message, 'GET_ACTA_ERROR');
    }
  }

  // GET /api/oficial/importaciones
  @Get('importaciones')
  async getImportaciones() {
    try {
      const data = await this.svc.getImportaciones();
      return okResponse(data, 'Importaciones retrieved');
    } catch (e) {
      return errResponse(e.message, 'GET_IMPORTACIONES_ERROR');
    }
  }

  // GET /api/oficial/auditoria
  @Get('auditoria')
  async getAuditoria(@Query('limit') limit: string) {
    try {
      const data = await this.svc.getAuditoria(parseInt(limit) || 100);
      return okResponse(data, 'Auditoria retrieved');
    } catch (e) {
      return errResponse(e.message, 'GET_AUDITORIA_ERROR');
    }
  }

  // GET /api/oficial/validaciones
  @Get('validaciones')
  async getValidaciones(@Query('actaId') actaId: string) {
    try {
      const data = await this.svc.getValidaciones(actaId ? parseInt(actaId) : undefined);
      return okResponse(data, 'Validaciones retrieved');
    } catch (e) {
      return errResponse(e.message, 'GET_VALIDACIONES_ERROR');
    }
  }

  // GET /api/oficial/resumen
  @Get('resumen')
  async getResumen() {
    try {
      const data = await this.svc.getResumen();
      return okResponse(data, 'Resumen retrieved');
    } catch (e) {
      return errResponse(e.message, 'GET_RESUMEN_ERROR');
    }
  }

  // POST /api/oficial/comparar-rrv
  @Post('comparar-rrv')
  @HttpCode(200)
  async compararRrv(@Body() body: any) {
    try {
      const result = await this.svc.compararRrv(body);
      return okResponse(result, 'RRV comparison completed');
    } catch (e) {
      return errResponse(e.message, 'COMPARAR_RRV_ERROR');
    }
  }
}
