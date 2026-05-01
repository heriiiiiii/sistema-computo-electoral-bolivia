import { Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';
import { LogService } from '../common/log.service';

@Module({
  providers: [AuditoriaService, LogService],
  exports: [AuditoriaService, LogService],
})
export class AuditoriaModule {}
