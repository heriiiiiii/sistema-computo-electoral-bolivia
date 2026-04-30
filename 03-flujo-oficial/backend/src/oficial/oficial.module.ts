import { Module } from '@nestjs/common';
import { OficialController } from './oficial.controller';
import { OficialService } from './oficial.service';
import { ValidacionService } from './validacion.service';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({
  imports: [AuditoriaModule],
  controllers: [OficialController],
  providers: [OficialService, ValidacionService],
})
export class OficialModule {}
