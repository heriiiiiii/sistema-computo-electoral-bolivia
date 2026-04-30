import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CatalogosModule } from './catalogos/catalogos.module';
import { OficialModule } from './oficial/oficial.module';

@Module({
  imports: [DatabaseModule, CatalogosModule, OficialModule],
})
export class AppModule {}
